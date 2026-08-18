from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from fpl_predictor.model_training import (
    FEATURE_COLUMNS,
    apply_temperature,
    choose_temperature,
    fit_model,
    is_premier_league_frame,
    load_training_frame,
)

NUM_OUTCOMES = 3
MODEL_NAME = "xgboost_v2"
OUTCOME_LABELS = ("home_win", "draw", "away_win")
PROBABILITY_EPSILON = 1e-12
DEFAULT_CALIBRATION_BINS = 10

# Prefer consensus closing prices, then individual closing prices, then
# pre-closing prices. These are the common football-data.co.uk column names.
MARKET_ODDS_COLUMN_SETS = (
    ("market_home_odds", "market_draw_odds", "market_away_odds"),
    ("AvgCH", "AvgCD", "AvgCA"),
    ("PSCH", "PSCD", "PSCA"),
    ("B365CH", "B365CD", "B365CA"),
    ("AvgH", "AvgD", "AvgA"),
    ("PSH", "PSD", "PSA"),
    ("B365H", "B365D", "B365A"),
)


@dataclass(frozen=True)
class WalkForwardFold:
    fold_id: str
    season: str
    gameweek: int
    cutoff_utc: str
    train: pd.DataFrame
    validation: pd.DataFrame


def normalize_probabilities(probabilities: np.ndarray) -> np.ndarray:
    values = np.asarray(probabilities, dtype=float)
    if values.ndim != 2 or values.shape[1] != NUM_OUTCOMES:
        raise ValueError("Probabilities must have shape (rows, 3).")
    values = np.clip(values, PROBABILITY_EPSILON, 1.0)
    return values / values.sum(axis=1, keepdims=True)


def probability_loss_rows(y_true: np.ndarray, probabilities: np.ndarray) -> dict[str, np.ndarray]:
    targets = np.asarray(y_true, dtype=int)
    predicted = normalize_probabilities(probabilities)
    if len(targets) != len(predicted):
        raise ValueError("Target and probability row counts must match.")

    one_hot = np.eye(NUM_OUTCOMES)[targets]
    cumulative_predicted = np.cumsum(predicted, axis=1)[:, :-1]
    cumulative_observed = np.cumsum(one_hot, axis=1)[:, :-1]

    return {
        "log_loss": -np.log(predicted[np.arange(len(targets)), targets]),
        "brier": np.sum((predicted - one_hot) ** 2, axis=1),
        # Dividing by K - 1 keeps the three-outcome RPS on a 0..1 scale.
        "rps": np.mean((cumulative_predicted - cumulative_observed) ** 2, axis=1),
        "correct": (predicted.argmax(axis=1) == targets).astype(float),
    }


def reliability_bins(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    n_bins: int = DEFAULT_CALIBRATION_BINS,
) -> list[dict[str, float | int]]:
    targets = np.asarray(y_true, dtype=int)
    predicted = normalize_probabilities(probabilities)
    confidence = predicted.max(axis=1)
    correct = (predicted.argmax(axis=1) == targets).astype(float)
    bin_indices = np.minimum((confidence * n_bins).astype(int), n_bins - 1)

    rows: list[dict[str, float | int]] = []
    for index in range(n_bins):
        mask = bin_indices == index
        count = int(mask.sum())
        rows.append(
            {
                "lower": index / n_bins,
                "upper": (index + 1) / n_bins,
                "count": count,
                "mean_confidence": float(confidence[mask].mean()) if count else 0.0,
                "accuracy": float(correct[mask].mean()) if count else 0.0,
            }
        )
    return rows


def expected_calibration_error(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    n_bins: int = DEFAULT_CALIBRATION_BINS,
) -> float:
    total = len(y_true)
    if total == 0:
        return float("nan")
    return float(
        sum(
            (row["count"] / total) * abs(row["accuracy"] - row["mean_confidence"])
            for row in reliability_bins(y_true, probabilities, n_bins=n_bins)
        )
    )


def score_probabilities(y_true: np.ndarray, probabilities: np.ndarray) -> dict[str, float | int]:
    losses = probability_loss_rows(y_true, probabilities)
    return {
        "rows": int(len(y_true)),
        "accuracy": float(losses["correct"].mean()),
        "log_loss": float(losses["log_loss"].mean()),
        "brier": float(losses["brier"].mean()),
        "rps": float(losses["rps"].mean()),
        "ece": expected_calibration_error(y_true, probabilities),
    }


def make_walk_forward_folds(
    frame: pd.DataFrame,
    evaluation_seasons: Iterable[str],
    min_train_rows: int = 200,
) -> list[WalkForwardFold]:
    seasons = set(evaluation_seasons)
    candidates = frame.loc[
        is_premier_league_frame(frame)
        & frame["source_season"].isin(seasons)
        & frame["kickoff_time"].notna()
    ].copy()
    if candidates.empty:
        return []

    candidates["_evaluation_block"] = pd.to_numeric(
        candidates["_ordering_gameweek"],
        errors="coerce",
    )
    for season, season_rows in candidates.groupby("source_season", sort=False):
        missing_round = season_rows["_evaluation_block"].isna()
        if not missing_round.any():
            continue
        season_start = season_rows["kickoff_time"].min().normalize()
        inferred = (
            (season_rows.loc[missing_round, "kickoff_time"].dt.normalize() - season_start)
            .dt.days.floordiv(7)
            .add(1)
        )
        candidates.loc[inferred.index, "_evaluation_block"] = inferred

    grouped: list[tuple[pd.Timestamp, str, int, pd.DataFrame]] = []
    for (season, gameweek_value), validation in candidates.groupby(
        ["source_season", "_evaluation_block"],
        sort=False,
    ):
        if pd.isna(gameweek_value):
            continue
        cutoff = validation["kickoff_time"].min()
        grouped.append((cutoff, str(season), int(gameweek_value), validation.copy()))

    folds: list[WalkForwardFold] = []
    for cutoff, season, gameweek, validation in sorted(grouped, key=lambda item: item[0]):
        # The complete gameweek is predicted from a model fitted before its
        # first kickoff. Feature rows remain strictly pre-kickoff snapshots.
        train = frame.loc[frame["kickoff_time"].notna() & (frame["kickoff_time"] < cutoff)].copy()
        if len(train) < min_train_rows or train["target"].nunique() < NUM_OUTCOMES:
            continue
        validation = validation.sort_values(["kickoff_time", "match_id"], kind="stable")
        folds.append(
            WalkForwardFold(
                fold_id=(
                    f"{season}-GW{gameweek}"
                    if validation["_ordering_gameweek"].notna().any()
                    else f"{season}-B{gameweek}"
                ),
                season=season,
                gameweek=gameweek,
                cutoff_utc=cutoff.isoformat(),
                train=train,
                validation=validation,
            )
        )
    return folds


def historical_prior_probabilities(train: pd.DataFrame, rows: int) -> np.ndarray:
    premier_league = train.loc[is_premier_league_frame(train)]
    counts = np.bincount(
        premier_league["target"].to_numpy(dtype=int),
        minlength=NUM_OUTCOMES,
    ).astype(float)
    # Laplace smoothing keeps every outcome probability non-zero.
    prior = (counts + 1.0) / (counts.sum() + NUM_OUTCOMES)
    return np.tile(prior, (rows, 1))


def elo_logistic_probabilities(train: pd.DataFrame, validation: pd.DataFrame) -> np.ndarray:
    premier_league = train.loc[is_premier_league_frame(train)].copy()
    prior = historical_prior_probabilities(train, len(validation))
    elo = pd.to_numeric(premier_league["elo_diff"], errors="coerce")
    if elo.notna().sum() < 20 or premier_league["target"].nunique() < NUM_OUTCOMES:
        return prior

    median = float(elo.median())
    train_x = elo.fillna(median).to_numpy(dtype=float).reshape(-1, 1)
    validation_x = (
        pd.to_numeric(validation["elo_diff"], errors="coerce")
        .fillna(median)
        .to_numpy(dtype=float)
        .reshape(-1, 1)
    )
    model = LogisticRegression(
        C=1.0,
        max_iter=1_000,
        solver="lbfgs",
        random_state=42,
    )
    model.fit(train_x, premier_league["target"].to_numpy(dtype=int))
    raw = model.predict_proba(validation_x)

    aligned = np.zeros((len(validation), NUM_OUTCOMES), dtype=float)
    for raw_index, outcome_class in enumerate(model.classes_):
        aligned[:, int(outcome_class)] = raw[:, raw_index]
    return normalize_probabilities(aligned)


def devig_decimal_odds(odds: np.ndarray) -> np.ndarray:
    values = np.asarray(odds, dtype=float)
    if values.ndim != 2 or values.shape[1] != NUM_OUTCOMES:
        raise ValueError("Decimal odds must have shape (rows, 3).")
    valid = np.isfinite(values).all(axis=1) & (values > 1.0).all(axis=1)
    probabilities = np.full(values.shape, np.nan, dtype=float)
    implied = 1.0 / values[valid]
    probabilities[valid] = implied / implied.sum(axis=1, keepdims=True)
    return probabilities


def load_market_probability_lookup(
    matches_path: Path,
) -> tuple[str | None, dict[str, np.ndarray]]:
    if not matches_path.exists():
        return None, {}
    matches = pd.read_csv(matches_path)
    probability_columns = (
        "market_home_probability",
        "market_draw_probability",
        "market_away_probability",
    )
    if "match_id" in matches.columns and all(column in matches.columns for column in probability_columns):
        values = matches.loc[:, list(probability_columns)].apply(pd.to_numeric, errors="coerce").to_numpy()
        lookup = {
            str(match_id): normalize_probabilities(probability.reshape(1, -1))[0]
            for match_id, probability in zip(matches["match_id"], values, strict=True)
            if np.isfinite(probability).all()
        }
        if lookup:
            return "market_home_probability/market_draw_probability/market_away_probability", lookup

    columns_by_case = {column.casefold(): column for column in matches.columns}

    selected: tuple[str, str, str] | None = None
    for candidate in MARKET_ODDS_COLUMN_SETS:
        if all(column.casefold() in columns_by_case for column in candidate):
            selected = tuple(columns_by_case[column.casefold()] for column in candidate)
            break
    if selected is None or "match_id" not in matches.columns:
        return None, {}

    odds = matches.loc[:, list(selected)].apply(pd.to_numeric, errors="coerce").to_numpy()
    probabilities = devig_decimal_odds(odds)
    lookup = {
        str(match_id): probability
        for match_id, probability in zip(matches["match_id"], probabilities, strict=True)
        if np.isfinite(probability).all()
    }
    return "/".join(selected), lookup


def paired_block_bootstrap(
    model_a_losses: np.ndarray,
    model_b_losses: np.ndarray,
    blocks: np.ndarray,
    samples: int = 2_000,
    seed: int = 42,
) -> dict[str, float | int]:
    if samples <= 0:
        raise ValueError("Bootstrap samples must be positive.")
    a = np.asarray(model_a_losses, dtype=float)
    b = np.asarray(model_b_losses, dtype=float)
    block_values = np.asarray(blocks)
    valid = np.isfinite(a) & np.isfinite(b)
    a = a[valid]
    b = b[valid]
    block_values = block_values[valid]
    if not len(a):
        return {"rows": 0, "mean_difference": float("nan"), "ci_lower": float("nan"), "ci_upper": float("nan")}

    unique_blocks = np.unique(block_values)
    indices_by_block = {block: np.flatnonzero(block_values == block) for block in unique_blocks}
    rng = np.random.default_rng(seed)
    differences = np.empty(samples, dtype=float)
    for index in range(samples):
        sampled_blocks = rng.choice(unique_blocks, size=len(unique_blocks), replace=True)
        sampled_indices = np.concatenate([indices_by_block[block] for block in sampled_blocks])
        differences[index] = float((a[sampled_indices] - b[sampled_indices]).mean())

    return {
        "rows": int(len(a)),
        "mean_difference": float((a - b).mean()),
        "ci_lower": float(np.quantile(differences, 0.025)),
        "ci_upper": float(np.quantile(differences, 0.975)),
        "probability_a_better": float((differences < 0).mean()),
    }


def _target_distribution(targets: np.ndarray) -> dict[str, int]:
    counts = np.bincount(targets.astype(int), minlength=NUM_OUTCOMES)
    return {
        "home_win": int(counts[0]),
        "draw": int(counts[1]),
        "away_win": int(counts[2]),
    }


def run_walk_forward_backtest(
    training_feature_table_path: Path,
    matches_path: Path,
    evaluation_seasons: Iterable[str],
    min_train_rows: int = 200,
    bootstrap_samples: int = 2_000,
    seed: int = 42,
    calibrate_xgboost: bool = True,
) -> dict[str, Any]:
    frame = load_training_frame(training_feature_table_path)
    seasons = tuple(evaluation_seasons)
    folds = make_walk_forward_folds(frame, seasons, min_train_rows=min_train_rows)
    if not folds:
        raise ValueError("No eligible walk-forward folds were produced.")

    market_source, market_lookup = load_market_probability_lookup(matches_path)
    model_names = ("uniform", "historical_prior", "elo_logistic", MODEL_NAME, "market")
    probability_parts: dict[str, list[np.ndarray]] = {name: [] for name in model_names}
    target_parts: list[np.ndarray] = []
    block_parts: list[np.ndarray] = []
    fold_rows: list[dict[str, Any]] = []
    prediction_rows: list[dict[str, Any]] = []
    temperatures: list[float] = []

    for fold in folds:
        train = fold.train
        validation = fold.validation
        targets = validation["target"].to_numpy(dtype=int)
        rows = len(validation)

        uniform = np.full((rows, NUM_OUTCOMES), 1.0 / NUM_OUTCOMES)
        prior = historical_prior_probabilities(train, rows)
        elo = elo_logistic_probabilities(train, validation)

        if calibrate_xgboost:
            temperature, calibration_rows, calibration_cutoff = choose_temperature(train)
        else:
            temperature, calibration_rows, calibration_cutoff = 1.0, 0, "disabled"
        model = fit_model(train)
        xgboost = model.predict_proba(validation.loc[:, FEATURE_COLUMNS])
        if calibrate_xgboost:
            xgboost = apply_temperature(xgboost, temperature)
        xgboost = normalize_probabilities(xgboost)
        temperatures.append(float(temperature))

        market = np.full((rows, NUM_OUTCOMES), np.nan)
        for row_index, match_id in enumerate(validation["match_id"].astype(str)):
            if match_id in market_lookup:
                market[row_index] = market_lookup[match_id]

        fold_predictions = {
            "uniform": uniform,
            "historical_prior": prior,
            "elo_logistic": elo,
            MODEL_NAME: xgboost,
            "market": market,
        }
        for name, probabilities in fold_predictions.items():
            probability_parts[name].append(probabilities)
        target_parts.append(targets)
        block_parts.append(np.full(rows, fold.fold_id, dtype=object))

        fold_metrics: dict[str, dict[str, float | int]] = {}
        for name, probabilities in fold_predictions.items():
            valid = np.isfinite(probabilities).all(axis=1)
            if valid.any():
                fold_metrics[name] = score_probabilities(targets[valid], probabilities[valid])

        for row_index, (_, match) in enumerate(validation.iterrows()):
            serialized_models: dict[str, dict[str, float] | None] = {}
            for name, probabilities in fold_predictions.items():
                probability = probabilities[row_index]
                serialized_models[name] = (
                    {
                        label: float(probability[outcome_index])
                        for outcome_index, label in enumerate(OUTCOME_LABELS)
                    }
                    if np.isfinite(probability).all()
                    else None
                )
            prediction_rows.append(
                {
                    "fold_id": fold.fold_id,
                    "match_id": str(match["match_id"]),
                    "season": str(match["source_season"]),
                    "gameweek": int(match["_ordering_gameweek"]),
                    "kickoff_time": match["kickoff_time"].isoformat(),
                    "actual_outcome": OUTCOME_LABELS[int(targets[row_index])],
                    "models": serialized_models,
                }
            )

        fold_rows.append(
            {
                "fold_id": fold.fold_id,
                "season": fold.season,
                "gameweek": fold.gameweek,
                "cutoff_utc": fold.cutoff_utc,
                "train_rows": int(len(train)),
                "validation_rows": rows,
                "calibration_temperature": float(temperature),
                "calibration_rows": int(calibration_rows),
                "calibration_cutoff_utc": calibration_cutoff,
                "metrics": fold_metrics,
            }
        )

    targets = np.concatenate(target_parts)
    blocks = np.concatenate(block_parts)
    predictions = {name: np.vstack(parts) for name, parts in probability_parts.items()}

    model_results: dict[str, Any] = {}
    loss_rows: dict[str, dict[str, np.ndarray]] = {}
    for name, probabilities in predictions.items():
        valid = np.isfinite(probabilities).all(axis=1)
        if not valid.any():
            model_results[name] = {"available": False, "rows": 0}
            continue
        valid_targets = targets[valid]
        valid_probabilities = probabilities[valid]
        model_results[name] = {
            "available": True,
            "coverage": float(valid.mean()),
            **score_probabilities(valid_targets, valid_probabilities),
            "reliability": reliability_bins(valid_targets, valid_probabilities),
        }
        loss_rows[name] = probability_loss_rows(valid_targets, valid_probabilities)

    comparisons: dict[str, Any] = {}
    reference = MODEL_NAME
    for baseline in ("uniform", "historical_prior", "elo_logistic", "market"):
        if baseline not in loss_rows:
            continue
        valid = np.isfinite(predictions[reference]).all(axis=1) & np.isfinite(predictions[baseline]).all(axis=1)
        reference_losses = probability_loss_rows(targets[valid], predictions[reference][valid])
        baseline_losses = probability_loss_rows(targets[valid], predictions[baseline][valid])
        comparison: dict[str, Any] = {
            "interpretation": "Negative differences favor xgboost_v2.",
        }
        for metric in ("log_loss", "brier", "rps"):
            comparison[metric] = paired_block_bootstrap(
                reference_losses[metric],
                baseline_losses[metric],
                blocks[valid],
                samples=bootstrap_samples,
                seed=seed,
            )
        comparisons[f"{reference}_minus_{baseline}"] = comparison

    return {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "configuration": {
            "evaluation_seasons": list(seasons),
            "minimum_train_rows": min_train_rows,
            "bootstrap_samples": bootstrap_samples,
            "random_seed": seed,
            "xgboost_temperature_calibration": calibrate_xgboost,
            "fold_boundary": "Train before the first kickoff of each Premier League gameweek.",
            "accuracy_tie_break": "Argmax ties resolve to class 0 (home win).",
        },
        "data": {
            "training_rows_available": int(len(frame)),
            "folds": len(folds),
            "evaluated_matches": int(len(targets)),
            "first_fold": folds[0].fold_id,
            "last_fold": folds[-1].fold_id,
            "target_distribution": _target_distribution(targets),
            "market_odds_source": market_source,
            "market_matches_available": int(np.isfinite(predictions["market"]).all(axis=1).sum()),
        },
        "models": model_results,
        "xgboost_calibration": {
            "mean_temperature": float(np.mean(temperatures)),
            "median_temperature": float(np.median(temperatures)),
            "minimum_temperature": float(np.min(temperatures)),
            "maximum_temperature": float(np.max(temperatures)),
        },
        "comparisons": comparisons,
        "folds": fold_rows,
        "predictions": prediction_rows,
    }


def run_walk_forward_backtest_v3(
    training_feature_table_path: Path,
    matches_path: Path,
    evaluation_seasons: Iterable[str],
    min_train_rows: int = 200,
    bootstrap_samples: int = 2_000,
    seed: int = 42,
    half_life_days: float = 550.0,
) -> dict[str, Any]:
    from fpl_predictor.dixon_coles import fit_dixon_coles, predict_dixon_coles
    from fpl_predictor.model_training import V3_FEATURE_COLUMNS, apply_temperature
    from fpl_predictor.model_v3 import load_v3_training_frame, train_blend_predictor
    from fpl_predictor.predictors import (
        fit_multinomial_logistic,
        recency_sample_weights,
        sklearn_probabilities,
    )

    frame = load_v3_training_frame(training_feature_table_path)
    seasons = tuple(evaluation_seasons)
    folds = make_walk_forward_folds(frame, seasons, min_train_rows=min_train_rows)
    if not folds:
        raise ValueError("No eligible walk-forward folds were produced.")

    market_source, market_lookup = load_market_probability_lookup(matches_path)
    model_names = (
        "uniform",
        "historical_prior",
        "elo_logistic",
        "dixon_coles",
        "logistic_v3",
        "xgboost_v3",
        "blend_v3",
        "market",
    )
    probability_parts: dict[str, list[np.ndarray]] = {name: [] for name in model_names}
    target_parts: list[np.ndarray] = []
    block_parts: list[np.ndarray] = []
    fold_rows: list[dict[str, Any]] = []
    prediction_rows: list[dict[str, Any]] = []
    temperatures: list[float] = []
    blend_weights: list[float] = []
    selected_predictors: list[str] = []

    for fold in folds:
        train = fold.train
        validation = fold.validation
        targets = validation["target"].to_numpy(dtype=int)
        rows = len(validation)

        uniform = np.full((rows, NUM_OUTCOMES), 1.0 / NUM_OUTCOMES)
        prior = historical_prior_probabilities(train, rows)
        elo = elo_logistic_probabilities(train, validation)
        predictor, details = train_blend_predictor(train, half_life_days=half_life_days)
        dixon = predict_dixon_coles(
            predictor.dixon_coles,
            validation.get("home_team_key", validation["home_team"]),
            validation.get("away_team_key", validation["away_team"]),
        )
        tree = sklearn_probabilities(predictor.tree_model, validation, V3_FEATURE_COLUMNS)
        blend = apply_temperature(predictor.predict_proba(validation), details["calibration_temperature"])
        weights = recency_sample_weights(train["kickoff_time"], train["sample_weight"], half_life_days=half_life_days)
        logistic_model = fit_multinomial_logistic(train, V3_FEATURE_COLUMNS, sample_weight=weights)
        logistic = sklearn_probabilities(logistic_model, validation, V3_FEATURE_COLUMNS)

        market = np.full((rows, NUM_OUTCOMES), np.nan)
        for row_index, match_id in enumerate(validation["match_id"].astype(str)):
            if match_id in market_lookup:
                market[row_index] = market_lookup[match_id]

        fold_predictions = {
            "uniform": uniform,
            "historical_prior": prior,
            "elo_logistic": elo,
            "dixon_coles": normalize_probabilities(dixon),
            "logistic_v3": logistic,
            "xgboost_v3": tree,
            "blend_v3": normalize_probabilities(blend),
            "market": market,
        }
        temperatures.append(float(details["calibration_temperature"]))
        blend_weights.append(float(details["dixon_coles_weight"]))
        selected_predictors.append(str(details["selected_predictor"]))
        for name, probabilities in fold_predictions.items():
            probability_parts[name].append(probabilities)
        target_parts.append(targets)
        block_parts.append(np.full(rows, fold.fold_id, dtype=object))

        fold_metrics: dict[str, dict[str, float | int]] = {}
        for name, probabilities in fold_predictions.items():
            valid = np.isfinite(probabilities).all(axis=1)
            if valid.any():
                fold_metrics[name] = score_probabilities(targets[valid], probabilities[valid])

        for row_index, (_, match) in enumerate(validation.iterrows()):
            serialized_models: dict[str, dict[str, float] | None] = {}
            for name, probabilities in fold_predictions.items():
                probability = probabilities[row_index]
                serialized_models[name] = (
                    {
                        label: float(probability[outcome_index])
                        for outcome_index, label in enumerate(OUTCOME_LABELS)
                    }
                    if np.isfinite(probability).all()
                    else None
                )
            prediction_rows.append(
                {
                    "fold_id": fold.fold_id,
                    "match_id": str(match["match_id"]),
                    "season": str(match["source_season"]),
                    "gameweek": int(match["_ordering_gameweek"]),
                    "kickoff_time": match["kickoff_time"].isoformat(),
                    "actual_outcome": OUTCOME_LABELS[int(targets[row_index])],
                    "models": serialized_models,
                }
            )

        fold_rows.append(
            {
                "fold_id": fold.fold_id,
                "season": fold.season,
                "gameweek": fold.gameweek,
                "cutoff_utc": fold.cutoff_utc,
                "train_rows": int(len(train)),
                "validation_rows": rows,
                "calibration_temperature": float(details["calibration_temperature"]),
                "dixon_coles_weight": float(details["dixon_coles_weight"]),
                "calibration_rows": int(details["calibration_rows"]),
                "calibration_cutoff_utc": details["calibration_cutoff_utc"],
                "calibration_strategy": details["calibration_strategy"],
                "calibration_folds": int(details["calibration_folds"]),
                "selected_predictor": details["selected_predictor"],
                "tree_n_estimators": int(details["tree_n_estimators"]),
                "blend_candidate_log_loss": float(details["blend_candidate_log_loss"]),
                "dixon_coles_oof_log_loss": float(details["dixon_coles_oof_log_loss"]),
                "blend_vs_dc_log_loss_ci95": [
                    float(value) for value in details["blend_vs_dc_log_loss_ci95"]
                ],
                "metrics": fold_metrics,
            }
        )

    targets = np.concatenate(target_parts)
    blocks = np.concatenate(block_parts)
    predictions = {name: np.vstack(parts) for name, parts in probability_parts.items()}

    model_results: dict[str, Any] = {}
    loss_rows: dict[str, dict[str, np.ndarray]] = {}
    for name, probabilities in predictions.items():
        valid = np.isfinite(probabilities).all(axis=1)
        if not valid.any():
            model_results[name] = {"available": False, "rows": 0}
            continue
        valid_targets = targets[valid]
        valid_probabilities = probabilities[valid]
        model_results[name] = {
            "available": True,
            "coverage": float(valid.mean()),
            **score_probabilities(valid_targets, valid_probabilities),
            "reliability": reliability_bins(valid_targets, valid_probabilities),
        }
        loss_rows[name] = probability_loss_rows(valid_targets, valid_probabilities)

    comparisons: dict[str, Any] = {}
    for reference in ("blend_v3", "dixon_coles", "xgboost_v3"):
        for baseline in ("uniform", "historical_prior", "elo_logistic", "dixon_coles", "market", "xgboost_v3"):
            if reference == baseline or baseline not in loss_rows or reference not in loss_rows:
                continue
            valid = np.isfinite(predictions[reference]).all(axis=1) & np.isfinite(predictions[baseline]).all(axis=1)
            reference_losses = probability_loss_rows(targets[valid], predictions[reference][valid])
            baseline_losses = probability_loss_rows(targets[valid], predictions[baseline][valid])
            comparison: dict[str, Any] = {
                "interpretation": f"Negative differences favor {reference}.",
            }
            for metric in ("log_loss", "brier", "rps"):
                comparison[metric] = paired_block_bootstrap(
                    reference_losses[metric],
                    baseline_losses[metric],
                    blocks[valid],
                    samples=bootstrap_samples,
                    seed=seed,
                )
            comparisons[f"{reference}_minus_{baseline}"] = comparison

    return {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "configuration": {
            "evaluation_seasons": list(seasons),
            "minimum_train_rows": min_train_rows,
            "bootstrap_samples": bootstrap_samples,
            "random_seed": seed,
            "half_life_days": half_life_days,
            "fold_boundary": "Train before the first kickoff of each Premier League gameweek.",
            "accuracy_tie_break": "Argmax ties resolve to class 0 (home win).",
            "calibration": (
                "Predictor selection and temperature use accumulated chronological "
                "season-block out-of-fold predictions inside each training fold. The "
                "blend is promoted only when its block-bootstrap interval beats Dixon-Coles."
            ),
        },
        "data": {
            "training_rows_available": int(len(frame)),
            "folds": len(folds),
            "evaluated_matches": int(len(targets)),
            "first_fold": folds[0].fold_id,
            "last_fold": folds[-1].fold_id,
            "target_distribution": _target_distribution(targets),
            "market_odds_source": market_source,
            "market_matches_available": int(np.isfinite(predictions["market"]).all(axis=1).sum()),
        },
        "models": model_results,
        "blend_calibration": {
            "mean_temperature": float(np.mean(temperatures)),
            "median_temperature": float(np.median(temperatures)),
            "mean_dixon_coles_weight": float(np.mean(blend_weights)),
            "selected_predictor_counts": {
                name: selected_predictors.count(name)
                for name in sorted(set(selected_predictors))
            },
        },
        "comparisons": comparisons,
        "folds": fold_rows,
        "predictions": prediction_rows,
    }
