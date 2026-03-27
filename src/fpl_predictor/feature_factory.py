from __future__ import annotations

import argparse
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import pandas as pd

WINDOW_SIZE = 5
AVG_METRICS = ("xg", "xga", "shots_on_target", "big_chances", "tackles_won")
RATE_METRICS = ("clean_sheet",)
PREMIER_LEAGUE_TOURNAMENTS = frozenset({"prem", "premier league"})
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
)


def average_or_na(values: list[float]) -> float:
    if not values:
        return float("nan")
    return pd.Series(values, dtype="float64").mean(skipna=True)


def normalize_tournament(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().casefold()


def is_premier_league_match(match_row: pd.Series) -> bool:
    if normalize_tournament(match_row.get("tournament")) in PREMIER_LEAGUE_TOURNAMENTS:
        return True
    match_id = str(match_row.get("match_id", "")).casefold()
    return "-prem-" in match_id


def build_team_observations(match_row: pd.Series) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    kickoff_time = pd.Timestamp(match_row["kickoff_time"])

    team_sides = (
        (
            match_row["home_team"],
            match_row["away_team"],
            match_row["home_expected_goals_xg"],
            match_row["away_expected_goals_xg"],
            match_row["home_shots_on_target"],
            match_row["home_big_chances"],
            match_row["home_tackles_won"],
            match_row["home_score"],
            match_row["away_score"],
        ),
        (
            match_row["away_team"],
            match_row["home_team"],
            match_row["away_expected_goals_xg"],
            match_row["home_expected_goals_xg"],
            match_row["away_shots_on_target"],
            match_row["away_big_chances"],
            match_row["away_tackles_won"],
            match_row["away_score"],
            match_row["home_score"],
        ),
    )

    for (
        team_id,
        opponent_id,
        xg,
        xga,
        shots_on_target,
        big_chances,
        tackles_won,
        goals_for,
        goals_against,
    ) in team_sides:
        observations.append(
            {
                "team_id": team_id,
                "opponent_id": opponent_id,
                "match_id": match_row["match_id"],
                "kickoff_time": kickoff_time,
                "xg": xg,
                "xga": xga,
                "shots_on_target": shots_on_target,
                "big_chances": big_chances,
                "tackles_won": tackles_won,
                "clean_sheet": 1.0 if pd.notna(goals_against) and goals_against == 0 else 0.0,
                "goals_for": goals_for,
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
    history = list(histories.get(team_id, deque()))
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
        metric_values = [float(item[metric]) for item in history if pd.notna(item[metric])]
        snapshot[f"{prefix}_last5_avg_{metric}"] = average_or_na(metric_values)

    for metric in RATE_METRICS:
        metric_values = [float(item[metric]) for item in history if pd.notna(item[metric])]
        snapshot[f"{prefix}_last5_{metric}_rate"] = average_or_na(metric_values)

    return snapshot


def is_finished_match(match_row: pd.Series) -> bool:
    finished = match_row.get("finished")
    if pd.isna(finished):
        return False
    return bool(finished)


def build_pre_match_feature_table(matches: pd.DataFrame, window_size: int = WINDOW_SIZE) -> pd.DataFrame:
    working = matches.copy()
    working["kickoff_time"] = pd.to_datetime(working["kickoff_time"], errors="coerce")
    working["_ordering_gameweek"] = pd.to_numeric(
        working.get("source_gameweek", working.get("gameweek")),
        errors="coerce",
    ).fillna(pd.to_numeric(working.get("gameweek"), errors="coerce"))
    working["_kickoff_missing"] = working["kickoff_time"].isna()
    working["_kickoff_sort"] = working["kickoff_time"].fillna(pd.Timestamp.max)
    working = working.sort_values(
        ["_kickoff_sort", "_kickoff_missing", "source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
    ).reset_index(drop=True)

    histories: dict[Any, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=window_size))
    last_kickoffs: dict[Any, pd.Timestamp] = {}
    feature_rows: list[dict[str, Any]] = []

    working["_batch_key"] = list(
        zip(
            working["_kickoff_missing"],
            working["source_season"],
            working["kickoff_time"],
            working["_ordering_gameweek"],
            strict=False,
        )
    )

    for _, batch in working.groupby("_batch_key", sort=False, dropna=False):
        batch_features: list[dict[str, Any]] = []

        for _, match_row in batch.iterrows():
            current_kickoff = (
                pd.Timestamp(match_row["kickoff_time"])
                if pd.notna(match_row["kickoff_time"])
                else pd.NaT
            )
            feature_row = {column: match_row[column] for column in BASE_COLUMNS if column in match_row.index}
            feature_row.update(
                compute_team_snapshot(
                    prefix="home",
                    team_id=match_row["home_team"],
                    current_kickoff=current_kickoff,
                    current_elo=match_row.get("home_team_elo"),
                    histories=histories,
                    last_kickoffs=last_kickoffs,
                )
            )
            feature_row.update(
                compute_team_snapshot(
                    prefix="away",
                    team_id=match_row["away_team"],
                    current_kickoff=current_kickoff,
                    current_elo=match_row.get("away_team_elo"),
                    histories=histories,
                    last_kickoffs=last_kickoffs,
                )
            )
            batch_features.append(feature_row)

        for feature_row, (_, match_row) in zip(batch_features, batch.iterrows(), strict=True):
            if is_premier_league_match(match_row):
                feature_rows.append(feature_row)

        for _, match_row in batch.iterrows():
            if not is_finished_match(match_row):
                continue
            for observation in build_team_observations(match_row):
                team_id = observation["team_id"]
                histories[team_id].append(observation)
                last_kickoffs[team_id] = observation["kickoff_time"]

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
) -> Path:
    matches = pd.read_csv(matches_path)
    feature_table = build_pre_match_feature_table(matches, window_size=window_size)
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = build_feature_table(
        matches_path=Path(args.matches_path),
        output_path=Path(args.output_path),
        window_size=args.window_size,
    )
    print(output_path)


if __name__ == "__main__":
    main()
