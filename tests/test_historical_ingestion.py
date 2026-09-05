import os
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests

from fpl_predictor.historical_ingestion import (
    DEFAULT_START_YEAR,
    canonical_team_key,
    download_season,
    parse_football_data_kickoff,
    read_football_data_csv,
    season_code,
    sync_football_data_history,
)


def test_history_starts_with_earliest_available_premier_league_csv() -> None:
    assert DEFAULT_START_YEAR == 1993
    assert season_code(DEFAULT_START_YEAR) == "9394"


def test_canonical_team_key_reconciles_common_aliases() -> None:
    assert canonical_team_key("Man Utd") == "manchester-united"
    assert canonical_team_key("Sheffield Weds") == "sheffield-wednesday"
    assert canonical_team_key("Nott'm Forest") == "nottingham-forest"
    assert canonical_team_key("Spurs") == "tottenham"
    assert canonical_team_key("Coventry City") == "coventry"
    assert canonical_team_key("Hull City") == "hull"
    assert canonical_team_key("Ipswich Town") == "ipswich"


def test_read_football_data_csv_keeps_leading_fields_on_ragged_rows(tmp_path: Path) -> None:
    path = tmp_path / "E0.csv"
    path.write_text(
        "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,B365H,B365D,B365A\n"
        "E0,03/04/04,Tottenham,Chelsea,0,1,A,4,3.25,1.9,extra,extra,extra\n"
        "E0,04/04/04,Liverpool,Blackburn,4,0,H,1.6,3.4,6\n",
        encoding="utf-8",
    )

    frame = read_football_data_csv(path)

    assert list(frame.columns)[:7] == ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"]
    assert len(frame) == 2
    assert frame.iloc[0]["HomeTeam"] == "Tottenham"
    assert frame.iloc[0]["FTHG"] == "0"
    assert frame.iloc[1]["AwayTeam"] == "Blackburn"


def test_parse_football_data_kickoff_converts_london_local_time_to_utc() -> None:
    kickoff = parse_football_data_kickoff("16/08/25", "12:30")

    assert kickoff.tzinfo is not None
    assert str(kickoff.tz) == "UTC"
    assert kickoff.hour == 11
    assert kickoff.minute == 30


def test_rebuilds_historical_corpus_from_cached_seasons_without_network(tmp_path, monkeypatch) -> None:
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    for year in (1993, 1994):
        (raw_dir / f"E0_{season_code(year)}.csv").write_text(
            f"Date,HomeTeam,AwayTeam,FTHG,FTAG\n01/09/{year},Arsenal,Chelsea,2,1\n"
        )
    get = Mock(side_effect=AssertionError("Cached history should not use the network"))
    monkeypatch.setattr("fpl_predictor.historical_ingestion.get_with_retries", get)

    summary = sync_football_data_history(raw_dir, tmp_path / "combined.csv", [1993, 1994])

    assert summary["rows"] == 2
    assert all(not season["downloaded"] for season in summary["seasons"])
    assert (tmp_path / "combined.csv").exists()
    get.assert_not_called()


@pytest.mark.parametrize("force, mid_season", [(True, False), (False, True), (False, False)])
def test_downloads_missing_forced_or_incomplete_season(tmp_path, monkeypatch, force, mid_season) -> None:
    path = tmp_path / "E0_9394.csv"
    if force or mid_season:
        path.write_bytes(b"old data")
    if mid_season:
        saved_at = datetime(1994, 1, 1, tzinfo=UTC).timestamp()
        os.utime(path, (saved_at, saved_at))
    content = b"Date,HomeTeam,AwayTeam,FTHG,FTAG\n01/09/93,Arsenal,Chelsea,2,1\n"
    get = Mock(return_value=Mock(content=content))
    monkeypatch.setattr("fpl_predictor.historical_ingestion.get_with_retries", get)

    result, downloaded = download_season(1993, tmp_path, force=force)

    assert downloaded is True
    assert result.read_bytes() == content
    assert not path.with_suffix(".tmp").exists()
    # The completed snapshot is now reusable without another request.
    assert download_season(1993, tmp_path) == (path, False)
    get.assert_called_once()


def test_failed_download_keeps_previous_snapshot(tmp_path, monkeypatch) -> None:
    path = tmp_path / "E0_9394.csv"
    path.write_bytes(b"existing snapshot")
    monkeypatch.setattr(
        "fpl_predictor.historical_ingestion.get_with_retries",
        Mock(side_effect=requests.HTTPError("503")),
    )
    with pytest.raises(requests.HTTPError):
        download_season(1993, tmp_path, force=True)
    assert path.read_bytes() == b"existing snapshot"
