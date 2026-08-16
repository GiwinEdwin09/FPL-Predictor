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


def test_build_pre_match_feature_table_can_emit_all_competitions() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "cup1",
                "source_season": "2025-2026",
                "source_gameweek": 1,
                "tournament": "europa-league",
                "gameweek": 1,
                "kickoff_time": "2025-08-01 19:00:00",
                "finished": False,
                "home_team": 1,
                "away_team": 2,
                "home_team_elo": 1500,
                "away_team_elo": 1400,
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
            }
        ]
    )

    feature_table = build_pre_match_feature_table(matches, competition_scope="all")
    assert feature_table["match_id"].tolist() == ["cup1"]
    assert feature_table.iloc[0]["is_cup_match"] == 1
    assert feature_table.iloc[0]["is_european_match"] == 1


def test_build_pre_match_feature_table_handles_mixed_timezone_kickoff_formats() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "old-season",
                "source_season": "2024-2025",
                "source_gameweek": 1,
                "tournament": "Premier League",
                "gameweek": 1,
                "kickoff_time": "2025-05-11 15:00:00",
                "finished": True,
                "home_team": 1,
                "away_team": 2,
                "home_team_elo": 1500,
                "away_team_elo": 1490,
                "home_score": 1,
                "away_score": 0,
                "home_expected_goals_xg": 1.1,
                "away_expected_goals_xg": 0.6,
                "home_shots_on_target": 4,
                "away_shots_on_target": 2,
                "home_big_chances": 2,
                "away_big_chances": 1,
                "home_tackles_won": 9,
                "away_tackles_won": 10,
            },
            {
                "match_id": "new-season",
                "source_season": "2025-2026",
                "source_gameweek": 1,
                "tournament": "prem",
                "gameweek": 1,
                "kickoff_time": "2025-08-16T16:30:00+00:00",
                "finished": False,
                "home_team": 1,
                "away_team": 3,
                "home_team_elo": 1510,
                "away_team_elo": 1480,
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
                "match_id": "no-kickoff",
                "source_season": "2025-2026",
                "source_gameweek": 2,
                "tournament": "prem",
                "gameweek": 2,
                "kickoff_time": None,
                "finished": False,
                "home_team": 2,
                "away_team": 3,
                "home_team_elo": 1495,
                "away_team_elo": 1485,
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

    assert feature_table["match_id"].tolist() == ["old-season", "new-season", "no-kickoff"]
    assert str(feature_table["kickoff_time"].dt.tz) == "UTC"
    row = feature_table.loc[feature_table["match_id"] == "new-season"].iloc[0]
    assert row["home_last5_matches"] == 1
    assert row["home_days_rest"] == 97 + 1.5 / 24


def test_result_only_history_keeps_clean_sheets_and_marks_missing_xg() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "old-1",
                "source_season": "2004-2005",
                "source_gameweek": 1,
                "tournament": "prem",
                "gameweek": 1,
                "kickoff_time": "2004-08-14 15:00:00",
                "finished": True,
                "home_team": "arsenal",
                "away_team": "everton",
                "home_score": 2,
                "away_score": 0,
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
                "match_id": "new-1",
                "source_season": "2004-2005",
                "source_gameweek": 2,
                "tournament": "prem",
                "gameweek": 2,
                "kickoff_time": "2004-08-21 15:00:00",
                "finished": False,
                "home_team": "chelsea",
                "away_team": "arsenal",
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
    row = feature_table.loc[feature_table["match_id"] == "new-1"].iloc[0]

    assert row["away_last5_matches"] == 1
    assert row["away_last5_clean_sheet_rate"] == 1.0
    assert row["away_last5_xg_observations"] == 0
    assert math.isnan(row["away_last5_avg_xg"])
    assert row["has_xg_coverage"] == 0
    assert row["away_current_elo"] > 1500


def test_historical_rows_can_warm_ratings_without_being_emitted() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "fd-1",
                "source": "football-data.co.uk",
                "source_season": "2023-2024",
                "source_gameweek": 38,
                "tournament": "prem",
                "gameweek": 38,
                "kickoff_time": "2024-05-19 15:00:00",
                "finished": True,
                "home_team": "arsenal",
                "away_team": "everton",
                "home_team_key": "arsenal",
                "away_team_key": "everton",
                "home_score": 2,
                "away_score": 1,
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
                "match_id": "fci-1",
                "source": "fpl-core-insights",
                "source_season": "2024-2025",
                "source_gameweek": 1,
                "tournament": "prem",
                "gameweek": 1,
                "kickoff_time": "2024-08-17 15:00:00",
                "finished": False,
                "home_team": 1,
                "away_team": 2,
                "home_team_key": "arsenal",
                "away_team_key": "everton",
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

    feature_table = build_pre_match_feature_table(matches, include_historical_rows=False)

    assert feature_table["match_id"].tolist() == ["fci-1"]
    row = feature_table.iloc[0]
    assert row["home_team"] == 1
    assert row["home_last5_matches"] == 1
    assert row["home_current_elo"] != 1500
    assert row["home_pi_rating"] != 0

