from pathlib import Path

import numpy as np
import pandas as pd

from fpl_predictor.backtesting import (
    devig_decimal_odds,
    expected_calibration_error,
    load_market_probability_lookup,
    make_walk_forward_folds,
    paired_block_bootstrap,
    probability_loss_rows,
    score_probabilities,
)


def test_probability_metrics_reward_perfect_predictions() -> None:
    targets = np.array([0, 1, 2])
    perfect = np.eye(3)

    metrics = score_probabilities(targets, perfect)

    assert metrics["accuracy"] == 1.0
    assert np.isclose(metrics["log_loss"], 0.0, atol=1e-9)
    assert np.isclose(metrics["brier"], 0.0, atol=1e-9)
    assert np.isclose(metrics["rps"], 0.0, atol=1e-9)
    assert np.isclose(expected_calibration_error(targets, perfect), 0.0, atol=1e-9)


def test_uniform_rps_uses_ordered_three_outcome_scale() -> None:
    losses = probability_loss_rows(
        np.array([0]),
        np.array([[1 / 3, 1 / 3, 1 / 3]]),
    )

    assert np.isclose(losses["rps"][0], 5 / 18)


def test_walk_forward_folds_never_train_on_same_or_later_kickoffs() -> None:
    frame = pd.DataFrame(
        [
            {
                "match_id": "old-1",
                "source_season": "2024-2025",
                "tournament": "prem",
                "kickoff_time": "2025-05-01T15:00:00Z",
                "_ordering_gameweek": 37,
                "target": 0,
            },
            {
                "match_id": "old-2",
                "source_season": "2024-2025",
                "tournament": "prem",
                "kickoff_time": "2025-05-08T15:00:00Z",
                "_ordering_gameweek": 38,
                "target": 1,
            },
            {
                "match_id": "old-cup",
                "source_season": "2024-2025",
                "tournament": "fa-cup",
                "kickoff_time": "2025-05-10T15:00:00Z",
                "_ordering_gameweek": 38,
                "target": 2,
            },
            {
                "match_id": "new-gw1-a",
                "source_season": "2025-2026",
                "tournament": "prem",
                "kickoff_time": "2025-08-16T12:30:00Z",
                "_ordering_gameweek": 1,
                "target": 0,
            },
            {
                "match_id": "new-gw1-b",
                "source_season": "2025-2026",
                "tournament": "prem",
                "kickoff_time": "2025-08-17T14:00:00Z",
                "_ordering_gameweek": 1,
                "target": 2,
            },
            {
                "match_id": "new-gw2",
                "source_season": "2025-2026",
                "tournament": "prem",
                "kickoff_time": "2025-08-23T15:00:00Z",
                "_ordering_gameweek": 2,
                "target": 1,
            },
        ]
    )
    frame["kickoff_time"] = pd.to_datetime(frame["kickoff_time"], utc=True)

    folds = make_walk_forward_folds(frame, ["2025-2026"], min_train_rows=3)

    assert [fold.fold_id for fold in folds] == ["2025-2026-GW1", "2025-2026-GW2"]
    assert folds[0].train["match_id"].tolist() == ["old-1", "old-2", "old-cup"]
    assert set(folds[0].validation["match_id"]) == {"new-gw1-a", "new-gw1-b"}
    assert folds[0].train["kickoff_time"].max() < folds[0].validation["kickoff_time"].min()
    assert set(folds[1].train["match_id"]) == {
        "old-1",
        "old-2",
        "old-cup",
        "new-gw1-a",
        "new-gw1-b",
    }


def test_walk_forward_folds_infer_week_blocks_when_rounds_are_missing() -> None:
    frame = pd.DataFrame(
        [
            {
                "match_id": f"train-{index}",
                "source_season": "2022-2023",
                "tournament": "prem",
                "kickoff_time": f"2023-05-0{index + 1}T15:00:00Z",
                "_ordering_gameweek": np.nan,
                "target": index % 3,
            }
            for index in range(3)
        ]
        + [
            {
                "match_id": "validation-1",
                "source_season": "2023-2024",
                "tournament": "prem",
                "kickoff_time": "2023-08-11T19:00:00Z",
                "_ordering_gameweek": np.nan,
                "target": 0,
            },
            {
                "match_id": "validation-2",
                "source_season": "2023-2024",
                "tournament": "prem",
                "kickoff_time": "2023-08-19T15:00:00Z",
                "_ordering_gameweek": np.nan,
                "target": 2,
            },
        ]
    )
    frame["kickoff_time"] = pd.to_datetime(frame["kickoff_time"], utc=True)

    folds = make_walk_forward_folds(frame, ["2023-2024"], min_train_rows=3)

    assert [fold.fold_id for fold in folds] == ["2023-2024-B1", "2023-2024-B2"]
    assert all(fold.train["kickoff_time"].max() < fold.validation["kickoff_time"].min() for fold in folds)


def test_devig_decimal_odds_normalizes_valid_rows() -> None:
    probabilities = devig_decimal_odds(
        np.array(
            [
                [2.0, 4.0, 4.0],
                [2.0, np.nan, 4.0],
            ]
        )
    )

    assert np.allclose(probabilities[0], [0.5, 0.25, 0.25])
    assert np.isnan(probabilities[1]).all()


def test_market_lookup_prefers_average_closing_odds(tmp_path: Path) -> None:
    path = tmp_path / "matches.csv"
    pd.DataFrame(
        {
            "match_id": ["m1"],
            "AvgCH": [2.0],
            "AvgCD": [4.0],
            "AvgCA": [4.0],
            "B365H": [1.5],
            "B365D": [5.0],
            "B365A": [7.0],
        }
    ).to_csv(path, index=False)

    source, lookup = load_market_probability_lookup(path)

    assert source == "AvgCH/AvgCD/AvgCA"
    assert np.allclose(lookup["m1"], [0.5, 0.25, 0.25])


def test_paired_block_bootstrap_is_zero_for_identical_models() -> None:
    losses = np.array([0.1, 0.2, 0.3, 0.4])
    result = paired_block_bootstrap(
        losses,
        losses.copy(),
        np.array(["gw1", "gw1", "gw2", "gw2"]),
        samples=100,
        seed=7,
    )

    assert result["rows"] == 4
    assert result["mean_difference"] == 0.0
    assert result["ci_lower"] == 0.0
    assert result["ci_upper"] == 0.0
