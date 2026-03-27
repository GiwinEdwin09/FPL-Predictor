import numpy as np
import pandas as pd

from fpl_predictor.model_training import (
    COMPETITION_WEIGHTS,
    build_target,
    competition_sample_weight,
    multiclass_brier_score,
    split_train_validation,
)


def test_build_target_maps_home_draw_away() -> None:
    frame = pd.DataFrame(
        {
            "home_score": [2, 1, 0],
            "away_score": [0, 1, 3],
        }
    )
    assert build_target(frame).tolist() == [0, 1, 2]


def test_multiclass_brier_score_returns_zero_for_perfect_predictions() -> None:
    y_true = np.array([0, 1, 2])
    probabilities = np.eye(3)
    assert multiclass_brier_score(y_true, probabilities) == 0.0


def test_split_train_validation_uses_recent_2025_2026_window() -> None:
    frame = pd.DataFrame(
        [
            {
                "match_id": "old-season",
                "source_season": "2024-2025",
                "kickoff_time": "2025-05-10T15:00:00Z",
                "source_gameweek": np.nan,
                "gameweek": 37,
                "_ordering_gameweek": 37,
                "target": 0,
            },
            {
                "match_id": "gw27",
                "source_season": "2025-2026",
                "kickoff_time": "2026-02-21T15:00:00Z",
                "source_gameweek": 27,
                "gameweek": 27,
                "_ordering_gameweek": 27,
                "target": 0,
            },
            {
                "match_id": "gw28",
                "source_season": "2025-2026",
                "kickoff_time": "2026-02-28T15:00:00Z",
                "source_gameweek": 28,
                "gameweek": 28,
                "_ordering_gameweek": 28,
                "target": 1,
            },
            {
                "match_id": "gw31",
                "source_season": "2025-2026",
                "kickoff_time": "2026-03-22T14:15:00Z",
                "source_gameweek": 31,
                "gameweek": 31,
                "_ordering_gameweek": 31,
                "target": 2,
            },
        ]
    )
    frame["kickoff_time"] = pd.to_datetime(frame["kickoff_time"], utc=True)

    train, validation, summary = split_train_validation(frame)

    assert train["match_id"].tolist() == ["old-season", "gw27"]
    assert validation["match_id"].tolist() == ["gw28", "gw31"]
    assert summary.train_rows == 2
    assert summary.validation_rows == 2


def test_competition_sample_weight_maps_known_competitions() -> None:
    frame = pd.DataFrame({"competition_code": ["prem", "champions-league", "efl-cup", "unknown"]})
    weights = competition_sample_weight(frame)
    assert weights.tolist() == [
        COMPETITION_WEIGHTS["prem"],
        COMPETITION_WEIGHTS["champions-league"],
        COMPETITION_WEIGHTS["efl-cup"],
        0.4,
    ]
