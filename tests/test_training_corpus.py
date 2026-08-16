from pathlib import Path

import pandas as pd

from fpl_predictor.training_corpus import (
    attach_historical_odds,
    load_team_key_lookup,
    merge_training_matches,
    overlap_key,
    team_key_for_fci_row,
)


def test_fci_rows_win_on_overlapping_fixtures() -> None:
    fci = pd.DataFrame(
        {
            "match_id": ["fci-1"],
            "source": ["fpl-core-insights"],
            "home_team_key": ["arsenal"],
            "away_team_key": ["chelsea"],
            "kickoff_time": ["2025-08-16T12:30:00Z"],
            "home_score": [2],
            "away_score": [1],
            "source_season": ["2025-2026"],
        }
    )
    historical = pd.DataFrame(
        {
            "match_id": ["fd-1", "fd-old"],
            "source": ["football-data.co.uk", "football-data.co.uk"],
            "home_team_key": ["arsenal", "leeds"],
            "away_team_key": ["chelsea", "everton"],
            "kickoff_time": ["2025-08-16T12:30:00Z", "1995-08-19T14:00:00Z"],
            "home_score": [2, 1],
            "away_score": [1, 0],
            "source_season": ["2025-2026", "1995-1996"],
            "market_home_odds": [1.8, 2.1],
            "market_draw_odds": [3.5, 3.2],
            "market_away_odds": [4.5, 3.6],
            "market_home_probability": [0.5, 0.4],
            "market_draw_probability": [0.25, 0.3],
            "market_away_probability": [0.25, 0.3],
            "market_odds_source": ["B365H/B365D/B365A", "B365H/B365D/B365A"],
        }
    )
    for column in (
        "market_home_odds",
        "market_draw_odds",
        "market_away_odds",
        "market_home_probability",
        "market_draw_probability",
        "market_away_probability",
        "market_odds_source",
    ):
        fci[column] = None

    fci, attached = attach_historical_odds(fci, historical)
    combined, counts = merge_training_matches(fci, historical)

    assert attached == 1
    assert counts["overlap_rows"] == 1
    assert counts["historical_only_rows"] == 1
    assert combined["match_id"].tolist() == ["fd-old", "fci-1"]
    assert combined.loc[combined["match_id"] == "fci-1", "source"].iloc[0] == "fpl-core-insights"
    assert combined.loc[combined["match_id"] == "fci-1", "market_home_odds"].iloc[0] == 1.8
    assert overlap_key("arsenal", "chelsea", "2025-08-16T12:30:00Z")[0] == "2025-08-16"


def test_team_key_lookup_uses_fpl_code_not_season_id(tmp_path: Path) -> None:
    season_dir = tmp_path / "raw" / "2024-2025"
    season_dir.mkdir(parents=True)
    pd.DataFrame(
        {
            "code": [1, 3],
            "id": [14, 1],
            "name": ["Man Utd", "Arsenal"],
        }
    ).to_csv(season_dir / "teams.csv", index=False)

    lookup = load_team_key_lookup(tmp_path)

    assert lookup[("2024-2025", 1)] == "manchester-united"
    assert lookup[("2024-2025", 3)] == "arsenal"
    assert team_key_for_fci_row("2024-2025", 1, lookup) == "manchester-united"
