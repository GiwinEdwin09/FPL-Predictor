import shutil
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest
import requests

from fpl_predictor.automation import run_refresh_pipeline
from fpl_predictor.data_ingestion import build_raw_url, git_blob_hash, run_sync


@pytest.mark.parametrize("model_version", ["v2", "v3"])
@pytest.mark.parametrize("data_changed, force_retrain, force_sync", [
    (False, False, False), (False, True, False), (True, False, False), (True, False, True),
])
def test_refresh_reuses_download_cache_when_forcing_training(
    tmp_path, monkeypatch, model_version, data_changed, force_retrain, force_sync,
) -> None:
    sync = Mock(return_value={
        "any_updated": data_changed,
        "sync_state_path": str(tmp_path / "sync_state.json"),
        "datasets": {},
    })
    monkeypatch.setattr("fpl_predictor.automation.run_sync", sync)
    features = Mock()
    monkeypatch.setattr("fpl_predictor.automation.build_feature_table", features)
    trainer = Mock()
    monkeypatch.setattr("fpl_predictor.automation.train_and_save_model", trainer)
    monkeypatch.setattr("fpl_predictor.model_v3.train_and_save_model_v3", trainer)
    history = Mock()
    monkeypatch.setattr("fpl_predictor.historical_ingestion.sync_football_data_history", history)
    corpus_path = tmp_path / "matches_training.csv"
    corpus = Mock(return_value=SimpleNamespace(output_path=str(corpus_path)))
    monkeypatch.setattr("fpl_predictor.training_corpus.build_training_corpus", corpus)
    monkeypatch.setattr("fpl_predictor.model_v3.load_v3_training_frame", Mock())
    monkeypatch.setattr("fpl_predictor.model_training.split_train_validation", Mock(return_value=(None, None, None)))
    monkeypatch.setattr("fpl_predictor.model_gate.maybe_promote_candidate", Mock(return_value={
        "deploy": True, "reason": "test",
    }))
    dashboard = Mock()
    monkeypatch.setattr("fpl_predictor.automation.export_dashboard", dashboard)

    result = run_refresh_pipeline(
        data_dir=tmp_path,
        prediction_feature_table_path=tmp_path / "prediction.csv",
        training_feature_table_path=tmp_path / "training.csv",
        matches_path=tmp_path / "matches.csv",
        model_path=tmp_path / "model.json",
        metrics_path=tmp_path / "metrics.json",
        dashboard_path=tmp_path / "dashboard.json",
        model_version=model_version,
        force_retrain=force_retrain,
        force_sync=force_sync,
    )

    sync.assert_called_once_with(data_dir=tmp_path, force=force_sync)
    assert result.data_changed is data_changed
    should_train = data_changed or force_retrain
    assert trainer.call_count == int(should_train)
    assert dashboard.call_count == int(should_train)
    if should_train and model_version == "v3":
        historical_path = tmp_path / "historical" / "football_data_premier_league.csv"
        history.assert_called_once_with(
            raw_dir=tmp_path / "historical" / "football-data" / "raw",
            output_path=historical_path,
            offline=True,
        )
        corpus.assert_called_once_with(
            fci_matches_path=tmp_path / "matches.csv",
            historical_path=historical_path,
            output_path=corpus_path,
            data_dir=tmp_path,
        )
        assert features.call_args.kwargs["matches_path"] == corpus_path
    else:
        history.assert_not_called()


def test_fresh_runner_trains_on_snapshot_and_updated_upstream_results(tmp_path, monkeypatch) -> None:
    snapshot = Path(__file__).resolve().parents[1] / "data/historical/football-data/raw"
    shutil.copytree(snapshot, tmp_path / "historical/football-data/raw")
    assert not (tmp_path / "cache").exists()
    assert not (tmp_path / "raw").exists()
    matches_path = "data/2026-2027/matches.csv"
    content = {
        matches_path: (
            b"match_id,kickoff_time,gameweek,finished,tournament,home_team,away_team,home_score,away_score\n"
            b"fci-new,2026-08-22T14:00:00Z,1,True,prem,3,8,2,1\n"
        ),
        "data/2026-2027/teams.csv": b"id,code,name\n1,3,Arsenal\n2,8,Chelsea\n",
    }
    monkeypatch.setattr("fpl_predictor.data_ingestion.fetch_repository_files", lambda: {
        path: git_blob_hash(data) for path, data in content.items()
    })
    downloaded_urls = []

    def get(_session, url, **_kwargs):
        # Only the expected GitHub CSVs are reachable; Football-Data is unavailable.
        sources = {build_raw_url(path): data for path, data in content.items()}
        assert url in sources, f"Unexpected request during refresh: {url}"
        downloaded_urls.append(url)
        response = requests.Response()
        response.status_code = 200
        response._content = sources[url]
        response._content_consumed = True
        return response

    monkeypatch.setattr(requests.Session, "get", get)
    monkeypatch.setattr("fpl_predictor.automation.run_sync", lambda **kwargs: run_sync(
        **kwargs, dataset_names=("matches", "teams"),
    ))
    monkeypatch.setattr("fpl_predictor.automation.build_feature_table", Mock())
    training_corpora = []
    monkeypatch.setattr("fpl_predictor.model_v3.train_and_save_model_v3", lambda **kwargs: training_corpora.append(
        pd.read_csv(kwargs["matches_path"]),
    ))
    monkeypatch.setattr("fpl_predictor.model_v3.load_v3_training_frame", Mock())
    monkeypatch.setattr("fpl_predictor.model_training.split_train_validation", Mock(return_value=(None, None, None)))
    gate = Mock(return_value={"deploy": True, "reason": "test"})
    monkeypatch.setattr("fpl_predictor.model_gate.maybe_promote_candidate", gate)
    dashboard = Mock()
    monkeypatch.setattr("fpl_predictor.automation.export_dashboard", dashboard)
    kwargs = dict(
        data_dir=tmp_path,
        prediction_feature_table_path=tmp_path / "prediction.csv",
        training_feature_table_path=tmp_path / "training.csv",
        matches_path=tmp_path / "matches.csv",
        model_path=tmp_path / "model.json",
        metrics_path=tmp_path / "metrics.json",
        dashboard_path=tmp_path / "dashboard.json",
        model_version="v3",
    )

    assert run_refresh_pipeline(**kwargs).deployed is True
    assert len(downloaded_urls) == 2
    content[matches_path] = content[matches_path].replace(b",3,8,2,1", b",3,8,3,1")
    assert run_refresh_pipeline(**kwargs).deployed is True
    assert downloaded_urls[2:] == [build_raw_url(matches_path)]

    assert gate.call_count == dashboard.call_count == 2
    for expected_score, corpus in zip((2, 3), training_corpora, strict=True):
        assert len(corpus) == corpus["match_id"].nunique() == 12_705
        assert (corpus["source"] == "football-data.co.uk").sum() == 12_704
        recent = corpus.loc[corpus["match_id"] == "fci-new"].iloc[0]
        assert recent["home_score"] == expected_score
        assert recent["home_team_key"] == "arsenal"
        assert recent["away_team_key"] == "chelsea"
