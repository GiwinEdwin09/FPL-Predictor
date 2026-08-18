import numpy as np
import pandas as pd

from fpl_predictor.model_v3 import (
    build_calibration_season_folds,
    fit_final_blend_predictor,
    select_calibrated_predictor,
    summarize_final_fit,
)


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


def test_final_predictor_refits_every_eligible_finished_match(monkeypatch) -> None:
    frame = pd.DataFrame(
        {
            "source_season": ["1993-1994", "2025-2026", "2025-2026"],
            "kickoff_time": pd.to_datetime(
                ["1993-08-14T14:00:00Z", "2026-05-17T15:00:00Z", "2026-05-24T15:00:00Z"],
                utc=True,
            ),
            "competition_code": ["prem", "prem", "prem"],
            "target": [2, 0, 1],
        }
    )
    captured: dict[str, object] = {}
    tree_model = object()
    dixon_coles = object()

    def fake_fit_components(train, feature_columns, half_life_days, tree_count):
        captured.update(
            rows=len(train),
            feature_columns=feature_columns,
            half_life_days=half_life_days,
            tree_count=tree_count,
        )
        return tree_model, dixon_coles

    monkeypatch.setattr("fpl_predictor.model_v3._fit_blend_components", fake_fit_components)
    predictor = fit_final_blend_predictor(
        frame,
        {
            "tree_n_estimators": 53,
            "dixon_coles_weight": 1.0,
            "calibration_temperature": 1.25,
        },
    )

    assert captured["rows"] == len(frame)
    assert captured["tree_count"] == 53
    assert predictor.tree_model is tree_model
    assert predictor.dixon_coles is dixon_coles
    assert predictor.temperature == 1.0

    summary = summarize_final_fit(frame)
    assert summary["rows"] == 3
    assert summary["seasons"] == 2
    assert summary["first_season"] == "1993-1994"
    assert summary["latest_season"] == "2025-2026"
    assert summary["latest_finished_kickoff_utc"] == "2026-05-24T15:00:00+00:00"
