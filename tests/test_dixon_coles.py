import numpy as np
import pandas as pd

from fpl_predictor.dixon_coles import (
    DixonColesParameters,
    add_cold_start_teams,
    dixon_coles_sample_weights,
    fit_dixon_coles,
    outcome_probabilities,
    predict_dixon_coles,
)


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
