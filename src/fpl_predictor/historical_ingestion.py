from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import requests

FOOTBALL_DATA_BASE_URL = "https://www.football-data.co.uk/mmz4281"
DEFAULT_START_YEAR = 1993
DEFAULT_END_YEAR = 2025
DEFAULT_RAW_DIR = Path("data/historical/football-data/raw")
DEFAULT_OUTPUT_PATH = Path("data/historical/football_data_premier_league.csv")

ODDS_COLUMN_SETS = (
    ("AvgCH", "AvgCD", "AvgCA"),
    ("PSCH", "PSCD", "PSCA"),
    ("B365CH", "B365CD", "B365CA"),
    ("AvgH", "AvgD", "AvgA"),
    ("PSH", "PSD", "PSA"),
    ("B365H", "B365D", "B365A"),
)

TEAM_ALIASES = {
    "afc bournemouth": "bournemouth",
    "bournemouth": "bournemouth",
    "brighton & hove albion": "brighton",
    "brighton and hove albion": "brighton",
    "brighton": "brighton",
    "coventry": "coventry",
    "coventry city": "coventry",
    "hull": "hull",
    "hull city": "hull",
    "ipswich": "ipswich",
    "ipswich town": "ipswich",
    "leeds united": "leeds",
    "leeds": "leeds",
    "man city": "manchester-city",
    "manchester city": "manchester-city",
    "man united": "manchester-united",
    "man utd": "manchester-united",
    "manchester united": "manchester-united",
    "newcastle": "newcastle-united",
    "newcastle united": "newcastle-united",
    "nott'm forest": "nottingham-forest",
    "nottingham forest": "nottingham-forest",
    "qpr": "queens-park-rangers",
    "queens park rangers": "queens-park-rangers",
    "sheff utd": "sheffield-united",
    "sheffield united": "sheffield-united",
    "sheff wed": "sheffield-wednesday",
    "sheff weds": "sheffield-wednesday",
    "sheffield weds": "sheffield-wednesday",
    "sheffield wednesday": "sheffield-wednesday",
    "nottm forest": "nottingham-forest",
    "spurs": "tottenham",
    "tottenham": "tottenham",
    "tottenham hotspur": "tottenham",
    "west brom": "west-bromwich-albion",
    "west bromwich albion": "west-bromwich-albion",
    "west ham": "west-ham",
    "west ham united": "west-ham",
    "wolves": "wolves",
    "wolverhampton wanderers": "wolves",
}


@dataclass(frozen=True)
class HistoricalSeasonSummary:
    season: str
    url: str
    raw_path: str
    rows: int
    finished_rows: int
    downloaded: bool


def canonical_team_key(value: Any) -> str:
    if pd.isna(value):
        return ""
    normalized = unicodedata.normalize("NFKD", str(value))
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    normalized = normalized.strip().casefold().replace("’", "'")
    if normalized in TEAM_ALIASES:
        return TEAM_ALIASES[normalized]
    return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")


def season_code(start_year: int) -> str:
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


def season_label(start_year: int) -> str:
    return f"{start_year:04d}-{start_year + 1:04d}"


def season_url(start_year: int) -> str:
    return f"{FOOTBALL_DATA_BASE_URL}/{season_code(start_year)}/E0.csv"


def parse_football_data_kickoff(date_value: Any, time_value: Any = None) -> pd.Timestamp:
    if pd.isna(date_value):
        return pd.NaT
    date_parts = str(date_value).strip().split("/")
    if len(date_parts) != 3:
        return pd.NaT
    try:
        day, month, year = (int(part) for part in date_parts)
        if year < 100:
            year += 1900 if year >= 70 else 2000
        hour, minute = 15, 0
        if time_value is not None and not pd.isna(time_value):
            time_parts = str(time_value).strip().split(":")
            if len(time_parts) >= 2:
                hour, minute = int(time_parts[0]), int(time_parts[1])
        local = datetime(year, month, day, hour, minute, tzinfo=ZoneInfo("Europe/London"))
    except (TypeError, ValueError):
        return pd.NaT
    return pd.Timestamp(local.astimezone(UTC))


def _numeric(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(np.nan, index=frame.index, dtype=float)
    return pd.to_numeric(frame[column], errors="coerce")


def _market_odds(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    odds = pd.DataFrame(
        np.nan,
        index=frame.index,
        columns=["market_home_odds", "market_draw_odds", "market_away_odds"],
        dtype=float,
    )
    source = pd.Series("", index=frame.index, dtype=object)

    for columns in ODDS_COLUMN_SETS:
        if not all(column in frame.columns for column in columns):
            continue
        candidate = frame.loc[:, list(columns)].apply(pd.to_numeric, errors="coerce")
        valid = (
            odds["market_home_odds"].isna()
            & candidate.notna().all(axis=1)
            & (candidate > 1.0).all(axis=1)
        )
        odds.loc[valid] = candidate.loc[valid].to_numpy()
        source.loc[valid] = "/".join(columns)

    implied = 1.0 / odds
    probabilities = implied.div(implied.sum(axis=1), axis=0)
    probabilities.columns = [
        "market_home_probability",
        "market_draw_probability",
        "market_away_probability",
    ]
    return pd.concat([odds, probabilities], axis=1), source


def normalize_football_data_frame(frame: pd.DataFrame, start_year: int) -> pd.DataFrame:
    required = {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"football-data.co.uk CSV is missing required columns: {sorted(missing)}")

    home_score = _numeric(frame, "FTHG")
    away_score = _numeric(frame, "FTAG")
    finished = home_score.notna() & away_score.notna()
    selected = frame.loc[finished].copy()
    home_score = home_score.loc[finished]
    away_score = away_score.loc[finished]
    time_values = selected["Time"] if "Time" in selected.columns else pd.Series(None, index=selected.index)
    kickoff = pd.Series(
        [
            parse_football_data_kickoff(date_value, time_value)
            for date_value, time_value in zip(selected["Date"], time_values, strict=True)
        ],
        index=selected.index,
    )

    home_key = selected["HomeTeam"].map(canonical_team_key)
    away_key = selected["AwayTeam"].map(canonical_team_key)
    label = season_label(start_year)
    date_slug = kickoff.map(lambda value: value.strftime("%Y%m%d") if pd.notna(value) else "unknown-date")
    match_id = (
        "football-data-"
        + label
        + "-"
        + date_slug
        + "-"
        + home_key
        + "-vs-"
        + away_key
    )
    odds, odds_source = _market_odds(selected)

    normalized = pd.DataFrame(
        {
            "match_id": match_id,
            "source": "football-data.co.uk",
            "source_season": label,
            "tournament": "prem",
            "competition_code": "prem",
            "kickoff_time": kickoff,
            "gameweek": np.nan,
            "source_gameweek": np.nan,
            "finished": True,
            "home_team": home_key,
            "away_team": away_key,
            "home_team_name": selected["HomeTeam"].astype(str),
            "away_team_name": selected["AwayTeam"].astype(str),
            "home_score": home_score.astype(int),
            "away_score": away_score.astype(int),
            "home_team_elo": np.nan,
            "away_team_elo": np.nan,
            "home_expected_goals_xg": np.nan,
            "away_expected_goals_xg": np.nan,
            "home_total_shots": _numeric(selected, "HS"),
            "away_total_shots": _numeric(selected, "AS"),
            "home_shots_on_target": _numeric(selected, "HST"),
            "away_shots_on_target": _numeric(selected, "AST"),
            "home_big_chances": np.nan,
            "away_big_chances": np.nan,
            "home_tackles_won": np.nan,
            "away_tackles_won": np.nan,
            "home_fouls_committed": _numeric(selected, "HF"),
            "away_fouls_committed": _numeric(selected, "AF"),
            "home_corners": _numeric(selected, "HC"),
            "away_corners": _numeric(selected, "AC"),
            "home_yellow_cards": _numeric(selected, "HY"),
            "away_yellow_cards": _numeric(selected, "AY"),
            "home_red_cards": _numeric(selected, "HR"),
            "away_red_cards": _numeric(selected, "AR"),
        },
        index=selected.index,
    )
    normalized = pd.concat([normalized, odds, odds_source.rename("market_odds_source")], axis=1)
    return normalized.sort_values(["kickoff_time", "match_id"], kind="stable").reset_index(drop=True)


def read_football_data_csv(path: Path) -> pd.DataFrame:
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = [column.strip() for column in next(reader)]
        except StopIteration:
            return pd.DataFrame()
        while header and header[-1] == "":
            header.pop()
        width = len(header)
        rows: list[list[str]] = []
        for raw_row in reader:
            if not raw_row or all(not cell.strip() for cell in raw_row):
                continue
            if len(raw_row) < width:
                raw_row = raw_row + [""] * (width - len(raw_row))
            rows.append(raw_row[:width])
    return pd.DataFrame(rows, columns=header)


def download_season(
    start_year: int,
    raw_dir: Path,
    *,
    force: bool = False,
    session: requests.Session | None = None,
) -> tuple[Path, bool]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"E0_{season_code(start_year)}.csv"
    if path.exists() and not force:
        return path, False

    http = session or requests.Session()
    response = http.get(
        season_url(start_year),
        timeout=30,
        headers={"User-Agent": "FPL-Predictor historical model research"},
    )
    response.raise_for_status()
    if b"HomeTeam" not in response.content[:1_000]:
        raise ValueError(f"Unexpected football-data.co.uk response for {season_label(start_year)}")
    temporary_path = path.with_suffix(".tmp")
    temporary_path.write_bytes(response.content)
    temporary_path.replace(path)
    return path, True


def sync_football_data_history(
    raw_dir: Path = DEFAULT_RAW_DIR,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    start_years: Iterable[int] = range(DEFAULT_START_YEAR, DEFAULT_END_YEAR + 1),
    *,
    force: bool = False,
) -> dict[str, Any]:
    summaries: list[HistoricalSeasonSummary] = []
    frames: list[pd.DataFrame] = []
    with requests.Session() as session:
        for start_year in start_years:
            path, downloaded = download_season(
                start_year,
                raw_dir,
                force=force,
                session=session,
            )
            raw = read_football_data_csv(path)
            normalized = normalize_football_data_frame(raw, start_year)
            frames.append(normalized)
            summaries.append(
                HistoricalSeasonSummary(
                    season=season_label(start_year),
                    url=season_url(start_year),
                    raw_path=str(path),
                    rows=len(raw),
                    finished_rows=len(normalized),
                    downloaded=downloaded,
                )
            )

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates("match_id", keep="last")
    combined = combined.sort_values(["kickoff_time", "match_id"], kind="stable").reset_index(drop=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(output_path, index=False)
    return {
        "source": "football-data.co.uk",
        "synced_at_utc": datetime.now(UTC).isoformat(),
        "raw_dir": str(raw_dir),
        "output_path": str(output_path),
        "rows": len(combined),
        "seasons": [asdict(summary) for summary in summaries],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download and normalize historical Premier League results and odds.")
    parser.add_argument("--raw-dir", default=str(DEFAULT_RAW_DIR))
    parser.add_argument("--output-path", default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    parser.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.end_year < args.start_year:
        raise ValueError("--end-year must be greater than or equal to --start-year.")
    summary = sync_football_data_history(
        raw_dir=Path(args.raw_dir),
        output_path=Path(args.output_path),
        start_years=range(args.start_year, args.end_year + 1),
        force=args.force,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
