import json
import shutil
from unittest.mock import Mock

import pandas as pd
import pytest
import requests

from fpl_predictor.data_ingestion import (
    DATASET_CONFIGS,
    build_raw_url,
    discover_available_seasons,
    extract_gameweek,
    find_season_dataset_paths,
    find_season_matches_paths,
    fetch_repository_files,
    git_blob_hash,
    run_sync,
    select_recent_seasons,
)


def test_discovers_and_selects_recent_seasons_from_upstream_paths() -> None:
    paths = [
        "README.md",
        "data/2024-2025/matches.csv",
        "data/2025-2026/teams.csv",
        "data/2026-2027/By Gameweek/GW1/matches.csv",
    ]

    assert discover_available_seasons(paths) == ["2024-2025", "2025-2026", "2026-2027"]
    assert select_recent_seasons(paths, count=2) == ("2025-2026", "2026-2027")


def test_extract_gameweek_reads_numeric_suffix() -> None:
    path = "data/2025-2026/By Gameweek/GW29/matches.csv"
    assert extract_gameweek(path) == 29


def test_extract_gameweek_supports_other_datasets() -> None:
    path = "data/2025-2026/By Gameweek/GW12/playerstats.csv"
    assert extract_gameweek(path, "playerstats") == 12


def test_extract_gameweek_supports_players() -> None:
    path = "data/2025-2026/By Gameweek/GW7/players.csv"
    assert extract_gameweek(path, "players") == 7


def test_extract_gameweek_supports_teams() -> None:
    path = "data/2025-2026/By Gameweek/GW4/teams.csv"
    assert extract_gameweek(path, "teams") == 4


def test_extract_gameweek_rejects_non_matches_file() -> None:
    path = "data/2025-2026/By Gameweek/GW29/fixtures.csv"
    assert extract_gameweek(path) is None


def test_find_season_matches_paths_selects_sorted_gameweeks() -> None:
    paths = [
        "data/2024-2025/matches/GW5/matches.csv",
        "data/2024-2025/matches/GW30/matches.csv",
        "data/2024-2025/matches/GW29/matches.csv",
    ]
    assert find_season_matches_paths(paths, "2024-2025") == [
        "data/2024-2025/matches/GW5/matches.csv",
        "data/2024-2025/matches/GW29/matches.csv",
        "data/2024-2025/matches/GW30/matches.csv",
    ]


def test_build_raw_url_encodes_spaces() -> None:
    url = build_raw_url("data/2025-2026/By Gameweek/GW30/matches.csv")
    assert "By%20Gameweek" in url


def test_find_season_matches_paths_prefers_master_matches_file() -> None:
    paths = [
        "data/2024-2025/matches/GW37/matches.csv",
        "data/2024-2025/matches/GW38/matches.csv",
        "data/2024-2025/matches/matches.csv",
    ]
    assert find_season_matches_paths(paths, "2024-2025") == [
        "data/2024-2025/matches/matches.csv"
    ]


def test_find_season_dataset_paths_respects_dataset_config() -> None:
    paths = [
        "data/2024-2025/playerstats/GW1/playerstats.csv",
        "data/2024-2025/playerstats/GW2/playerstats.csv",
        "data/2024-2025/playerstats/playerstats.csv",
    ]
    assert find_season_dataset_paths(paths, "2024-2025", DATASET_CONFIGS["playerstats"]) == [
        "data/2024-2025/playerstats/GW1/playerstats.csv",
        "data/2024-2025/playerstats/GW2/playerstats.csv",
    ]


def test_find_season_dataset_paths_prefers_players_master_file() -> None:
    paths = [
        "data/2025-2026/By Gameweek/GW1/players.csv",
        "data/2025-2026/By Gameweek/GW2/players.csv",
        "data/2025-2026/players.csv",
    ]
    assert find_season_dataset_paths(paths, "2025-2026", DATASET_CONFIGS["players"]) == [
        "data/2025-2026/players.csv",
    ]


def test_find_season_dataset_paths_prefers_teams_master_file() -> None:
    paths = [
        "data/2025-2026/By Gameweek/GW1/teams.csv",
        "data/2025-2026/By Gameweek/GW2/teams.csv",
        "data/2025-2026/teams.csv",
    ]
    assert find_season_dataset_paths(paths, "2025-2026", DATASET_CONFIGS["teams"]) == [
        "data/2025-2026/teams.csv",
    ]


def test_sync_downloads_only_changed_blobs_across_fresh_runners(tmp_path, monkeypatch) -> None:
    paths = [f"data/2024-2025/playerstats/GW{week}/playerstats.csv" for week in (1, 2)]
    contents = {path: f"id,total_points\n1,{week}\n".encode() for week, path in enumerate(paths, 1)}
    monkeypatch.setattr(
        "fpl_predictor.data_ingestion.fetch_repository_files",
        lambda: {path: git_blob_hash(content) for path, content in contents.items()},
    )
    get = Mock(side_effect=lambda _session, url: Mock(content=next(
        content for path, content in contents.items() if build_raw_url(path) == url
    )))
    monkeypatch.setattr("fpl_predictor.data_ingestion.get_with_retries", get)

    first = tmp_path / "first"
    run_sync(first, dataset_names=("playerstats",))
    assert get.call_count == 2
    original = pd.read_csv(first / "playerstats.csv")

    # GitHub Actions restores only download caches, not prior sync success state.
    second = tmp_path / "second"
    shutil.copytree(first / "cache", second / "cache")
    get.reset_mock()
    summary = run_sync(second, dataset_names=("playerstats",))
    get.assert_not_called()
    assert summary["any_updated"] is True  # Training is still attempted on this runner.
    pd.testing.assert_frame_equal(original, pd.read_csv(second / "playerstats.csv"))

    contents[paths[1]] = b"id,total_points\n1,9\n"
    summary = run_sync(second, dataset_names=("playerstats",))
    get.assert_called_once()
    assert summary["any_updated"] is True
    updated = pd.read_csv(second / "playerstats.csv")
    assert updated["total_points"].tolist() == [1, 9]
    assert updated["source_gameweek"].tolist() == [1, 2]
    assert len(list((second / "cache" / "upstream").glob("*.csv"))) == 2

    get.reset_mock()
    assert run_sync(second, dataset_names=("playerstats",))["any_updated"] is False
    get.assert_not_called()
    run_sync(second, dataset_names=("playerstats",), force=True)
    assert get.call_count == 2


def test_sync_repairs_damaged_cache_and_rejects_upstream_race(tmp_path, monkeypatch) -> None:
    path = "data/2024-2025/matches.csv"
    content = b"match_id,home_score\nmatch-1,2\n"
    sha = git_blob_hash(content)
    monkeypatch.setattr("fpl_predictor.data_ingestion.fetch_repository_files", lambda: {path: sha})
    get = Mock(return_value=Mock(content=content))
    monkeypatch.setattr("fpl_predictor.data_ingestion.get_with_retries", get)
    run_sync(tmp_path, dataset_names=("matches",))
    cache_path = tmp_path / "cache" / "upstream" / f"{sha}.csv"
    cache_path.write_bytes(b"damaged")
    run_sync(tmp_path, dataset_names=("matches",))
    assert cache_path.read_bytes() == content
    assert get.call_count == 2

    get.return_value.content = b"match_id,home_score\nmatch-1,4\n"
    with pytest.raises(ValueError, match="changed during sync"):
        run_sync(tmp_path, dataset_names=("matches",), force=True)
    assert cache_path.read_bytes() == content
    assert pd.read_csv(tmp_path / "matches.csv")["home_score"].tolist() == [2]


def test_fetch_repository_files_retains_hashes_and_rejects_truncated_tree(monkeypatch) -> None:
    payload = {"tree": [{"type": "blob", "path": "data/file.csv", "sha": "a"}, {"type": "tree", "path": "data", "sha": "b"}]}
    response = Mock()
    response.json.side_effect = lambda: json.loads(json.dumps(payload))
    monkeypatch.setattr("fpl_predictor.data_ingestion.get_with_retries", Mock(return_value=response))
    assert fetch_repository_files() == {"data/file.csv": "a"}
    payload["truncated"] = True
    with pytest.raises(ValueError, match="truncated"):
        fetch_repository_files()


def test_failed_sync_reuses_completed_downloads_on_retry(tmp_path, monkeypatch) -> None:
    contents = {
        "data/2024-2025/playerstats/GW1/playerstats.csv": b"id,total_points\n1,3\n",
        "data/2024-2025/playerstats/GW2/playerstats.csv": b"id,total_points\n1,4\n",
    }
    monkeypatch.setattr(
        "fpl_predictor.data_ingestion.fetch_repository_files",
        lambda: {path: git_blob_hash(content) for path, content in contents.items()},
    )
    first, second = contents.values()
    get = Mock(side_effect=[Mock(content=first), requests.HTTPError("503"), Mock(content=second)])
    monkeypatch.setattr("fpl_predictor.data_ingestion.get_with_retries", get)

    with pytest.raises(requests.HTTPError):
        run_sync(tmp_path, dataset_names=("playerstats",))
    assert not (tmp_path / "sync_state.json").exists()
    assert len(list((tmp_path / "cache" / "upstream").glob("*.csv"))) == 1

    summary = run_sync(tmp_path, dataset_names=("playerstats",))
    assert summary["any_updated"] is True
    assert get.call_count == 3
    assert pd.read_csv(tmp_path / "playerstats.csv")["total_points"].tolist() == [3, 4]
