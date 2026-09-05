from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from fpl_predictor.automation import run_refresh_pipeline


@pytest.mark.parametrize("model_version", ["v2", "v3"])
@pytest.mark.parametrize("data_changed, force_retrain", [(False, False), (False, True), (True, False)])
def test_refresh_reuses_download_cache_when_forcing_training(
    tmp_path, monkeypatch, model_version, data_changed, force_retrain,
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
    )

    sync.assert_called_once_with(data_dir=tmp_path, force=False)
    assert result.data_changed is data_changed
    should_train = data_changed or force_retrain
    assert trainer.call_count == int(should_train)
    assert dashboard.call_count == int(should_train)
    if should_train and model_version == "v3":
        historical_path = tmp_path / "historical" / "football_data_premier_league.csv"
        history.assert_called_once_with(
            raw_dir=tmp_path / "historical" / "football-data" / "raw",
            output_path=historical_path,
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
