from fpl_predictor.data_ingestion import (
    DATASET_CONFIGS,
    build_raw_url,
    extract_gameweek,
    find_season_dataset_paths,
    find_season_matches_paths,
)


def test_extract_gameweek_reads_numeric_suffix() -> None:
    path = "data/2025-2026/By Gameweek/GW29/matches.csv"
    assert extract_gameweek(path) == 29


def test_extract_gameweek_supports_other_datasets() -> None:
    path = "data/2025-2026/By Gameweek/GW12/playerstats.csv"
    assert extract_gameweek(path, "playerstats") == 12


def test_extract_gameweek_supports_players() -> None:
    path = "data/2025-2026/By Gameweek/GW7/players.csv"
    assert extract_gameweek(path, "players") == 7


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
