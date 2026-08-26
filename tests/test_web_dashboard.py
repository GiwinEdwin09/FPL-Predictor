from pathlib import Path

import numpy as np
import pandas as pd

from fpl_predictor.prediction_ledger import (
    PREDICTION_TYPE_WALK_FORWARD,
    LedgerEntry,
    upsert_prediction,
)
from fpl_predictor.web_dashboard import (
    apply_ledger_to_fixtures,
    build_historical_matches_from_frames,
    infer_current_season,
    load_team_lookup,
    season_label_for_timestamp,
)


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


def test_team_lookup_resolves_promoted_team_badges(tmp_path: Path) -> None:
    season_dir = tmp_path / "raw" / "2026-2027"
    season_dir.mkdir(parents=True)
    pd.DataFrame(
        [
            {"code": 9, "name": "Coventry City", "short_name": "COV"},
            {"code": 88, "name": "Hull City", "short_name": "HUL"},
        ]
    ).to_csv(season_dir / "teams.csv", index=False)

    lookup = load_team_lookup(tmp_path)

    assert lookup[("2026-2027", 9)]["badgePath"] == "/teams/coventry-city.football-logos.cc.png"
    assert lookup[("2026-2027", 88)]["badgePath"] == "/teams/hull-city.football-logos.cc.png"


def test_historical_uses_locked_ledger_instead_of_rescoring() -> None:
    matches = pd.DataFrame(
        [
            {
                "match_id": "m1",
                "competition_code": "prem",
                "finished": True,
                "kickoff_time": "2026-08-16T15:00:00Z",
                "source_season": "2026-2027",
                "gameweek": 1,
                "home_team": 1,
                "away_team": 2,
                "home_score": 1,
                "away_score": 0,
                "match_url": None,
            }
        ]
    )
    features = pd.DataFrame([{"match_id": "m1"}])
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.41, "draw": 0.29, "awayWin": 0.30},
        model_version="model_v3",
        kickoff_time="2026-08-16T15:00:00Z",
        finished=True,
        prediction_type=PREDICTION_TYPE_WALK_FORWARD,
    )
    frozen = dict(entries["m1"].probabilities)

    class BoomModel:
        def predict_proba(self, *_args, **_kwargs):
            raise AssertionError("locked history must not be rescored")

    first = build_historical_matches_from_frames(
        matches,
        features,
        team_lookup={},
        model=BoomModel(),
        ledger_entries=entries,
    )
    second = build_historical_matches_from_frames(
        matches,
        features,
        team_lookup={},
        model=BoomModel(),
        ledger_entries=entries,
    )

    assert first[0]["probabilities"]["homeWin"] == 0.41
    assert first[0]["predictionType"] == PREDICTION_TYPE_WALK_FORWARD
    assert first[0]["probabilities"] == second[0]["probabilities"]
    assert entries["m1"].probabilities == frozen


def test_apply_ledger_overlays_locked_current_fixture_probabilities() -> None:
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="live",
        probabilities={"homeWin": 0.42, "draw": 0.28, "awayWin": 0.30},
        model_version="model_v3",
        kickoff_time="2026-08-16T15:00:00Z",
        now_utc=pd.Timestamp("2026-08-16T16:00:00Z"),
    )
    fixtures = [
        {
            "matchId": "live",
            "probabilities": {"homeWin": 0.9, "draw": 0.05, "awayWin": 0.05},
        }
    ]

    apply_ledger_to_fixtures(fixtures, entries)

    assert fixtures[0]["probabilities"]["homeWin"] == 0.42
    assert fixtures[0]["predictionType"] == "pre_kickoff"
