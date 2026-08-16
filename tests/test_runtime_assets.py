from pathlib import Path

from fpl_predictor.live_inference import InferencePaths
from fpl_predictor.runtime_assets import ensure_runtime_assets


def test_runtime_assets_can_reuse_verified_v3_bundle(tmp_path: Path, monkeypatch) -> None:
    components = {
        "prediction_features": tmp_path / "prediction.csv",
        "model": tmp_path / "model.json",
        "metrics": tmp_path / "metrics.json",
    }
    exported = {}
    monkeypatch.setattr("fpl_predictor.runtime_assets.run_sync", lambda **_: {})
    monkeypatch.setattr(
        "fpl_predictor.runtime_assets.load_model_bundle",
        lambda *_args, **_kwargs: {"resolved_components": components},
    )
    monkeypatch.setattr(
        "fpl_predictor.runtime_assets.export_dashboard",
        lambda **kwargs: exported.update(kwargs),
    )
    paths = InferencePaths(
        data_dir=tmp_path,
        matches_path=tmp_path / "matches.csv",
        players_path=tmp_path / "players.csv",
        playerstats_path=tmp_path / "playerstats.csv",
        playermatchstats_path=tmp_path / "playermatchstats.csv",
        model_path=tmp_path / "model.json",
        metrics_path=tmp_path / "metrics.json",
        prediction_feature_table_path=tmp_path / "prediction.csv",
        bundle_path=tmp_path / "bundle.json",
    )

    changed = ensure_runtime_assets(
        paths,
        prediction_feature_table_path=tmp_path / "prediction.csv",
        training_feature_table_path=tmp_path / "training.csv",
        dashboard_output_path=tmp_path / "dashboard.json",
        model_version="v3",
        reuse_existing_bundle=True,
    )

    assert changed is True
    assert exported["feature_table_path"] == components["prediction_features"]
    assert exported["model_path"] == components["model"]
