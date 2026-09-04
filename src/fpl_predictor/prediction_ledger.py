from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping

import numpy as np
import pandas as pd

DEFAULT_LEDGER_PATH = Path("data/predictions_ledger.json")
LEDGER_SCHEMA_VERSION = 1
PREDICTION_TYPE_PRE_KICKOFF = "pre_kickoff"
PREDICTION_TYPE_WALK_FORWARD = "backfill_walk_forward"
PREDICTION_TYPE_REPLAY = "replay"
PROBABILITY_LABELS = ("homeWin", "draw", "awayWin")


@dataclass
class LedgerEntry:
    match_id: str
    probabilities: dict[str, float]
    model_version: str
    generated_at_utc: str
    kickoff_time_utc: str | None
    locked: bool
    prediction_type: str

    def probability_array(self) -> np.ndarray:
        return np.array(
            [self.probabilities[label] for label in PROBABILITY_LABELS],
            dtype=float,
        )

    def to_json(self) -> dict[str, Any]:
        return {
            "matchId": self.match_id,
            "probabilities": dict(self.probabilities),
            "modelVersion": self.model_version,
            "generatedAtUtc": self.generated_at_utc,
            "kickoffTimeUtc": self.kickoff_time_utc,
            "locked": self.locked,
            "predictionType": self.prediction_type,
        }


def probabilities_from_array(values: Any) -> dict[str, float]:
    array = np.asarray(values, dtype=float).reshape(-1)
    if array.shape != (3,):
        raise ValueError("Probabilities must have three outcomes.")
    return {
        "homeWin": round(float(array[0]), 6),
        "draw": round(float(array[1]), 6),
        "awayWin": round(float(array[2]), 6),
    }


def probabilities_from_mapping(values: Mapping[str, Any]) -> dict[str, float]:
    return {
        "homeWin": round(float(values.get("homeWin", values.get("home_win"))), 6),
        "draw": round(float(values.get("draw")), 6),
        "awayWin": round(float(values.get("awayWin", values.get("away_win"))), 6),
    }


def isoformat_kickoff(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    else:
        timestamp = timestamp.tz_convert("UTC")
    return timestamp.isoformat()


def parse_kickoff(value: Any) -> pd.Timestamp | None:
    if value is None or pd.isna(value):
        return None
    timestamp = pd.to_datetime(value, utc=True, errors="coerce", format="mixed")
    if pd.isna(timestamp):
        return None
    return pd.Timestamp(timestamp)


def should_lock(
    *,
    kickoff_time: Any,
    finished: bool = False,
    now_utc: pd.Timestamp | None = None,
) -> bool:
    if finished:
        return True
    kickoff = parse_kickoff(kickoff_time)
    if kickoff is None:
        return False
    now = now_utc if now_utc is not None else pd.Timestamp.now(tz=UTC)
    if now.tzinfo is None:
        now = now.tz_localize("UTC")
    return kickoff <= now


def entry_from_json(payload: Mapping[str, Any]) -> LedgerEntry:
    return LedgerEntry(
        match_id=str(payload["matchId"]),
        probabilities=probabilities_from_mapping(payload["probabilities"]),
        model_version=str(payload.get("modelVersion", "")),
        generated_at_utc=str(payload.get("generatedAtUtc", "")),
        kickoff_time_utc=payload.get("kickoffTimeUtc"),
        locked=bool(payload.get("locked", False)),
        prediction_type=str(payload.get("predictionType", PREDICTION_TYPE_PRE_KICKOFF)),
    )


def load_ledger(path: Path = DEFAULT_LEDGER_PATH) -> dict[str, LedgerEntry]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_entries = payload.get("entries", {})
    if isinstance(raw_entries, list):
        return {str(item["matchId"]): entry_from_json(item) for item in raw_entries}
    return {str(match_id): entry_from_json(item) for match_id, item in raw_entries.items()}


def save_ledger(path: Path, entries: Mapping[str, LedgerEntry]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized_entries = {
        match_id: entries[match_id].to_json()
        for match_id in sorted(entries)
    }
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = None
        if (
            existing is not None
            and existing.get("schema_version") == LEDGER_SCHEMA_VERSION
            and existing.get("entries") == serialized_entries
        ):
            return path
    payload = {
        "schema_version": LEDGER_SCHEMA_VERSION,
        "updated_at_utc": datetime.now(UTC).isoformat(),
        "entries": serialized_entries,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def upsert_prediction(
    entries: dict[str, LedgerEntry],
    *,
    match_id: str,
    probabilities: Mapping[str, float] | np.ndarray,
    model_version: str,
    kickoff_time: Any = None,
    finished: bool = False,
    prediction_type: str = PREDICTION_TYPE_PRE_KICKOFF,
    generated_at_utc: str | None = None,
    now_utc: pd.Timestamp | None = None,
) -> tuple[LedgerEntry, bool]:
    """Insert or update a prediction. Locked entries are never overwritten."""
    existing = entries.get(str(match_id))
    lock = should_lock(kickoff_time=kickoff_time, finished=finished, now_utc=now_utc)
    kickoff_iso = isoformat_kickoff(kickoff_time)

    if existing is not None and existing.locked:
        if kickoff_iso and not existing.kickoff_time_utc:
            existing.kickoff_time_utc = kickoff_iso
            entries[str(match_id)] = existing
            return existing, True
        return existing, False

    if existing is not None and lock:
        existing.locked = True
        if kickoff_iso and not existing.kickoff_time_utc:
            existing.kickoff_time_utc = kickoff_iso
        entries[str(match_id)] = existing
        return existing, True

    if isinstance(probabilities, Mapping):
        serialized = probabilities_from_mapping(probabilities)
    else:
        serialized = probabilities_from_array(probabilities)

    if (
        existing is not None
        and existing.probabilities == serialized
        and existing.model_version == model_version
        and existing.prediction_type == prediction_type
        and existing.kickoff_time_utc == kickoff_iso
    ):
        return existing, False

    entry = LedgerEntry(
        match_id=str(match_id),
        probabilities=serialized,
        model_version=model_version,
        generated_at_utc=generated_at_utc or datetime.now(UTC).isoformat(),
        kickoff_time_utc=kickoff_iso,
        locked=lock,
        prediction_type=prediction_type,
    )
    entries[str(match_id)] = entry
    return entry, True


def sync_fixture_predictions(
    entries: dict[str, LedgerEntry],
    fixtures: Iterable[Mapping[str, Any]],
    *,
    model_version: str,
    now_utc: pd.Timestamp | None = None,
    default_prediction_type: str = PREDICTION_TYPE_PRE_KICKOFF,
) -> int:
    """Upsert predictions for fixtures. Returns the number of writes or lock changes."""
    changed = 0
    for fixture in fixtures:
        match_id = str(fixture["match_id"])
        probabilities = fixture["probabilities"]
        prediction_type = str(fixture.get("prediction_type", default_prediction_type))
        _, wrote = upsert_prediction(
            entries,
            match_id=match_id,
            probabilities=probabilities,
            model_version=model_version,
            kickoff_time=fixture.get("kickoff_time"),
            finished=bool(fixture.get("finished", False)),
            prediction_type=prediction_type,
            now_utc=now_utc,
        )
        if wrote:
            changed += 1
    return changed


def walk_forward_probabilities(backtest_payload: Mapping[str, Any]) -> dict[str, dict[str, float]]:
    lookup: dict[str, dict[str, float]] = {}
    for row in backtest_payload.get("predictions", []):
        models = row.get("models") or {}
        blend = models.get("blend_v3") or models.get("dixon_coles")
        if not blend:
            continue
        lookup[str(row["match_id"])] = probabilities_from_mapping(blend)
    return lookup


def seed_walk_forward_predictions(
    entries: dict[str, LedgerEntry],
    backtest_path: Path,
    *,
    model_version: str = "model_v3",
) -> int:
    if not backtest_path.exists():
        return 0
    payload = json.loads(backtest_path.read_text(encoding="utf-8"))
    changed = 0
    for row in payload.get("predictions", []):
        models = row.get("models") or {}
        blend = models.get("blend_v3") or models.get("dixon_coles")
        if not blend:
            continue
        _, wrote = upsert_prediction(
            entries,
            match_id=str(row["match_id"]),
            probabilities=probabilities_from_mapping(blend),
            model_version=model_version,
            kickoff_time=row.get("kickoff_time"),
            prediction_type=PREDICTION_TYPE_WALK_FORWARD,
            finished=True,
        )
        if wrote:
            changed += 1
    return changed
