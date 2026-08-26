from pathlib import Path

import numpy as np
import pandas as pd

from fpl_predictor.prediction_ledger import (
    PREDICTION_TYPE_PRE_KICKOFF,
    PREDICTION_TYPE_REPLAY,
    PREDICTION_TYPE_WALK_FORWARD,
    LedgerEntry,
    load_ledger,
    save_ledger,
    should_lock,
    sync_fixture_predictions,
    upsert_prediction,
    walk_forward_probabilities,
)


def test_unlocked_pre_kickoff_entries_are_updated() -> None:
    entries: dict[str, LedgerEntry] = {}
    now = pd.Timestamp("2026-08-20T12:00:00Z")
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.5, "draw": 0.3, "awayWin": 0.2},
        model_version="model_v3",
        kickoff_time="2026-08-21T15:00:00Z",
        now_utc=now,
    )
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.6, "draw": 0.25, "awayWin": 0.15},
        model_version="model_v3",
        kickoff_time="2026-08-21T15:00:00Z",
        now_utc=now,
    )

    assert entries["m1"].probabilities["homeWin"] == 0.6
    assert entries["m1"].locked is False
    assert entries["m1"].prediction_type == PREDICTION_TYPE_PRE_KICKOFF


def test_locked_entries_are_never_overwritten() -> None:
    entries: dict[str, LedgerEntry] = {}
    kickoff = "2026-08-16T15:00:00Z"
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities=np.array([0.4, 0.3, 0.3]),
        model_version="model_v3",
        kickoff_time=kickoff,
        now_utc=pd.Timestamp("2026-08-16T14:00:00Z"),
    )
    frozen = dict(entries["m1"].probabilities)
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities=np.array([0.9, 0.05, 0.05]),
        model_version="model_v3-new",
        kickoff_time=kickoff,
        finished=True,
        now_utc=pd.Timestamp("2026-08-16T18:00:00Z"),
    )

    assert entries["m1"].locked is True
    assert entries["m1"].probabilities == frozen
    assert entries["m1"].model_version == "model_v3"


def test_kickoff_locks_the_last_pre_match_prediction_without_rescoring() -> None:
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.42, "draw": 0.28, "awayWin": 0.30},
        model_version="model_v3",
        kickoff_time="2026-08-16T15:00:00Z",
        now_utc=pd.Timestamp("2026-08-16T14:59:00Z"),
    )
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.10, "draw": 0.10, "awayWin": 0.80},
        model_version="model_v3",
        kickoff_time="2026-08-16T15:00:00Z",
        now_utc=pd.Timestamp("2026-08-16T15:00:00Z"),
    )

    assert entries["m1"].locked is True
    assert entries["m1"].probabilities["homeWin"] == 0.42


def test_finished_match_without_prior_entry_is_locked_as_replay() -> None:
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="old",
        probabilities={"homeWin": 0.5, "draw": 0.25, "awayWin": 0.25},
        model_version="model_v3",
        kickoff_time="2026-05-01T15:00:00Z",
        finished=True,
        prediction_type=PREDICTION_TYPE_REPLAY,
        now_utc=pd.Timestamp("2026-08-20T12:00:00Z"),
    )

    assert entries["old"].locked is True
    assert entries["old"].prediction_type == PREDICTION_TYPE_REPLAY


def test_locked_entry_can_fill_missing_kickoff_without_changing_probabilities() -> None:
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="old",
        probabilities={"homeWin": 0.5, "draw": 0.25, "awayWin": 0.25},
        model_version="model_v3",
        finished=True,
        prediction_type=PREDICTION_TYPE_REPLAY,
    )
    frozen = dict(entries["old"].probabilities)
    upsert_prediction(
        entries,
        match_id="old",
        probabilities={"homeWin": 0.9, "draw": 0.05, "awayWin": 0.05},
        model_version="other",
        kickoff_time="2026-05-01T15:00:00Z",
        finished=True,
        prediction_type=PREDICTION_TYPE_REPLAY,
    )

    assert entries["old"].locked is True
    assert entries["old"].probabilities == frozen
    assert entries["old"].model_version == "model_v3"
    assert entries["old"].kickoff_time_utc == "2026-05-01T15:00:00+00:00"


def test_should_lock_uses_kickoff_and_finished_flag() -> None:
    now = pd.Timestamp("2026-08-20T12:00:00Z")
    assert should_lock(kickoff_time="2026-08-21T15:00:00Z", now_utc=now) is False
    assert should_lock(kickoff_time="2026-08-19T15:00:00Z", now_utc=now) is True
    assert should_lock(kickoff_time=None, finished=True, now_utc=now) is True


def test_ledger_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "predictions_ledger.json"
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.5, "draw": 0.3, "awayWin": 0.2},
        model_version="model_v3",
        kickoff_time="2026-08-21T15:00:00Z",
        now_utc=pd.Timestamp("2026-08-20T12:00:00Z"),
    )
    save_ledger(path, entries)
    reloaded = load_ledger(path)
    assert reloaded["m1"].probabilities["draw"] == 0.3
    assert reloaded["m1"].locked is False


def test_walk_forward_backfill_maps_blend_probabilities_by_match_id() -> None:
    payload = {
        "predictions": [
            {
                "match_id": "25-26-prem-a-vs-b",
                "models": {
                    "blend_v3": {"home_win": 0.41, "draw": 0.29, "away_win": 0.30},
                },
            }
        ]
    }
    lookup = walk_forward_probabilities(payload)
    assert lookup["25-26-prem-a-vs-b"]["homeWin"] == 0.41


def test_sync_skips_locked_rows() -> None:
    entries: dict[str, LedgerEntry] = {}
    now = pd.Timestamp("2026-08-20T12:00:00Z")
    fixtures = [
        {
            "match_id": "live",
            "probabilities": {"homeWin": 0.5, "draw": 0.3, "awayWin": 0.2},
            "kickoff_time": "2026-08-22T15:00:00Z",
            "finished": False,
        },
        {
            "match_id": "done",
            "probabilities": {"homeWin": 0.7, "draw": 0.2, "awayWin": 0.1},
            "kickoff_time": "2026-08-10T15:00:00Z",
            "finished": True,
            "prediction_type": PREDICTION_TYPE_WALK_FORWARD,
        },
    ]
    assert sync_fixture_predictions(entries, fixtures, model_version="model_v3", now_utc=now) == 2
    assert sync_fixture_predictions(entries, fixtures, model_version="other", now_utc=now) == 1
    assert entries["live"].model_version == "other"
    assert entries["done"].locked is True
    assert entries["done"].model_version == "model_v3"
    assert entries["done"].probabilities["homeWin"] == 0.7


def test_save_ledger_does_not_rewrite_when_entries_are_unchanged(tmp_path: Path) -> None:
    path = tmp_path / "predictions_ledger.json"
    entries: dict[str, LedgerEntry] = {}
    upsert_prediction(
        entries,
        match_id="m1",
        probabilities={"homeWin": 0.5, "draw": 0.3, "awayWin": 0.2},
        model_version="model_v3",
        kickoff_time="2026-08-21T15:00:00Z",
        now_utc=pd.Timestamp("2026-08-20T12:00:00Z"),
    )
    save_ledger(path, entries)
    first_mtime = path.stat().st_mtime_ns
    first_payload = path.read_text(encoding="utf-8")
    save_ledger(path, entries)
    assert path.read_text(encoding="utf-8") == first_payload
    assert path.stat().st_mtime_ns == first_mtime
