from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson

NUM_OUTCOMES = 3
DEFAULT_HALF_LIFE_DAYS = 550.0
MAX_GOALS = 8
PROBABILITY_EPSILON = 1e-12
COLD_START_ATTACK_ADJUSTMENT = -0.15
COLD_START_DEFENCE_ADJUSTMENT = -0.15


@dataclass
class DixonColesParameters:
    teams: list[str]
    attack: list[float]
    defence: list[float]
    home_advantage: float
    rho: float
    half_life_days: float
    log_likelihood: float

    def team_index(self) -> dict[str, int]:
        return {team: index for index, team in enumerate(self.teams)}


def time_decay_weights(kickoffs: pd.Series, half_life_days: float = DEFAULT_HALF_LIFE_DAYS) -> np.ndarray:
    timestamps = pd.to_datetime(kickoffs, errors="coerce", utc=True, format="mixed")
    latest = timestamps.max()
    days_ago = (latest - timestamps).dt.total_seconds().to_numpy() / 86_400
    days_ago = np.where(np.isfinite(days_ago), days_ago, 2.0 * half_life_days)
    if half_life_days <= 0:
        return np.ones(len(timestamps), dtype=float)
    return np.exp(-np.log(2.0) * days_ago / half_life_days)


def dixon_coles_sample_weights(
    frame: pd.DataFrame,
    *,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    sample_weight_column: str = "sample_weight",
) -> np.ndarray:
    weights = time_decay_weights(frame["kickoff_time"], half_life_days=half_life_days)
    if sample_weight_column not in frame.columns:
        return weights
    competition = pd.to_numeric(frame[sample_weight_column], errors="coerce").fillna(1.0)
    return weights * competition.clip(lower=0.0).to_numpy(dtype=float)


def dixon_coles_tau(
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    home_lambda: np.ndarray,
    away_lambda: np.ndarray,
    rho: float,
) -> np.ndarray:
    tau = np.ones(len(home_goals), dtype=float)
    mask_00 = (home_goals == 0) & (away_goals == 0)
    mask_10 = (home_goals == 1) & (away_goals == 0)
    mask_01 = (home_goals == 0) & (away_goals == 1)
    mask_11 = (home_goals == 1) & (away_goals == 1)
    tau[mask_00] = 1.0 - (home_lambda[mask_00] * away_lambda[mask_00] * rho)
    tau[mask_10] = 1.0 + (away_lambda[mask_10] * rho)
    tau[mask_01] = 1.0 + (home_lambda[mask_01] * rho)
    tau[mask_11] = 1.0 - rho
    return np.clip(tau, PROBABILITY_EPSILON, None)


def _team_maps(home_keys: Iterable[Any], away_keys: Iterable[Any]) -> tuple[list[str], np.ndarray, np.ndarray]:
    teams = sorted({str(key) for key in list(home_keys) + list(away_keys)})
    index = {team: position for position, team in enumerate(teams)}
    home_index = np.array([index[str(key)] for key in home_keys], dtype=int)
    away_index = np.array([index[str(key)] for key in away_keys], dtype=int)
    return teams, home_index, away_index


def unpack_parameters(values: np.ndarray, team_count: int) -> tuple[np.ndarray, np.ndarray, float, float]:
    attack = np.concatenate([values[: team_count - 1], [-np.sum(values[: team_count - 1])]])
    defence = values[team_count - 1 : 2 * team_count - 1]
    home_advantage = float(values[-2])
    rho = float(values[-1])
    return attack, defence, home_advantage, rho


def pack_parameters(attack: np.ndarray, defence: np.ndarray, home_advantage: float, rho: float) -> np.ndarray:
    return np.concatenate([attack[:-1], defence, np.array([home_advantage, rho], dtype=float)])


def _lambdas(
    attack: np.ndarray,
    defence: np.ndarray,
    home_advantage: float,
    home_index: np.ndarray,
    away_index: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    home_lambda = np.exp(attack[home_index] - defence[away_index] + home_advantage)
    away_lambda = np.exp(attack[away_index] - defence[home_index])
    return np.clip(home_lambda, 1e-6, 20.0), np.clip(away_lambda, 1e-6, 20.0)


def weighted_log_likelihood(
    values: np.ndarray,
    home_index: np.ndarray,
    away_index: np.ndarray,
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    weights: np.ndarray,
) -> float:
    team_count = int(max(home_index.max(), away_index.max()) + 1)
    attack, defence, home_advantage, rho = unpack_parameters(values, team_count)
    rho = float(np.clip(rho, -0.2, 0.2))
    home_lambda, away_lambda = _lambdas(attack, defence, home_advantage, home_index, away_index)
    tau = dixon_coles_tau(home_goals, away_goals, home_lambda, away_lambda, rho)
    log_prob = (
        np.log(tau)
        + poisson.logpmf(home_goals, home_lambda)
        + poisson.logpmf(away_goals, away_lambda)
    )
    return float(-np.sum(weights * log_prob))


def fit_dixon_coles(
    frame: pd.DataFrame,
    *,
    home_key_column: str = "home_team_key",
    away_key_column: str = "away_team_key",
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    initial: DixonColesParameters | None = None,
) -> DixonColesParameters:
    working = frame.copy()
    if home_key_column not in working.columns:
        working[home_key_column] = working["home_team"]
    if away_key_column not in working.columns:
        working[away_key_column] = working["away_team"]
    working = working.loc[
        working[home_key_column].notna()
        & working[away_key_column].notna()
        & pd.to_numeric(working["home_score"], errors="coerce").notna()
        & pd.to_numeric(working["away_score"], errors="coerce").notna()
    ].copy()
    if working.empty:
        raise ValueError("Dixon-Coles requires finished matches with team keys and scores.")

    teams, home_index, away_index = _team_maps(working[home_key_column], working[away_key_column])
    home_goals = np.clip(pd.to_numeric(working["home_score"], errors="coerce").to_numpy(dtype=float), 0, MAX_GOALS)
    away_goals = np.clip(pd.to_numeric(working["away_score"], errors="coerce").to_numpy(dtype=float), 0, MAX_GOALS)
    weights = dixon_coles_sample_weights(working, half_life_days=half_life_days)

    team_count = len(teams)
    parameter_count = 2 * team_count + 1
    if initial is not None and initial.teams == teams:
        start = pack_parameters(
            np.asarray(initial.attack, dtype=float),
            np.asarray(initial.defence, dtype=float),
            initial.home_advantage,
            initial.rho,
        )
    else:
        start = np.zeros(parameter_count, dtype=float)
        start[-2] = 0.25

    result = minimize(
        weighted_log_likelihood,
        start,
        args=(home_index, away_index, home_goals, away_goals, weights),
        method="L-BFGS-B",
        bounds=[(None, None)] * (parameter_count - 2) + [(-1.0, 1.5), (-0.2, 0.2)],
        options={"maxiter": 150, "ftol": 1e-6},
    )
    if not result.success:
        raise RuntimeError(f"Dixon-Coles optimization failed: {result.message}")
    attack, defence, home_advantage, rho = unpack_parameters(result.x, team_count)
    return DixonColesParameters(
        teams=teams,
        attack=attack.tolist(),
        defence=defence.tolist(),
        home_advantage=float(home_advantage),
        rho=float(np.clip(rho, -0.2, 0.2)),
        half_life_days=float(half_life_days),
        log_likelihood=float(-result.fun),
    )


def add_cold_start_teams(
    parameters: DixonColesParameters,
    team_keys: Iterable[Any],
    *,
    attack_adjustment: float = COLD_START_ATTACK_ADJUSTMENT,
    defence_adjustment: float = COLD_START_DEFENCE_ADJUSTMENT,
) -> tuple[DixonColesParameters, list[str]]:
    known = set(parameters.teams)
    missing = sorted({str(key) for key in team_keys if str(key) not in known})
    if not missing:
        return parameters, []
    average_attack = float(np.mean(parameters.attack)) if parameters.attack else 0.0
    average_defence = float(np.mean(parameters.defence)) if parameters.defence else 0.0
    expanded = DixonColesParameters(
        teams=[*parameters.teams, *missing],
        attack=[*parameters.attack, *([average_attack + attack_adjustment] * len(missing))],
        defence=[*parameters.defence, *([average_defence + defence_adjustment] * len(missing))],
        home_advantage=parameters.home_advantage,
        rho=parameters.rho,
        half_life_days=parameters.half_life_days,
        log_likelihood=parameters.log_likelihood,
    )
    return expanded, missing


def outcome_probabilities(
    home_lambda: float,
    away_lambda: float,
    rho: float,
    max_goals: int = MAX_GOALS,
) -> np.ndarray:
    home_goals = np.arange(0, max_goals + 1)
    away_goals = np.arange(0, max_goals + 1)
    home_pmf = poisson.pmf(home_goals, home_lambda)
    away_pmf = poisson.pmf(away_goals, away_lambda)
    grid_home, grid_away = np.meshgrid(home_goals, away_goals, indexing="ij")
    tau = dixon_coles_tau(
        grid_home.ravel(),
        grid_away.ravel(),
        np.full(grid_home.size, home_lambda),
        np.full(grid_away.size, away_lambda),
        rho,
    ).reshape(grid_home.shape)
    joint = tau * np.outer(home_pmf, away_pmf)
    joint = joint / joint.sum()
    home_win = float(np.tril(joint, k=-1).sum())
    draw = float(np.trace(joint))
    away_win = float(np.triu(joint, k=1).sum())
    probabilities = np.array([home_win, draw, away_win], dtype=float)
    probabilities = np.clip(probabilities, PROBABILITY_EPSILON, 1.0)
    return probabilities / probabilities.sum()


def predict_dixon_coles(
    parameters: DixonColesParameters,
    home_keys: Iterable[Any],
    away_keys: Iterable[Any],
) -> np.ndarray:
    index = parameters.team_index()
    attack = np.asarray(parameters.attack, dtype=float)
    defence = np.asarray(parameters.defence, dtype=float)
    rows = []
    average_attack = float(np.mean(attack)) if len(attack) else 0.0
    average_defence = float(np.mean(defence)) if len(defence) else 0.0
    for home_key, away_key in zip(home_keys, away_keys, strict=True):
        home_idx = index.get(str(home_key))
        away_idx = index.get(str(away_key))
        home_attack = attack[home_idx] if home_idx is not None else average_attack
        away_attack = attack[away_idx] if away_idx is not None else average_attack
        home_defence = defence[home_idx] if home_idx is not None else average_defence
        away_defence = defence[away_idx] if away_idx is not None else average_defence
        home_lambda = float(np.exp(home_attack - away_defence + parameters.home_advantage))
        away_lambda = float(np.exp(away_attack - home_defence))
        rows.append(outcome_probabilities(home_lambda, away_lambda, parameters.rho))
    return np.vstack(rows) if rows else np.zeros((0, NUM_OUTCOMES), dtype=float)


def parameters_from_dict(payload: dict[str, Any]) -> DixonColesParameters:
    return DixonColesParameters(
        teams=list(payload["teams"]),
        attack=[float(value) for value in payload["attack"]],
        defence=[float(value) for value in payload["defence"]],
        home_advantage=float(payload["home_advantage"]),
        rho=float(payload["rho"]),
        half_life_days=float(payload.get("half_life_days", DEFAULT_HALF_LIFE_DAYS)),
        log_likelihood=float(payload.get("log_likelihood", 0.0)),
    )
