from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, Sequence
from urllib.parse import quote

import pandas as pd
import requests

GITHUB_OWNER = "olbauday"
GITHUB_REPO = "FPL-Core-Insights"
GITHUB_BRANCH = "main"
SEASONS = ("2024-2025", "2025-2026")
TREE_URL = (
    f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"
    f"/git/trees/{GITHUB_BRANCH}?recursive=1"
)
RAW_BASE_URL = (
    f"https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}/{GITHUB_BRANCH}"
)


@dataclass(frozen=True)
class DatasetConfig:
    name: str
    prefer_season_master: bool
    sort_columns: tuple[str, ...]
    output_filename: str


DATASET_CONFIGS = {
    "matches": DatasetConfig(
        name="matches",
        prefer_season_master=True,
        sort_columns=("kickoff_time", "gameweek", "home_team", "away_team"),
        output_filename="matches.csv",
    ),
    "players": DatasetConfig(
        name="players",
        prefer_season_master=True,
        sort_columns=("source_season", "id"),
        output_filename="players.csv",
    ),
    "playerstats": DatasetConfig(
        name="playerstats",
        prefer_season_master=False,
        sort_columns=("source_gameweek", "id"),
        output_filename="playerstats.csv",
    ),
    "playermatchstats": DatasetConfig(
        name="playermatchstats",
        prefer_season_master=True,
        sort_columns=("source_gameweek", "match_id", "player_id"),
        output_filename="playermatchstats.csv",
    ),
}
DEFAULT_DATASETS = tuple(DATASET_CONFIGS)


@dataclass(frozen=True)
class SeasonSyncResult:
    dataset: str
    season: str
    source_mode: str
    remote_paths: list[str]
    remote_urls: list[str]
    local_path: str
    local_rows: int
    remote_rows: int
    local_hash: str | None
    remote_hash: str
    updated: bool


def build_raw_url(path: str) -> str:
    return f"{RAW_BASE_URL}/{quote(path, safe='/')}"


def fetch_repository_paths(session: requests.Session | None = None) -> list[str]:
    http = session or requests.Session()
    response = http.get(
        TREE_URL,
        headers={"Accept": "application/vnd.github+json"},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    return [item["path"] for item in payload.get("tree", []) if item.get("type") == "blob"]


def extract_gameweek(path: str, dataset_name: str = "matches") -> int | None:
    dataset = re.escape(dataset_name)
    match = re.search(rf"/(?:By Gameweek|{dataset})/GW(\d+)/{dataset}\.csv$", path)
    if not match:
        return None
    return int(match.group(1))


def preferred_dataset_paths(season: str, dataset_name: str) -> list[str]:
    return [
        f"data/{season}/{dataset_name}/{dataset_name}.csv",
        f"data/{season}/{dataset_name}.csv",
    ]


def find_season_dataset_paths(
    paths: Iterable[str],
    season: str,
    dataset: DatasetConfig,
) -> list[str]:
    season_paths = [path for path in paths if path.startswith(f"data/{season}/")]
    fallback_master_paths = [
        preferred_path
        for preferred_path in preferred_dataset_paths(season, dataset.name)
        if preferred_path in season_paths
    ]

    if dataset.prefer_season_master:
        if fallback_master_paths:
            return [fallback_master_paths[0]]

    matches_paths = sorted(
        [
            path
            for path in season_paths
            if extract_gameweek(path, dataset.name) is not None
        ],
        key=lambda path: (extract_gameweek(path, dataset.name) or -1, path),
    )
    if not matches_paths:
        if fallback_master_paths:
            return [fallback_master_paths[0]]
        raise FileNotFoundError(
            f"No {dataset.name}.csv snapshots found for season {season}.",
        )
    return matches_paths


def find_season_matches_paths(paths: Iterable[str], season: str) -> list[str]:
    return find_season_dataset_paths(paths, season, DATASET_CONFIGS["matches"])


def ensure_data_layout(data_dir: Path) -> None:
    (data_dir / "raw").mkdir(parents=True, exist_ok=True)


def dataframe_signature(frame: pd.DataFrame) -> str:
    csv_bytes = frame.to_csv(index=False).encode("utf-8")
    return hashlib.sha256(csv_bytes).hexdigest()


def sort_frame(frame: pd.DataFrame, dataset: DatasetConfig) -> pd.DataFrame:
    sort_columns = [column for column in dataset.sort_columns if column in frame.columns]
    if not sort_columns:
        return frame.reset_index(drop=True)
    return frame.sort_values(sort_columns, kind="stable").reset_index(drop=True)


def load_remote_dataset(
    remote_paths: list[str],
    dataset: DatasetConfig,
) -> tuple[str, list[str], pd.DataFrame]:
    remote_urls = [build_raw_url(path) for path in remote_paths]
    frames: list[pd.DataFrame] = []

    for path, url in zip(remote_paths, remote_urls, strict=True):
        frame = pd.read_csv(url)
        source_gameweek = extract_gameweek(path, dataset.name)
        if source_gameweek is not None and "source_gameweek" not in frame.columns:
            frame["source_gameweek"] = source_gameweek
        frames.append(frame)

    if len(frames) == 1:
        source_mode = (
            "season_master"
            if extract_gameweek(remote_paths[0], dataset.name) is None
            else "single_snapshot"
        )
        return source_mode, remote_urls, sort_frame(frames[0], dataset)

    remote_df = pd.concat(frames, ignore_index=True)
    return "gameweek_concat", remote_urls, sort_frame(remote_df, dataset)


def sync_season_dataset(
    season: str,
    dataset: DatasetConfig,
    repo_paths: Iterable[str],
    data_dir: Path,
    force: bool = False,
) -> tuple[SeasonSyncResult, pd.DataFrame]:
    ensure_data_layout(data_dir)

    remote_paths = find_season_dataset_paths(repo_paths, season, dataset)
    source_mode, remote_urls, remote_df = load_remote_dataset(remote_paths, dataset)

    local_path = data_dir / "raw" / season / f"{dataset.name}.csv"
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_df = pd.read_csv(local_path) if local_path.exists() else None
    local_rows = len(local_df) if local_df is not None else 0
    remote_rows = len(remote_df)
    local_hash = dataframe_signature(local_df) if local_df is not None else None
    remote_hash = dataframe_signature(remote_df)
    should_update = (
        force
        or not local_path.exists()
        or remote_rows > local_rows
        or remote_hash != local_hash
    )

    if should_update:
        remote_df.to_csv(local_path, index=False)
        active_df = remote_df
    else:
        active_df = local_df if local_df is not None else remote_df

    result = SeasonSyncResult(
        dataset=dataset.name,
        season=season,
        source_mode=source_mode,
        remote_paths=remote_paths,
        remote_urls=remote_urls,
        local_path=str(local_path),
        local_rows=local_rows,
        remote_rows=remote_rows,
        local_hash=local_hash,
        remote_hash=remote_hash,
        updated=should_update,
    )
    return result, active_df


def build_master_dataset(
    data_dir: Path,
    dataset: DatasetConfig,
    season_frames: list[tuple[str, pd.DataFrame]],
) -> Path:
    master_frames: list[pd.DataFrame] = []
    for season, frame in season_frames:
        prepared = frame.copy()
        if "source_season" not in prepared.columns:
            prepared["source_season"] = season
        master_frames.append(prepared)

    master_df = pd.concat(master_frames, ignore_index=True)
    master_df = sort_frame(master_df, dataset)
    output_path = data_dir / dataset.output_filename
    master_df.to_csv(output_path, index=False)
    return output_path


def write_sync_state(data_dir: Path, datasets_summary: dict[str, object]) -> Path:
    state_path = data_dir / "sync_state.json"
    payload = {
        "synced_at_utc": datetime.now(UTC).isoformat(),
        "datasets": datasets_summary,
    }
    state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return state_path


def run_sync(
    data_dir: Path,
    seasons: Iterable[str] = SEASONS,
    dataset_names: Sequence[str] = DEFAULT_DATASETS,
    force: bool = False,
) -> dict[str, object]:
    repo_paths = fetch_repository_paths()
    datasets_summary: dict[str, object] = {}

    for dataset_name in dataset_names:
        dataset = DATASET_CONFIGS[dataset_name]
        results: list[SeasonSyncResult] = []
        season_frames: list[tuple[str, pd.DataFrame]] = []

        for season in seasons:
            result, frame = sync_season_dataset(
                season=season,
                dataset=dataset,
                repo_paths=repo_paths,
                data_dir=data_dir,
                force=force,
            )
            results.append(result)
            season_frames.append((season, frame))

        master_path = build_master_dataset(data_dir, dataset, season_frames)
        datasets_summary[dataset_name] = {
            "output_path": str(master_path),
            "seasons": [asdict(result) for result in results],
        }

    state_path = write_sync_state(data_dir, datasets_summary)

    return {
        "data_dir": str(data_dir),
        "sync_state_path": str(state_path),
        "datasets": datasets_summary,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync FPL Core Insights datasets into local storage.",
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="Directory for raw season files and merged master datasets.",
    )
    parser.add_argument(
        "--datasets",
        nargs="+",
        choices=sorted(DATASET_CONFIGS),
        default=list(DEFAULT_DATASETS),
        help="Datasets to sync. Defaults to matches, players, playerstats, and playermatchstats.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite local season files even when row counts have not increased.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = run_sync(
        data_dir=Path(args.data_dir),
        dataset_names=tuple(args.datasets),
        force=args.force,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
