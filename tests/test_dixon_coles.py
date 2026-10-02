from dataclasses import asdict

import numpy as np
import pandas as pd
from scipy.optimize import check_grad

from fpl_predictor.dixon_coles import (
    DixonColesParameters,
    add_cold_start_teams,
    dixon_coles_sample_weights,
    fit_dixon_coles,
    outcome_probabilities,
    parameters_from_dict,
    predict_dixon_coles,
    weighted_log_likelihood_and_gradient,
)


def _round_robin_frame() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    strength = {"strong": 0.5, "mid": 0.0, "weak": -0.5, "minnow": -0.4}
    rows = []
    kickoff = pd.Timestamp("2024-08-01T15:00:00Z")
    for _ in range(6):
        for home in strength:
            for away in strength:
                if home == away:
                    continue
                rows.append(
                    {
                        "home_team_key": home,
                        "away_team_key": away,
                        "home_score": rng.poisson(np.exp(0.25 + strength[home] - strength[away])),
                        "away_score": rng.poisson(np.exp(strength[away] - strength[home])),
                        "kickoff_time": kickoff,
                    }
                )
                kickoff += pd.Timedelta(days=3)
    return pd.DataFrame(rows)


def test_outcome_probabilities_are_normalized_and_favor_higher_lambda() -> None:
    balanced = outcome_probabilities(1.2, 1.2, 0.0)
    home_favorite = outcome_probabilities(2.0, 0.8, 0.0)

    assert np.isclose(balanced.sum(), 1.0)
    assert home_favorite[0] > balanced[0]
    assert home_favorite[2] < balanced[2]


def test_dixon_coles_fit_assigns_higher_attack_to_stronger_side() -> None:
    frame = pd.DataFrame(
        {
            "home_team_key": ["strong", "weak", "strong", "weak"],
            "away_team_key": ["weak", "strong", "weak", "strong"],
            "home_score": [3, 0, 2, 0],
            "away_score": [0, 2, 0, 3],
            "kickoff_time": pd.to_datetime(
                [
                    "2024-08-01T15:00:00Z",
                    "2024-08-08T15:00:00Z",
                    "2024-08-15T15:00:00Z",
                    "2024-08-22T15:00:00Z",
                ]
            ),
        }
    )

    parameters = fit_dixon_coles(frame, half_life_days=3650)
    attack = dict(zip(parameters.teams, parameters.attack))
    probabilities = predict_dixon_coles(parameters, ["strong"], ["weak"])[0]

    assert attack["strong"] > attack["weak"]
    assert probabilities[0] > probabilities[2]
    assert np.isclose(probabilities.sum(), 1.0)


def test_dixon_coles_combines_recency_and_competition_weights() -> None:
    frame = pd.DataFrame(
        {
            "kickoff_time": ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"],
            "sample_weight": [1.0, 0.4],
        }
    )

    weights = dixon_coles_sample_weights(frame)

    assert np.allclose(weights, [1.0, 0.4])


def test_cold_start_teams_receive_explicit_conservative_priors() -> None:
    parameters = DixonColesParameters(
        teams=["arsenal", "chelsea"],
        attack=[0.2, -0.2],
        defence=[0.1, -0.1],
        home_advantage=0.25,
        rho=-0.05,
        half_life_days=550.0,
        log_likelihood=-10.0,
    )

    expanded, added = add_cold_start_teams(parameters, ["arsenal", "newly-promoted"])

    assert added == ["newly-promoted"]
    assert expanded.teams[-1] == "newly-promoted"
    assert expanded.attack[-1] == -0.15
    assert expanded.defence[-1] == -0.15


def test_analytic_gradient_matches_numerical_gradient() -> None:
    rng = np.random.default_rng(0)
    team_count = 5
    home_index = rng.integers(0, team_count, 120)
    away_index = (home_index + rng.integers(1, team_count, 120)) % team_count
    home_goals = rng.poisson(1.5, 120).astype(float)
    away_goals = rng.poisson(1.1, 120).astype(float)
    weights = rng.uniform(0.1, 1.0, 120)
    start = np.concatenate([rng.normal(0.0, 0.2, 2 * team_count - 1), [0.25, -0.08]])

    for ridge in (0.0, 2.0):
        args = (home_index, away_index, home_goals, away_goals, weights, team_count, ridge)
        error = check_grad(
            lambda values: weighted_log_likelihood_and_gradient(values, *args)[0],
            lambda values: weighted_log_likelihood_and_gradient(values, *args)[1],
            start,
        )
        assert error < 1e-4


def test_ridge_shrinks_ratings_but_keeps_team_ordering() -> None:
    frame = _round_robin_frame()

    unshrunk = fit_dixon_coles(frame, half_life_days=3650, ridge=0.0)
    shrunk = fit_dixon_coles(frame, half_life_days=3650, ridge=5.0)

    def spread(parameters: DixonColesParameters) -> float:
        return float(np.ptp(np.asarray(parameters.attack) + np.asarray(parameters.defence)))

    def ordering(parameters: DixonColesParameters) -> list[str]:
        net = np.asarray(parameters.attack) + np.asarray(parameters.defence)
        return [parameters.teams[index] for index in np.argsort(net)]

    assert spread(shrunk) < spread(unshrunk)
    assert ordering(shrunk)[-1] == ordering(unshrunk)[-1] == "strong"
    assert shrunk.ridge == 5.0
    assert unshrunk.ridge == 0.0


def test_ridge_does_not_bias_average_goal_level() -> None:
    frame = _round_robin_frame()
    observed = frame[["home_score", "away_score"]].to_numpy().mean()

    for ridge in (0.0, 5.0):
        parameters = fit_dixon_coles(frame, half_life_days=3650, ridge=ridge)
        index = parameters.team_index()
        attack = np.asarray(parameters.attack)
        defence = np.asarray(parameters.defence)
        home = attack[frame["home_team_key"].map(index)] - defence[frame["away_team_key"].map(index)]
        away = attack[frame["away_team_key"].map(index)] - defence[frame["home_team_key"].map(index)]
        expected = np.concatenate([np.exp(home + parameters.home_advantage), np.exp(away)]).mean()
        assert abs(expected - observed) < 0.05


def test_parameters_without_ridge_field_still_load() -> None:
    payload = asdict(
        DixonColesParameters(
            teams=["arsenal", "chelsea"],
            attack=[0.2, -0.2],
            defence=[0.1, -0.1],
            home_advantage=0.25,
            rho=-0.05,
            half_life_days=550.0,
            log_likelihood=-10.0,
        )
    )
    payload.pop("ridge")

    parameters = parameters_from_dict(payload)

    assert parameters.ridge == 0.0
    assert parameters.half_life_days == 550.0
