from pathlib import Path

from fpl_predictor.api_backend import inference_paths


def test_inference_paths_keep_v2_as_the_default(monkeypatch) -> None:
    for name in (
        "MODEL_VERSION",
        "MODEL_PATH",
        "METRICS_PATH",
        "MODEL_BUNDLE_PATH",
        "PREDICTION_FEATURE_TABLE_PATH",
    ):
        monkeypatch.delenv(name, raising=False)

    paths = inference_paths()

    assert paths.model_path == Path("data/models/model_v2.json")
    assert paths.prediction_feature_table_path == Path("data/features/match_pre_match_features.csv")
    assert paths.bundle_path is None


def test_inference_paths_select_the_guarded_v3_bundle(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_VERSION", "v3")
    for name in (
        "MODEL_PATH",
        "METRICS_PATH",
        "MODEL_BUNDLE_PATH",
        "PREDICTION_FEATURE_TABLE_PATH",
    ):
        monkeypatch.delenv(name, raising=False)

    paths = inference_paths()

    assert paths.model_path == Path("data/models/model_v3.json")
    assert paths.metrics_path == Path("data/models/model_v3_metrics.json")
    assert paths.prediction_feature_table_path == Path("data/features/match_pre_match_features_v3.csv")
    assert paths.bundle_path == Path("data/models/model_v3_bundle.json")
