from __future__ import annotations

import argparse
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Literal, Mapping

import numpy as np
import pandas as pd

from fpl_predictor.ratings import EloRatings, PiRatings

WINDOW_SIZE = 5
AVG_METRICS = ("xg", "xga", "shots_on_target", "big_chances", "tackles_won")
RATE_METRICS = ("clean_sheet",)
PREMIER_LEAGUE_TOURNAMENTS = frozenset({"prem", "premier league"})
EUROPEAN_TOURNAMENTS = frozenset({"champions-league", "europa-league", "conference-league"})
COVID_SEASONS = frozenset({"2019-2020", "2020-2021"})
HISTORICAL_SOURCE = "football-data.co.uk"
UNKNOWN_TEAM = "__unknown_team__"
BASE_COLUMNS = (
    "match_id",
    "source_season",
    "source_gameweek",
    "tournament",
    "gameweek",
    "kickoff_time",
    "finished",
    "home_team",
    "away_team",
    "home_score",
    "away_score",
    "home_team_key",
    "away_team_key",
    "source",
)


# A match is read as a plain mapping of column name to value; a pandas row works too.
MatchRow = Mapping[str, Any]
BATCH_KEY_COLUMNS = ("_kickoff_missing", "source_season", "kickoff_time", "_ordering_gameweek")


def average_or_na(values: list[float]) -> float:
    if not values:
        return float("nan")
    return float(np.mean(values))


def float_or_nan(value: Any) -> float:
    return float(value) if pd.notna(value) else float("nan")


def normalize_tournament(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().casefold()


def is_premier_league_match(match_row: MatchRow) -> bool:
    if normalize_tournament(match_row.get("tournament")) in PREMIER_LEAGUE_TOURNAMENTS:
        return True
    match_id = str(match_row.get("match_id", "")).casefold()
    return "-prem-" in match_id


def competition_code(match_row: MatchRow) -> str:
    tournament = normalize_tournament(match_row.get("tournament"))
    if tournament:
        return tournament
    if is_premier_league_match(match_row):
        return "prem"
    return "unknown"


def is_cup_match(match_row: MatchRow) -> bool:
    competition = competition_code(match_row)
    return competition != "prem"


def is_european_match(match_row: MatchRow) -> bool:
    return competition_code(match_row) in EUROPEAN_TOURNAMENTS


def should_emit_match(
    match_row: MatchRow,
    competition_scope: Literal["all", "premier_league"],
    include_historical_rows: bool = True,
) -> bool:
    source = str(match_row.get("source", "")).strip().casefold()
    if not include_historical_rows and source == HISTORICAL_SOURCE:
        return False
    if competition_scope == "all":
        return True
    return is_premier_league_match(match_row)


def resolve_team_key(
    match_row: MatchRow,
    side: str,
    team_key_lookup: dict[tuple[str, int], str] | None = None,
) -> Any:
    explicit = match_row.get(f"{side}_team_key")
    if explicit is not None and not pd.isna(explicit) and str(explicit).strip():
        return str(explicit)
    team_id = match_row.get(f"{side}_team")
    if team_key_lookup is not None:
        try:
            numeric_id = int(float(team_id))
        except (TypeError, ValueError):
            numeric_id = None
        if numeric_id is not None:
            season = str(match_row.get("source_season", ""))
            mapped = team_key_lookup.get((season, numeric_id))
            if mapped:
                return mapped
            for (_, mapped_id), mapped_key in team_key_lookup.items():
                if mapped_id == numeric_id:
                    return mapped_key
    return team_id


def rating_state_key(team_key: Any, match_row: MatchRow, side: str) -> Any:
    """Key under which a side's ratings and rolling history are stored.

    Cup opponents from outside the tracked leagues arrive without a team id. Each is
    treated as a one-off, default-rated side, so unrelated clubs never share a rating
    or a form window.
    """
    if pd.notna(team_key):
        return team_key
    return (UNKNOWN_TEAM, match_row.get("match_id"), side)


def is_unknown_team(state_key: Any) -> bool:
    return isinstance(state_key, tuple) and state_key[:1] == (UNKNOWN_TEAM,)


def build_team_observations(match_row: MatchRow) -> list[dict[str, Any]]:
    """Return the home and away sides' view of one match, in that order."""
    kickoff_time = pd.Timestamp(match_row["kickoff_time"])
    observations: list[dict[str, Any]] = []
    for side, opponent in (("home", "away"), ("away", "home")):
        goals_against = match_row[f"{opponent}_score"]
        observations.append(
            {
                "team_id": match_row[f"{side}_team"],
                "opponent_id": match_row[f"{opponent}_team"],
                "match_id": match_row["match_id"],
                "kickoff_time": kickoff_time,
                # Stored as floats so a rolling window never re-checks for missing values.
                "xg": float_or_nan(match_row[f"{side}_expected_goals_xg"]),
                "xga": float_or_nan(match_row[f"{opponent}_expected_goals_xg"]),
                "shots_on_target": float_or_nan(match_row[f"{side}_shots_on_target"]),
                "big_chances": float_or_nan(match_row[f"{side}_big_chances"]),
                "tackles_won": float_or_nan(match_row[f"{side}_tackles_won"]),
                "clean_sheet": 1.0 if pd.notna(goals_against) and goals_against == 0 else 0.0,
                "goals_for": match_row[f"{side}_score"],
                "goals_against": goals_against,
            }
        )
    return observations


def compute_team_snapshot(
    prefix: str,
    team_id: Any,
    current_kickoff: pd.Timestamp,
    current_elo: Any,
    histories: dict[Any, deque[dict[str, Any]]],
    last_kickoffs: dict[Any, pd.Timestamp],
) -> dict[str, Any]:
    history = histories.get(team_id, ())
    previous_kickoff = last_kickoffs.get(team_id)

    snapshot: dict[str, Any] = {
        f"{prefix}_last5_matches": len(history),
        f"{prefix}_days_rest": float("nan"),
        f"{prefix}_current_elo": current_elo,
    }

    if previous_kickoff is not None:
        rest_delta = current_kickoff - previous_kickoff
        snapshot[f"{prefix}_days_rest"] = rest_delta.total_seconds() / 86_400

    for metric in AVG_METRICS:
        # NaN is the only value that differs from itself.
        metric_values = [item[metric] for item in history if item[metric] == item[metric]]
        snapshot[f"{prefix}_last5_avg_{metric}"] = average_or_na(metric_values)
        snapshot[f"{prefix}_last5_{metric}_observations"] = len(metric_values)

    for metric in RATE_METRICS:
        metric_values = [item[metric] for item in history if item[metric] == item[metric]]
        snapshot[f"{prefix}_last5_{metric}_rate"] = average_or_na(metric_values)

    return snapshot


def is_finished_match(match_row: MatchRow) -> bool:
    finished = match_row.get("finished")
    if pd.isna(finished):
        return False
    return bool(finished)


def build_pre_match_feature_table(
    matches: pd.DataFrame,
    window_size: int = WINDOW_SIZE,
    competition_scope: Literal["all", "premier_league"] = "premier_league",
    team_key_lookup: dict[tuple[str, int], str] | None = None,
    include_historical_rows: bool = True,
) -> pd.DataFrame:
    working = matches.copy()
    working["kickoff_time"] = pd.to_datetime(working["kickoff_time"], errors="coerce", utc=True, format="mixed")
    working["_ordering_gameweek"] = pd.to_numeric(
        working.get("source_gameweek", working.get("gameweek")),
        errors="coerce",
    ).fillna(pd.to_numeric(working.get("gameweek"), errors="coerce"))
    working["_kickoff_missing"] = working["kickoff_time"].isna()
    working["_kickoff_sort"] = working["kickoff_time"].fillna(pd.Timestamp.max.tz_localize("UTC"))
    working = working.sort_values(
        ["_kickoff_sort", "_kickoff_missing", "source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
    ).reset_index(drop=True)

    histories: dict[Any, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=window_size))
    last_kickoffs: dict[Any, pd.Timestamp] = {}
    elo_ratings = EloRatings()
    pi_ratings = PiRatings()
    feature_rows: list[dict[str, Any]] = []

    # Matches sharing a kickoff are snapshotted together before any of their results
    # update the ratings, so simultaneous fixtures never see each other's outcomes.
    batches: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for match_row in working.to_dict("records"):
        batch_key = tuple(
            None if pd.isna(match_row[column]) else match_row[column]
            for column in BATCH_KEY_COLUMNS
        )
        batches.setdefault(batch_key, []).append(match_row)

    for batch in batches.values():
        state_keys: list[tuple[Any, Any]] = []

        for match_row in batch:
            current_kickoff = (
                pd.Timestamp(match_row["kickoff_time"])
                if pd.notna(match_row["kickoff_time"])
                else pd.NaT
            )
            home_key = resolve_team_key(match_row, "home", team_key_lookup)
            away_key = resolve_team_key(match_row, "away", team_key_lookup)
            home_state = rating_state_key(home_key, match_row, "home")
            away_state = rating_state_key(away_key, match_row, "away")
            state_keys.append((home_state, away_state))
            home_elo, away_elo = elo_ratings.snapshot(home_state, away_state)
            home_pi_home, home_pi_away, away_pi_home, away_pi_away = pi_ratings.snapshot(home_state, away_state)
            feature_row = {column: match_row[column] for column in BASE_COLUMNS if column in match_row}
            feature_row["home_team_key"] = home_key
            feature_row["away_team_key"] = away_key
            feature_row["competition_code"] = competition_code(match_row)
            feature_row["is_premier_league_match"] = int(is_premier_league_match(match_row))
            feature_row["is_cup_match"] = int(is_cup_match(match_row))
            feature_row["is_european_match"] = int(is_european_match(match_row))
            feature_row["is_covid_season"] = int(str(match_row.get("source_season", "")) in COVID_SEASONS)
            for prefix, state_key, current_elo in (("home", home_state, home_elo), ("away", away_state, away_elo)):
                feature_row.update(
                    compute_team_snapshot(
                        prefix=prefix,
                        team_id=state_key,
                        current_kickoff=current_kickoff,
                        current_elo=current_elo,
                        histories=histories,
                        last_kickoffs=last_kickoffs,
                    )
                )
            feature_row["home_pi_rating"] = home_pi_home
            feature_row["home_pi_home"] = home_pi_home
            feature_row["home_pi_away"] = home_pi_away
            feature_row["away_pi_rating"] = away_pi_away
            feature_row["away_pi_home"] = away_pi_home
            feature_row["away_pi_away"] = away_pi_away
            feature_row["has_xg_coverage"] = int(
                (feature_row.get("home_last5_xg_observations") or 0)
                + (feature_row.get("away_last5_xg_observations") or 0)
                > 0
            )
            if should_emit_match(match_row, competition_scope, include_historical_rows=include_historical_rows):
                feature_rows.append(feature_row)

        for match_row, sides in zip(batch, state_keys, strict=True):
            if not is_finished_match(match_row):
                continue
            home_state, away_state = sides
            home_score = match_row.get("home_score")
            away_score = match_row.get("away_score")
            if pd.notna(home_score) and pd.notna(away_score):
                elo_ratings.update(home_state, away_state, float(home_score), float(away_score))
                pi_ratings.update(home_state, away_state, float(home_score), float(away_score))
            for observation, state_key in zip(build_team_observations(match_row), sides, strict=True):
                if is_unknown_team(state_key):
                    elo_ratings.ratings.pop(state_key, None)
                    pi_ratings.ratings.pop(state_key, None)
                    continue
                observation["team_id"] = state_key
                histories[state_key].append(observation)
                last_kickoffs[state_key] = observation["kickoff_time"]

    feature_table = pd.DataFrame(feature_rows)
    if feature_table.empty:
        return feature_table

    return feature_table.sort_values(
        ["kickoff_time", "source_season", "source_gameweek", "match_id"],
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)


def build_feature_table(
    matches_path: Path,
    output_path: Path,
    window_size: int = WINDOW_SIZE,
    competition_scope: Literal["all", "premier_league"] = "premier_league",
    team_key_lookup: dict[tuple[str, int], str] | None = None,
    include_historical_rows: bool = True,
) -> Path:
    matches = pd.read_csv(matches_path)
    feature_table = build_pre_match_feature_table(
        matches,
        window_size=window_size,
        competition_scope=competition_scope,
        team_key_lookup=team_key_lookup,
        include_historical_rows=include_historical_rows,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    feature_table.to_csv(output_path, index=False)
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build kickoff-time-aware pre-match team features from matches.csv.",
    )
    parser.add_argument(
        "--matches-path",
        default="data/matches.csv",
        help="Canonical matches dataset produced by Phase 1.",
    )
    parser.add_argument(
        "--output-path",
        default="data/features/match_pre_match_features.csv",
        help="Output CSV for Phase 2 rolling features.",
    )
    parser.add_argument(
        "--window-size",
        type=int,
        default=WINDOW_SIZE,
        help="Number of previous finished matches to include per team.",
    )
    parser.add_argument(
        "--competition-scope",
        choices=("premier_league", "all"),
        default="premier_league",
        help="Whether to emit only Premier League fixtures or all competitions.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = build_feature_table(
        matches_path=Path(args.matches_path),
        output_path=Path(args.output_path),
        window_size=args.window_size,
        competition_scope=args.competition_scope,
    )
    print(output_path)


if __name__ == "__main__":
    main()
