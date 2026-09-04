from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from fpl_predictor.model_training import (
    FEATURE_COLUMNS,
    is_premier_league_frame,
    load_prediction_feature_frame,
)
from fpl_predictor.predictors import feature_columns_for_model, predict_match_probabilities
from fpl_predictor.prediction_ledger import (
    DEFAULT_LEDGER_PATH,
    PREDICTION_TYPE_PRE_KICKOFF,
    PREDICTION_TYPE_REPLAY,
    LedgerEntry,
    load_ledger,
    save_ledger,
    seed_walk_forward_predictions,
    sync_fixture_predictions,
    upsert_prediction,
)

def season_label_for_timestamp(value: pd.Timestamp) -> str:
    timestamp = pd.Timestamp(value)
    start_year = timestamp.year if timestamp.month >= 7 else timestamp.year - 1
    return f"{start_year}-{start_year + 1}"


DEFAULT_BADGE = "club"
BADGE_ALIASES = {
    "afc bournemouth": "bournemouth",
    "arsenal": "arsenal",
    "aston villa": "aston-villa",
    "bournemouth": "bournemouth",
    "brentford": "brentford",
    "brighton": "brighton",
    "brighton & hove albion": "brighton",
    "brighton hove albion": "brighton",
    "burnley": "burnley",
    "chelsea": "chelsea",
    "coventry": "coventry-city",
    "coventry city": "coventry-city",
    "crystal palace": "crystal-palace",
    "everton": "everton",
    "fulham": "fulham",
    "hull": "hull-city",
    "hull city": "hull-city",
    "ipswich": "ipswich",
    "ipswich town": "ipswich",
    "leeds": "leeds-united",
    "leeds united": "leeds-united",
    "leicester": "leicester",
    "leicester city": "leicester",
    "liverpool": "liverpool",
    "man city": "manchester-city",
    "man utd": "manchester-united",
    "manchester city": "manchester-city",
    "manchester united": "manchester-united",
    "newcastle": "newcastle",
    "newcastle united": "newcastle",
    "nott'm forest": "nottingham-forest",
    "nottingham forest": "nottingham-forest",
    "southampton": "southampton",
    "sunderland": "sunderland",
    "spurs": "tottenham",
    "tottenham hotspur": "tottenham",
    "west ham": "west-ham",
    "west ham united": "west-ham",
    "wolves": "wolves",
    "wolverhampton wanderers": "wolves",
}
RECENT_HISTORY_LIMIT: int | None = None
DEFAULT_WALK_FORWARD_PATH = Path("data/models/model_v3_walk_forward_backtest.json")


def infer_current_season(
    features: pd.DataFrame,
    now_utc: pd.Timestamp | None = None,
) -> str:
    if now_utc is None:
        now_utc = pd.Timestamp.now(tz=UTC)
    if "source_season" not in features.columns or features.empty:
        return season_label_for_timestamp(now_utc)
    premier_league = features.loc[is_premier_league_frame(features)].copy()
    seasons = sorted(str(value) for value in premier_league["source_season"].dropna().unique())
    if not seasons:
        return season_label_for_timestamp(now_utc)
    unfinished = premier_league.loc[premier_league["finished"] != True, "source_season"]
    unfinished_seasons = sorted(str(value) for value in unfinished.dropna().unique())
    return unfinished_seasons[-1] if unfinished_seasons else seasons[-1]


def normalize_team_name(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().casefold()


def first_present_value(*values: Any, fallback: str) -> str:
    for value in values:
        if value is None or pd.isna(value):
            continue
        text = str(value).strip()
        if text and text.casefold() != "nan":
            return text
    return fallback


def coerce_int(value: Any) -> int | None:
    if pd.isna(value):
        return None
    return int(value)


def coerce_float(value: Any, digits: int = 2) -> float | None:
    if pd.isna(value):
        return None
    return round(float(value), digits)


def load_team_lookup(data_dir: Path) -> dict[tuple[str, int], dict[str, Any]]:
    lookup: dict[tuple[str, int], dict[str, Any]] = {}
    for season_dir in sorted((data_dir / "raw").iterdir()):
        teams_path = season_dir / "teams.csv"
        if not teams_path.exists():
            continue
        teams = pd.read_csv(teams_path)
        for row in teams.to_dict(orient="records"):
            team_code = coerce_int(row.get("code"))
            if team_code is None:
                continue
            name = first_present_value(
                row.get("fotmob_name"),
                row.get("name"),
                fallback=f"Team {team_code}",
            )
            short_name = first_present_value(
                row.get("short_name"),
                row.get("name"),
                fallback=name,
            )
            badge_slug = BADGE_ALIASES.get(normalize_team_name(name))
            if badge_slug is None:
                badge_slug = BADGE_ALIASES.get(normalize_team_name(short_name), DEFAULT_BADGE)
            lookup[(season_dir.name, team_code)] = {
                "id": team_code,
                "name": name,
                "shortName": short_name,
                "badgeSlug": badge_slug,
                "badgePath": (
                    None
                    if badge_slug == DEFAULT_BADGE
                    else f"/teams/{badge_slug}.football-logos.cc.png"
                ),
            }
    return lookup


def serialize_team(team_lookup: dict[tuple[str, int], dict[str, Any]], season: str, team_id: Any) -> dict[str, Any]:
    coerced_id = coerce_int(team_id)
    if coerced_id is None:
        return {
            "id": None,
            "name": "Unknown Club",
            "shortName": "Unknown",
            "badgeSlug": DEFAULT_BADGE,
            "badgePath": None,
        }
    team = team_lookup.get((season, coerced_id))
    if team is not None:
        return team
    return {
        "id": coerced_id,
        "name": f"Club {coerced_id}",
        "shortName": f"Club {coerced_id}",
        "badgeSlug": DEFAULT_BADGE,
        "badgePath": None,
    }


def load_model_metadata(metrics_path: Path) -> tuple[float, dict[str, Any]]:
    payload = json.loads(metrics_path.read_text(encoding="utf-8"))
    return float(payload.get("calibration_temperature", 1.0)), payload


def load_model(model_path: Path) -> Any:
    text = model_path.read_text(encoding="utf-8")
    if '"predictor_type"' in text[:1_000]:
        from fpl_predictor.predictors import BlendPredictor

        return BlendPredictor.load(model_path)
    try:
        from xgboost import XGBClassifier
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "xgboost is required to export dashboard predictions.",
        ) from exc

    model = XGBClassifier()
    model.load_model(model_path)
    return model


def latest_completed_gameweek(features: pd.DataFrame, season: str) -> int | None:
    completed = features.loc[
        (features["source_season"] == season)
        & is_premier_league_frame(features)
        & (features["finished"] == True)
    ].copy()
    if completed.empty:
        return None
    value = pd.to_numeric(completed.get("source_gameweek").fillna(completed.get("gameweek")), errors="coerce").max()
    if pd.isna(value):
        return None
    return int(value)


def should_include_upcoming_match(
    row: dict[str, Any],
    *,
    now_utc: pd.Timestamp,
    latest_completed_gw: int | None,
) -> bool:
    kickoff_time = row.get("kickoff_time")
    gameweek = coerce_int(row.get("source_gameweek")) or coerce_int(row.get("gameweek"))

    if pd.notna(kickoff_time):
        kickoff_timestamp = pd.Timestamp(kickoff_time)
        if kickoff_timestamp.tzinfo is None:
            kickoff_timestamp = kickoff_timestamp.tz_localize("UTC")
        return kickoff_timestamp > now_utc

    if latest_completed_gw is not None and gameweek is not None and gameweek <= latest_completed_gw:
        return False

    return True


def is_postponed_match(
    row: dict[str, Any],
    *,
    latest_completed_gw: int | None,
) -> bool:
    gameweek = coerce_int(row.get("source_gameweek")) or coerce_int(row.get("gameweek"))
    kickoff_time = row.get("kickoff_time")
    if pd.notna(kickoff_time):
        return False
    if latest_completed_gw is None or gameweek is None:
        return False
    return gameweek <= latest_completed_gw


def serialize_probabilities(probability: Any) -> dict[str, float]:
    return {
        "homeWin": round(float(probability[0]), 4),
        "draw": round(float(probability[1]), 4),
        "awayWin": round(float(probability[2]), 4),
    }


def serialized_probability_mapping(probability: Any) -> dict[str, float]:
    if isinstance(probability, dict):
        return {
            "homeWin": float(probability["homeWin"]),
            "draw": float(probability["draw"]),
            "awayWin": float(probability["awayWin"]),
        }
    return serialize_probabilities(probability)


def ledger_rows_from_fixtures(items: list[dict[str, Any]], *, finished: bool = False) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in items:
        probabilities = item.get("probabilities")
        if probabilities is None:
            continue
        rows.append(
            {
                "match_id": item["matchId"],
                "probabilities": serialized_probability_mapping(probabilities),
                "kickoff_time": item.get("kickoffTime"),
                "finished": finished or bool(item.get("finished")),
                "prediction_type": item.get("predictionType", PREDICTION_TYPE_PRE_KICKOFF),
            }
        )
    return rows


def apply_ledger_to_fixtures(
    items: list[dict[str, Any]],
    entries: dict[str, LedgerEntry],
) -> list[dict[str, Any]]:
    for item in items:
        entry = entries.get(str(item["matchId"]))
        if entry is None:
            continue
        item["probabilities"] = serialize_probabilities(entry.probability_array())
        item["predictionType"] = entry.prediction_type
    return items


def serialize_prediction_fixture(
    row: dict[str, Any],
    probability: Any,
    team_lookup: dict[tuple[str, int], dict[str, Any]],
) -> dict[str, Any]:
    return {
        "matchId": row["match_id"],
        "season": row["source_season"],
        "gameweek": coerce_int(row.get("source_gameweek")) or coerce_int(row.get("gameweek")),
        "kickoffTime": (
            pd.Timestamp(row["kickoff_time"]).tz_localize("UTC").isoformat()
            if pd.notna(row.get("kickoff_time")) and pd.Timestamp(row["kickoff_time"]).tzinfo is None
            else (
                pd.Timestamp(row["kickoff_time"]).isoformat()
                if pd.notna(row.get("kickoff_time"))
                else None
            )
        ),
        "homeTeam": serialize_team(team_lookup, row["source_season"], row["home_team"]),
        "awayTeam": serialize_team(team_lookup, row["source_season"], row["away_team"]),
        "finished": bool(row.get("finished")) if pd.notna(row.get("finished")) else False,
        "score": {
            "home": coerce_int(row.get("home_score")),
            "away": coerce_int(row.get("away_score")),
        },
        "probabilities": serialize_probabilities(probability),
        "context": {
            "homeElo": coerce_float(row.get("home_current_elo"), 0),
            "awayElo": coerce_float(row.get("away_current_elo"), 0),
            "homeDaysRest": coerce_float(row.get("home_days_rest")),
            "awayDaysRest": coerce_float(row.get("away_days_rest")),
            "homeLast5Xg": coerce_float(row.get("home_last5_avg_xg")),
            "awayLast5Xg": coerce_float(row.get("away_last5_avg_xg")),
            "homeLast5Xga": coerce_float(row.get("home_last5_avg_xga")),
            "awayLast5Xga": coerce_float(row.get("away_last5_avg_xga")),
            "homeLast5Matches": coerce_int(row.get("home_last5_matches")),
            "awayLast5Matches": coerce_int(row.get("away_last5_matches")),
        },
    }


def current_active_gameweek(features: pd.DataFrame, season: str, now_utc: pd.Timestamp) -> int | None:
    current_candidates = features.loc[
        (features["source_season"] == season)
        & is_premier_league_frame(features)
        & (features["finished"] != True)
        & features["kickoff_time"].notna()
        & (features["kickoff_time"] <= now_utc)
    ].copy()
    if current_candidates.empty:
        return None
    value = pd.to_numeric(
        current_candidates.get("source_gameweek").fillna(current_candidates.get("gameweek")),
        errors="coerce",
    ).min()
    if pd.isna(value):
        return None
    return int(value)


def build_prediction_groups_from_frame(
    features: pd.DataFrame,
    *,
    model: Any,
    temperature: float,
    team_lookup: dict[tuple[str, int], dict[str, Any]],
    now_utc: pd.Timestamp | None = None,
    season: str | None = None,
) -> tuple[int | None, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    if now_utc is None:
        now_utc = pd.Timestamp.now(tz=UTC)
    if season is None:
        season = infer_current_season(features, now_utc)

    latest_completed_gw = latest_completed_gameweek(features, season)
    current_gameweek = current_active_gameweek(features, season, now_utc)
    unresolved = features.loc[
        is_premier_league_frame(features)
        & (features["source_season"] == season)
        & (features["finished"] != True)
    ].copy()
    postponed = unresolved.loc[
        unresolved.apply(
            lambda row: is_postponed_match(
                row.to_dict(),
                latest_completed_gw=latest_completed_gw,
            ),
            axis=1,
        )
    ].copy()
    current = features.loc[
        is_premier_league_frame(features)
        & (features["source_season"] == season)
        & (
            pd.to_numeric(features.get("source_gameweek").fillna(features.get("gameweek")), errors="coerce")
            == current_gameweek
        )
    ].copy() if current_gameweek is not None else features.iloc[0:0].copy()
    current = current.loc[
        ~current.apply(
            lambda row: is_postponed_match(
                row.to_dict(),
                latest_completed_gw=latest_completed_gw,
            ),
            axis=1,
        )
    ].copy()
    upcoming = unresolved.loc[
        unresolved.apply(
            lambda row: should_include_upcoming_match(
                row.to_dict(),
                now_utc=now_utc,
                latest_completed_gw=latest_completed_gw,
            ),
            axis=1,
        )
    ].copy()
    if current_gameweek is not None:
        upcoming = upcoming.loc[
            pd.to_numeric(upcoming.get("source_gameweek").fillna(upcoming.get("gameweek")), errors="coerce")
            != current_gameweek
        ].copy()
    upcoming = upcoming.sort_values(
        ["kickoff_time", "source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)
    current = current.sort_values(
        ["kickoff_time", "source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)
    postponed = postponed.sort_values(
        ["source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)

    if upcoming.empty and postponed.empty and current.empty:
        current_fixtures: list[dict[str, Any]] = []
        upcoming_fixtures: list[dict[str, Any]] = []
        postponed_fixtures: list[dict[str, Any]] = []
        return current_gameweek, current_fixtures, upcoming_fixtures, postponed_fixtures

    def serialize_rows(frame: pd.DataFrame, *, postponed_reason: str | None = None) -> list[dict[str, Any]]:
        if frame.empty:
            return []
        probabilities = predict_match_probabilities(
            model,
            frame,
            feature_columns=feature_columns_for_model(model, FEATURE_COLUMNS),
            temperature=temperature,
        )
        items: list[dict[str, Any]] = []
        for row, probability in zip(frame.to_dict(orient="records"), probabilities, strict=True):
            item = serialize_prediction_fixture(row, probability, team_lookup)
            if postponed_reason is not None:
                item["status"] = "postponed"
                item["statusReason"] = postponed_reason
            items.append(item)
        return items

    current_fixtures = serialize_rows(current)
    for item in current_fixtures:
        item["status"] = "current"
    upcoming_fixtures = serialize_rows(upcoming)
    postponed_fixtures = serialize_rows(
        postponed,
        postponed_reason="Awaiting a confirmed kickoff time from the source data.",
    )
    return current_gameweek, current_fixtures, upcoming_fixtures, postponed_fixtures


def build_history_probabilities(
    history_match_ids: list[Any],
    feature_lookup: pd.DataFrame,
    model: Any,
    temperature: float,
) -> dict[str, Any]:
    batch_rows: list[pd.Series] = []
    batch_ids: list[str] = []
    for match_id in dict.fromkeys(history_match_ids):
        if match_id not in feature_lookup.index:
            continue
        match_rows = feature_lookup.loc[[match_id]]
        batch_rows.append(match_rows.iloc[0])
        batch_ids.append(match_id)

    if not batch_rows:
        return {}

    batch = pd.DataFrame(batch_rows)
    probabilities = predict_match_probabilities(
        model,
        batch,
        feature_columns=feature_columns_for_model(model, FEATURE_COLUMNS),
        temperature=temperature,
    )
    return dict(zip(batch_ids, probabilities, strict=True))


def build_historical_matches_from_frames(
    matches: pd.DataFrame,
    features: pd.DataFrame,
    team_lookup: dict[tuple[str, int], dict[str, Any]],
    model: Any | None = None,
    temperature: float = 1.0,
    limit: int | None = RECENT_HISTORY_LIMIT,
    ledger_entries: dict[str, LedgerEntry] | None = None,
    model_version: str = "model_v3",
    now_utc: pd.Timestamp | None = None,
) -> list[dict[str, Any]]:
    feature_lookup = features.set_index("match_id", drop=False)
    feature_lookup.index = feature_lookup.index.astype(str)
    entries = ledger_entries if ledger_entries is not None else {}

    history = matches.loc[is_premier_league_frame(matches) & (matches["finished"] == True)].copy()
    history["kickoff_time"] = pd.to_datetime(history["kickoff_time"], errors="coerce", utc=True, format="mixed")
    history = history.sort_values(
        ["kickoff_time", "source_season", "gameweek", "match_id"],
        ascending=[False, False, False, False],
        kind="stable",
    )

    missing_ids = [
        str(match_id)
        for match_id in dict.fromkeys(history["match_id"].astype(str))
        if str(match_id) not in entries
    ]
    if model is not None and missing_ids:
        scored = build_history_probabilities(missing_ids, feature_lookup, model, temperature)
        for match_id, probability in scored.items():
            history_row = history.loc[history["match_id"].astype(str) == str(match_id)]
            kickoff = history_row["kickoff_time"].iloc[0] if not history_row.empty else None
            upsert_prediction(
                entries,
                match_id=str(match_id),
                probabilities=probability,
                model_version=model_version,
                kickoff_time=kickoff,
                finished=True,
                prediction_type=PREDICTION_TYPE_REPLAY,
                now_utc=now_utc,
            )

    items: list[dict[str, Any]] = []
    selected_history = history if limit is None else history.head(limit)
    for row in selected_history.to_dict(orient="records"):
        pre_match = feature_lookup.loc[str(row["match_id"])] if str(row["match_id"]) in feature_lookup.index else None
        if isinstance(pre_match, pd.DataFrame):
            pre_match = pre_match.iloc[0]

        entry = entries.get(str(row["match_id"]))
        probability = entry.probability_array() if entry is not None else None

        items.append(
            {
                "matchId": row["match_id"],
                "season": row["source_season"],
                "gameweek": coerce_int(row.get("source_gameweek")) or coerce_int(row.get("gameweek")),
                "kickoffTime": pd.Timestamp(row["kickoff_time"]).isoformat() if pd.notna(row.get("kickoff_time")) else None,
                "homeTeam": serialize_team(team_lookup, row["source_season"], row["home_team"]),
                "awayTeam": serialize_team(team_lookup, row["source_season"], row["away_team"]),
                "score": {
                    "home": coerce_int(row.get("home_score")),
                    "away": coerce_int(row.get("away_score")),
                },
                "stats": {
                    "xg": {
                        "home": coerce_float(row.get("home_expected_goals_xg")),
                        "away": coerce_float(row.get("away_expected_goals_xg")),
                    },
                    "shotsOnTarget": {
                        "home": coerce_int(row.get("home_shots_on_target")),
                        "away": coerce_int(row.get("away_shots_on_target")),
                    },
                    "bigChances": {
                        "home": coerce_int(row.get("home_big_chances")),
                        "away": coerce_int(row.get("away_big_chances")),
                    },
                    "possession": {
                        "home": coerce_float(row.get("home_possession")),
                        "away": coerce_float(row.get("away_possession")),
                    },
                },
                "preMatch": {
                    "homeElo": coerce_float(pre_match.get("home_current_elo"), 0) if pre_match is not None else None,
                    "awayElo": coerce_float(pre_match.get("away_current_elo"), 0) if pre_match is not None else None,
                    "homeLast5Xg": coerce_float(pre_match.get("home_last5_avg_xg")) if pre_match is not None else None,
                    "awayLast5Xg": coerce_float(pre_match.get("away_last5_avg_xg")) if pre_match is not None else None,
                },
                "probabilities": serialize_probabilities(probability) if probability is not None else None,
                "predictionType": entry.prediction_type if entry is not None else None,
                "matchUrl": row.get("match_url"),
            }
        )
    return items


def build_dashboard_payload(
    data_dir: Path,
    feature_table_path: Path,
    matches_path: Path,
    model_path: Path,
    metrics_path: Path,
    ledger_path: Path = DEFAULT_LEDGER_PATH,
    walk_forward_path: Path = DEFAULT_WALK_FORWARD_PATH,
    now_utc: pd.Timestamp | None = None,
) -> dict[str, Any]:
    team_lookup = load_team_lookup(data_dir)
    temperature, model_metadata = load_model_metadata(metrics_path)
    model = load_model(model_path)
    features = load_prediction_feature_frame(feature_table_path)
    return build_dashboard_payload_from_frames(
        pd.read_csv(matches_path),
        features,
        model=model,
        temperature=temperature,
        model_metadata=model_metadata,
        team_lookup=team_lookup,
        model_version=model_path.stem,
        ledger_path=ledger_path,
        walk_forward_path=walk_forward_path,
        now_utc=now_utc,
    )


def build_dashboard_payload_from_frames(
    matches: pd.DataFrame,
    features: pd.DataFrame,
    *,
    model: Any,
    temperature: float,
    model_metadata: dict[str, Any],
    team_lookup: dict[tuple[str, int], dict[str, Any]],
    model_version: str,
    ledger_path: Path = DEFAULT_LEDGER_PATH,
    walk_forward_path: Path = DEFAULT_WALK_FORWARD_PATH,
    now_utc: pd.Timestamp | None = None,
) -> dict[str, Any]:
    current_gameweek, current_fixtures, upcoming_fixtures, postponed_fixtures = build_prediction_groups_from_frame(
        features,
        model=model,
        temperature=temperature,
        team_lookup=team_lookup,
    )
    current_season = infer_current_season(features)
    ledger_model_version = "model_v3" if model_version == "v3" else model_version
    entries = load_ledger(ledger_path)
    seed_walk_forward_predictions(entries, walk_forward_path, model_version=ledger_model_version)
    sync_fixture_predictions(
        entries,
        [
            *ledger_rows_from_fixtures(current_fixtures),
            *ledger_rows_from_fixtures(upcoming_fixtures),
            *ledger_rows_from_fixtures(postponed_fixtures),
        ],
        model_version=ledger_model_version,
        now_utc=now_utc,
    )
    apply_ledger_to_fixtures(current_fixtures, entries)
    apply_ledger_to_fixtures(upcoming_fixtures, entries)
    apply_ledger_to_fixtures(postponed_fixtures, entries)
    historical_matches = build_historical_matches_from_frames(
        matches,
        features,
        team_lookup=team_lookup,
        model=model,
        temperature=temperature,
        ledger_entries=entries,
        model_version=ledger_model_version,
        now_utc=now_utc,
    )
    save_ledger(ledger_path, entries)

    return {
        "generatedAtUtc": datetime.now(UTC).isoformat(),
        "currentSeason": current_season,
        "model": {
            "version": model_version,
            "calibrationTemperature": temperature,
            "metrics": model_metadata.get("metrics", {}),
            "split": model_metadata.get("split", {}),
            "competitionDistributionTrain": model_metadata.get("competition_distribution_train", {}),
        },
        "currentGameweek": current_gameweek,
        "currentGameweekFixtures": current_fixtures,
        "upcomingFixtures": upcoming_fixtures,
        "postponedFixtures": postponed_fixtures,
        "historicalMatches": historical_matches,
    }


def export_dashboard(
    output_path: Path,
    data_dir: Path,
    feature_table_path: Path,
    matches_path: Path,
    model_path: Path,
    metrics_path: Path,
    ledger_path: Path = DEFAULT_LEDGER_PATH,
    walk_forward_path: Path = DEFAULT_WALK_FORWARD_PATH,
) -> Path:
    dashboard = build_dashboard_payload(
        data_dir=data_dir,
        feature_table_path=feature_table_path,
        matches_path=matches_path,
        model_path=model_path,
        metrics_path=metrics_path,
        ledger_path=ledger_path,
        walk_forward_path=walk_forward_path,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(dashboard, indent=2), encoding="utf-8")
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export a Next.js-friendly dashboard dataset with upcoming predictions and historical match stats.",
    )
    parser.add_argument(
        "--output-path",
        default="apps/web/public/data/dashboard.json",
        help="Path where the dashboard JSON should be written.",
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="Root data directory containing raw and canonical files.",
    )
    parser.add_argument(
        "--feature-table-path",
        default="data/features/match_pre_match_features.csv",
        help="Premier League feature table containing current and upcoming fixtures.",
    )
    parser.add_argument(
        "--matches-path",
        default="data/matches.csv",
        help="Canonical matches dataset.",
    )
    parser.add_argument(
        "--model-path",
        default="data/models/model_v2.json",
        help="Trained XGBoost model path.",
    )
    parser.add_argument(
        "--metrics-path",
        default="data/models/model_v2_metrics.json",
        help="Training summary path that stores the calibration temperature.",
    )
    parser.add_argument(
        "--ledger-path",
        default=str(DEFAULT_LEDGER_PATH),
        help="Frozen prediction ledger path. Finished and kicked-off matches are never rescored.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = export_dashboard(
        output_path=Path(args.output_path),
        data_dir=Path(args.data_dir),
        feature_table_path=Path(args.feature_table_path),
        matches_path=Path(args.matches_path),
        model_path=Path(args.model_path),
        metrics_path=Path(args.metrics_path),
        ledger_path=Path(args.ledger_path),
    )
    print(output_path)


if __name__ == "__main__":
    main()
