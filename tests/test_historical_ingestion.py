from pathlib import Path


from fpl_predictor.historical_ingestion import (
    DEFAULT_START_YEAR,
    canonical_team_key,
    parse_football_data_kickoff,
    read_football_data_csv,
    season_code,
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
