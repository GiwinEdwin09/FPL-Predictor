import numpy as np
import pandas as pd

from fpl_predictor.model_v3 import build_calibration_season_folds, select_calibrated_predictor


def test_calibration_folds_accumulate_full_chronological_seasons() -> None:
    rows = []
    for season_index, season in enumerate(("2022-2023", "2023-2024", "2024-2025")):
        for match_index in range(6):
            rows.append(
                {
                    "source_season": season,
                    "competition_code": "prem",
                    "kickoff_time": pd.Timestamp(
                        year=2022 + season_index,
                        month=8,
                        day=1 + match_index,
                        tz="UTC",
                    ),
                    "target": match_index % 3,
                }
            )
    frame = pd.DataFrame(rows)

    folds = build_calibration_season_folds(
        frame,
        min_train_rows=3,
        min_season_rows=6,
        max_seasons=2,
        blocks_per_season=2,
    )

    assert [fold_id for fold_id, _, _ in folds] == [
        "2023-2024-B1",
        "2023-2024-B2",
        "2024-2025-B1",
        "2024-2025-B2",
    ]
    for _, fit_train, validation in folds:
        assert fit_train["kickoff_time"].max() < validation["kickoff_time"].min()


def test_promotion_gate_keeps_dixon_coles_when_blend_is_not_significant() -> None:
    targets = np.array([0, 1, 2, 0, 1, 2])
    dixon = np.array(
        [
            [0.6, 0.2, 0.2],
            [0.2, 0.6, 0.2],
            [0.2, 0.2, 0.6],
            [0.6, 0.2, 0.2],
            [0.2, 0.6, 0.2],
            [0.2, 0.2, 0.6],
        ]
    )

    weight, _, _, details = select_calibrated_predictor(
        dixon,
        dixon.copy(),
        targets,
        ["fold-1"] * 3 + ["fold-2"] * 3,
        bootstrap_samples=100,
    )

    assert weight == 1.0
    assert details["selected_predictor"] == "dixon_coles"
