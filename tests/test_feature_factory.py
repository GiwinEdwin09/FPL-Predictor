import math

import pandas as pd

from fpl_predictor.feature_factory import build_pre_match_feature_table


def test_build_pre_match_feature_table_uses_previous_finished_matches_only() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "source_season": "2024-2025",
                "source_gameweek": 1,
                "tournament": "Premier League",
                "gameweek": 1,
                "kickoff_time": "2024-08-01 12:00:00",
                "finished": True,
                "home_team": 1,
                "away_team": 2,
                "home_team_elo": 1500,
                "away_team_elo": 1490,
                "home_score": 2,
                "away_score": 0,
                "home_expected_goals_xg": 1.2,
                "away_expected_goals_xg": 0.4,
                "home_shots_on_target": 5,
                "away_shots_on_target": 1,
                "home_big_chances": 2,
                "away_big_chances": 0,
                "home_tackles_won": 10,
                "away_tackles_won": 8,
            },
            {
                "match_id": "m2",
                "source_season": "2024-2025",
                "source_gameweek": 2,
                "tournament": "Premier League",
                "gameweek": 2,
                "kickoff_time": "2024-08-08 12:00:00",
                "finished": True,
                "home_team": 1,
                "away_team": 3,
                "home_team_elo": 1510,
                "away_team_elo": 1480,
                "home_score": 1,
                "away_score": 1,
                "home_expected_goals_xg": 0.8,
                "away_expected_goals_xg": 0.9,
                "home_shots_on_target": 3,
                "away_shots_on_target": 4,
                "home_big_chances": 1,
                "away_big_chances": 1,
                "home_tackles_won": 9,
                "away_tackles_won": 11,
            },
            {
                "match_id": "m3",
                "source_season": "2024-2025",
                "source_gameweek": 3,
                "tournament": "Premier League",
                "gameweek": 3,
                "kickoff_time": "2024-08-15 12:00:00",
                "finished": False,
                "home_team": 2,
                "away_team": 1,
                "home_team_elo": 1495,
                "away_team_elo": 1515,
                "home_score": None,
                "away_score": None,
                "home_expected_goals_xg": None,
                "away_expected_goals_xg": None,
                "home_shots_on_target": None,
                "away_shots_on_target": None,
                "home_big_chances": None,
                "away_big_chances": None,
                "home_tackles_won": None,
                "away_tackles_won": None,
            },
            {
                "match_id": "m4",
                "source_season": "2024-2025",
                "source_gameweek": 4,
                "tournament": "Premier League",
                "gameweek": 4,
                "kickoff_time": "2024-08-22 12:00:00",
                "finished": False,
                "home_team": 1,
                "away_team": 4,
                "home_team_elo": 1520,
                "away_team_elo": 1470,
                "home_score": None,
                "away_score": None,
                "home_expected_goals_xg": None,
                "away_expected_goals_xg": None,
                "home_shots_on_target": None,
                "away_shots_on_target": None,
                "home_big_chances": None,
                "away_big_chances": None,
                "home_tackles_won": None,
                "away_tackles_won": None,
            },
        ]
    )

    feature_table = build_pre_match_feature_table(matches)

    row_m3 = feature_table.loc[feature_table["match_id"] == "m3"].iloc[0]
    assert row_m3["home_last5_matches"] == 1
    assert row_m3["away_last5_matches"] == 2
    assert row_m3["home_last5_avg_xg"] == 0.4
    assert row_m3["away_last5_avg_xg"] == 1.0
    assert row_m3["away_last5_clean_sheet_rate"] == 0.5
    assert row_m3["home_days_rest"] == 14
    assert row_m3["away_days_rest"] == 7

    row_m4 = feature_table.loc[feature_table["match_id"] == "m4"].iloc[0]
    assert row_m4["home_last5_matches"] == 2
    assert row_m4["home_last5_avg_shots_on_target"] == 4.0
    assert row_m4["home_last5_avg_big_chances"] == 1.5
    assert row_m4["home_last5_avg_tackles_won"] == 9.5
    assert row_m4["home_days_rest"] == 14
    assert math.isnan(row_m4["away_last5_avg_xg"])


def test_build_pre_match_feature_table_filters_to_premier_league_but_uses_other_competitions_in_history() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "cup1",
                "source_season": "2025-2026",
                "source_gameweek": 1,
                "tournament": "europa-league",
                "gameweek": 1,
                "kickoff_time": "2025-08-01 19:00:00",
                "finished": True,
                "home_team": 1,
                "away_team": 50,
                "home_team_elo": 1500,
                "away_team_elo": 1400,
                "home_score": 2,
                "away_score": 0,
                "home_expected_goals_xg": 1.4,
                "away_expected_goals_xg": 0.3,
                "home_shots_on_target": 6,
                "away_shots_on_target": 1,
                "home_big_chances": 2,
                "away_big_chances": 0,
                "home_tackles_won": 8,
                "away_tackles_won": 10,
            },
            {
                "match_id": "prem1",
                "source_season": "2025-2026",
                "source_gameweek": 2,
                "tournament": "prem",
                "gameweek": 2,
                "kickoff_time": None,
                "finished": False,
                "home_team": 1,
                "away_team": 2,
                "home_team_elo": 1510,
                "away_team_elo": 1490,
                "home_score": None,
                "away_score": None,
                "home_expected_goals_xg": None,
                "away_expected_goals_xg": None,
                "home_shots_on_target": None,
                "away_shots_on_target": None,
                "home_big_chances": None,
                "away_big_chances": None,
                "home_tackles_won": None,
                "away_tackles_won": None,
            },
            {
                "match_id": "cup2",
                "source_season": "2025-2026",
                "source_gameweek": 2,
                "tournament": "efl-cup",
                "gameweek": 2,
                "kickoff_time": None,
                "finished": False,
                "home_team": 3,
                "away_team": 4,
                "home_team_elo": 1480,
                "away_team_elo": 1470,
                "home_score": None,
                "away_score": None,
                "home_expected_goals_xg": None,
                "away_expected_goals_xg": None,
                "home_shots_on_target": None,
                "away_shots_on_target": None,
                "home_big_chances": None,
                "away_big_chances": None,
                "home_tackles_won": None,
                "away_tackles_won": None,
            },
        ]
    )

    feature_table = build_pre_match_feature_table(matches)
    assert feature_table["match_id"].tolist() == ["prem1"]
    row = feature_table.iloc[0]
    assert row["home_last5_matches"] == 1
    assert row["home_last5_avg_xg"] == 1.4
    assert math.isnan(row["home_days_rest"])
