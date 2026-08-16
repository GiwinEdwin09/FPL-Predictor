from pathlib import Path

import numpy as np
import pandas as pd

from fpl_predictor.web_dashboard import infer_current_season, load_team_lookup, season_label_for_timestamp


def test_season_label_rolls_forward_in_july() -> None:
    assert season_label_for_timestamp(pd.Timestamp("2026-06-30T12:00:00Z")) == "2025-2026"
    assert season_label_for_timestamp(pd.Timestamp("2026-07-01T12:00:00Z")) == "2026-2027"


def test_current_season_uses_latest_unfinished_premier_league_season() -> None:
    features = pd.DataFrame(
        [
            {"source_season": "2025-2026", "competition_code": "prem", "finished": True},
            {"source_season": "2026-2027", "competition_code": "prem", "finished": False},
        ]
    )

    assert infer_current_season(features) == "2026-2027"


def test_current_season_falls_back_to_latest_completed_data() -> None:
    features = pd.DataFrame(
        [
            {"source_season": "2024-2025", "competition_code": "prem", "finished": True},
            {"source_season": "2025-2026", "competition_code": "prem", "finished": True},
        ]
    )

    assert infer_current_season(features) == "2025-2026"


def test_team_lookup_ignores_missing_fotmob_name(tmp_path: Path) -> None:
    season_dir = tmp_path / "raw" / "2026-2027"
    season_dir.mkdir(parents=True)
    pd.DataFrame(
        [
            {
                "code": 3,
                "name": "Arsenal",
                "short_name": "ARS",
                "fotmob_name": np.nan,
            }
        ]
    ).to_csv(season_dir / "teams.csv", index=False)

    lookup = load_team_lookup(tmp_path)

    assert lookup[("2026-2027", 3)]["name"] == "Arsenal"
