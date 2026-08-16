import json
from pathlib import Path

import pytest

from fpl_predictor.model_bundle import (
    create_model_bundle,
    load_model_bundle,
    write_team_key_snapshot,
)


def _write(path: Path, value: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")
    return path


def test_model_bundle_resolves_and_verifies_all_components(tmp_path: Path) -> None:
    model_path = _write(tmp_path / "models" / "model_v3.json", "{}")
    metrics_path = _write(tmp_path / "models" / "model_v3_metrics.json", "{}")
    features_path = _write(tmp_path / "features" / "prediction.csv", "match_id\n1\n")
    team_keys_path = write_team_key_snapshot(
        tmp_path / "models" / "model_v3_team_keys.json",
        {("2025-2026", 1): "arsenal"},
    )
    booster_path = _write(tmp_path / "models" / "model_v3_xgboost.json", "{}")
    bundle_path = tmp_path / "models" / "model_v3_bundle.json"

    create_model_bundle(
        bundle_path,
        model_version="v3",
        predictor_type="blend_v3",
        feature_columns=["home_current_elo"],
        model_path=model_path,
        metrics_path=metrics_path,
        prediction_features_path=features_path,
        team_keys_path=team_keys_path,
        additional_components={"tree_model": booster_path},
    )

    bundle = load_model_bundle(bundle_path)

    assert bundle["model_version"] == "v3"
    assert bundle["resolved_components"]["model"] == model_path.resolve()
    assert bundle["resolved_components"]["prediction_features"] == features_path.resolve()
    team_keys = json.loads(team_keys_path.read_text(encoding="utf-8"))
    assert team_keys["entries"] == [
        {"season": "2025-2026", "team_id": 1, "team_key": "arsenal"},
    ]


def test_model_bundle_detects_tampered_artifact(tmp_path: Path) -> None:
    model_path = _write(tmp_path / "model.json", "original")
    metrics_path = _write(tmp_path / "metrics.json", "{}")
    features_path = _write(tmp_path / "features.csv", "match_id\n1\n")
    team_keys_path = _write(tmp_path / "team_keys.json", "{}")
    bundle_path = tmp_path / "bundle.json"
    create_model_bundle(
        bundle_path,
        model_version="v3",
        predictor_type="blend_v3",
        feature_columns=[],
        model_path=model_path,
        metrics_path=metrics_path,
        prediction_features_path=features_path,
        team_keys_path=team_keys_path,
    )
    model_path.write_text("tampered", encoding="utf-8")

    with pytest.raises(ValueError, match="failed SHA-256 verification"):
        load_model_bundle(bundle_path)
