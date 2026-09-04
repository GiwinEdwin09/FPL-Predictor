from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from fpl_predictor.historical_ingestion import canonical_team_key

FCI_SOURCE = "fpl-core-insights"
HISTORICAL_SOURCE = "football-data.co.uk"
DEFAULT_FCI_MATCHES_PATH = Path("data/matches.csv")
DEFAULT_HISTORICAL_PATH = Path("data/historical/football_data_premier_league.csv")
DEFAULT_OUTPUT_PATH = Path("data/matches_training.csv")
DEFAULT_DATA_DIR = Path("data")
COVID_SEASONS = frozenset({"2019-2020", "2020-2021"})
MARKET_COLUMNS = (
    "market_home_odds",
    "market_draw_odds",
    "market_away_odds",
    "market_home_probability",
    "market_draw_probability",
    "market_away_probability",
    "market_odds_source",
)


@dataclass(frozen=True)
class TrainingCorpusSummary:
    output_path: str
    rows: int
    fci_rows: int
    historical_only_rows: int
    overlap_rows: int
    overlap_with_odds: int
    seasons: int
    built_at_utc: str


def _numeric_team_id(value: Any) -> int | None:
    if pd.isna(value):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def load_team_key_lookup(data_dir: Path = DEFAULT_DATA_DIR) -> dict[tuple[str, int], str]:
    lookup: dict[tuple[str, int], str] = {}
    raw_dir = data_dir / "raw"
    if not raw_dir.exists():
        return lookup
    for season_dir in sorted(path for path in raw_dir.iterdir() if path.is_dir()):
        teams_path = season_dir / "teams.csv"
        if not teams_path.exists():
            continue
        teams = pd.read_csv(teams_path)
        if "code" not in teams.columns or "name" not in teams.columns:
            continue
        season = season_dir.name
        for row in teams.itertuples(index=False):
            team_id = _numeric_team_id(getattr(row, "code", None))
            if team_id is None:
                team_id = _numeric_team_id(getattr(row, "id", None))
            if team_id is None:
                continue
            lookup[(season, team_id)] = canonical_team_key(getattr(row, "name"))
    return lookup


def team_key_for_fci_row(
    season: Any,
    team_id: Any,
    lookup: dict[tuple[str, int], str],
) -> str:
    numeric_id = _numeric_team_id(team_id)
    if numeric_id is None:
        return canonical_team_key(team_id)
    key = lookup.get((str(season), numeric_id))
    if key:
        return key
    for (_, mapped_id), mapped_key in lookup.items():
        if mapped_id == numeric_id:
            return mapped_key
    return canonical_team_key(team_id)


def london_match_date(value: Any) -> str:
    timestamp = pd.to_datetime(value, errors="coerce", utc=True, format="mixed")
    if pd.isna(timestamp):
        return ""
    return timestamp.tz_convert("Europe/London").strftime("%Y-%m-%d")


def overlap_key(home_team_key: Any, away_team_key: Any, kickoff_time: Any) -> tuple[str, str, str]:
    return (london_match_date(kickoff_time), str(home_team_key), str(away_team_key))


def _empty_market_frame(index: pd.Index) -> pd.DataFrame:
    frame = pd.DataFrame(index=index)
    for column in MARKET_COLUMNS:
        frame[column] = "" if column == "market_odds_source" else float("nan")
    return frame


def normalize_fci_matches(
    matches: pd.DataFrame,
    lookup: dict[tuple[str, int], str],
) -> pd.DataFrame:
    working = matches.copy()
    working["source"] = FCI_SOURCE
    working["home_team_key"] = [
        team_key_for_fci_row(season, team_id, lookup)
        for season, team_id in zip(working.get("source_season", ""), working["home_team"], strict=True)
    ]
    working["away_team_key"] = [
        team_key_for_fci_row(season, team_id, lookup)
        for season, team_id in zip(working.get("source_season", ""), working["away_team"], strict=True)
    ]
    working["is_covid_season"] = working.get("source_season", pd.Series("", index=working.index)).isin(COVID_SEASONS).astype(int)
    if "competition_code" not in working.columns:
        working["competition_code"] = working.get("tournament")
    market = _empty_market_frame(working.index)
    for column in MARKET_COLUMNS:
        if column not in working.columns:
            working[column] = market[column]
    return working


def attach_historical_odds(fci: pd.DataFrame, historical: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    historical_keys = [
        overlap_key(home, away, kickoff)
        for home, away, kickoff in zip(
            historical["home_team_key"],
            historical["away_team_key"],
            historical["kickoff_time"],
            strict=True,
        )
    ]
    odds_lookup = {
        key: historical.iloc[index]
        for index, key in enumerate(historical_keys)
    }
    attached = 0
    updated = fci.copy()
    for index, row in updated.iterrows():
        key = overlap_key(row["home_team_key"], row["away_team_key"], row["kickoff_time"])
        historical_row = odds_lookup.get(key)
        if historical_row is None:
            continue
        attached += 1
        for column in MARKET_COLUMNS:
            if column in historical_row.index:
                updated.at[index, column] = historical_row[column]
    return updated, attached


def prepare_historical_matches(historical: pd.DataFrame) -> pd.DataFrame:
    working = historical.copy()
    working["source"] = HISTORICAL_SOURCE
    if "home_team_key" not in working.columns:
        working["home_team_key"] = working["home_team"].map(canonical_team_key)
    if "away_team_key" not in working.columns:
        working["away_team_key"] = working["away_team"].map(canonical_team_key)
    working["is_covid_season"] = working.get("source_season", pd.Series("", index=working.index)).isin(COVID_SEASONS).astype(int)
    return working


def merge_training_matches(fci: pd.DataFrame, historical: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    fci_keys = {
        overlap_key(home, away, kickoff)
        for home, away, kickoff in zip(fci["home_team_key"], fci["away_team_key"], fci["kickoff_time"], strict=True)
    }
    historical_mask = [
        overlap_key(home, away, kickoff) not in fci_keys
        for home, away, kickoff in zip(
            historical["home_team_key"],
            historical["away_team_key"],
            historical["kickoff_time"],
            strict=True,
        )
    ]
    historical_only = historical.loc[historical_mask].copy()
    combined = pd.concat([historical_only, fci], ignore_index=True, sort=False)
    combined["kickoff_time"] = pd.to_datetime(combined["kickoff_time"], errors="coerce", utc=True, format="mixed")
    combined = combined.sort_values(["kickoff_time", "source_season", "match_id"], kind="stable").reset_index(drop=True)
    counts = {
        "fci_rows": int(len(fci)),
        "historical_only_rows": int(len(historical_only)),
        "overlap_rows": int(len(historical) - len(historical_only)),
    }
    return combined, counts


def build_training_corpus(
    fci_matches_path: Path = DEFAULT_FCI_MATCHES_PATH,
    historical_path: Path = DEFAULT_HISTORICAL_PATH,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    data_dir: Path = DEFAULT_DATA_DIR,
) -> TrainingCorpusSummary:
    lookup = load_team_key_lookup(data_dir)
    fci = normalize_fci_matches(pd.read_csv(fci_matches_path), lookup)
    historical = prepare_historical_matches(pd.read_csv(historical_path))
    fci, overlap_with_odds = attach_historical_odds(fci, historical)
    combined, counts = merge_training_matches(fci, historical)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(output_path, index=False)
    return TrainingCorpusSummary(
        output_path=str(output_path),
        rows=len(combined),
        fci_rows=counts["fci_rows"],
        historical_only_rows=counts["historical_only_rows"],
        overlap_rows=counts["overlap_rows"],
        overlap_with_odds=int(overlap_with_odds),
        seasons=int(combined["source_season"].nunique()),
        built_at_utc=datetime.now(UTC).isoformat(),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge football-data.co.uk history with FPL-Core-Insights matches for model training.",
    )
    parser.add_argument("--fci-matches-path", default=str(DEFAULT_FCI_MATCHES_PATH))
    parser.add_argument("--historical-path", default=str(DEFAULT_HISTORICAL_PATH))
    parser.add_argument("--output-path", default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = build_training_corpus(
        fci_matches_path=Path(args.fci_matches_path),
        historical_path=Path(args.historical_path),
        output_path=Path(args.output_path),
        data_dir=Path(args.data_dir),
    )
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":
    main()
