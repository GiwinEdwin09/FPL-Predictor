from pathlib import Path

import numpy as np

from fpl_predictor.model_gate import copy_model_artifacts, decide_deploy, probabilities_are_sane, temperature_is_sane
from fpl_predictor.model_training import V3_FEATURE_COLUMNS


def test_probabilities_must_be_finite_and_normalized() -> None:
    assert probabilities_are_sane(np.array([[0.5, 0.3, 0.2]]))
    assert not probabilities_are_sane(np.array([[0.5, 0.3, np.nan]]))
    assert not probabilities_are_sane(np.array([[0.9, 0.9, 0.9]]))


def test_temperature_must_stay_on_the_training_grid() -> None:
    assert temperature_is_sane(1.0)
    assert temperature_is_sane(5.0)
    assert not temperature_is_sane(0.5)
    assert not temperature_is_sane(5.1)


def test_deploy_gate_keeps_incumbent_when_candidate_is_worse() -> None:
    decision = decide_deploy(
        candidate_log_loss=1.10,
        incumbent_log_loss=1.03,
        candidate_probabilities=np.array([[0.5, 0.3, 0.2], [0.4, 0.3, 0.3]]),
        candidate_temperature=1.25,
        candidate_feature_columns=V3_FEATURE_COLUMNS,
    )
    assert decision.deploy is False
    assert "worse than the incumbent" in decision.reason


def test_deploy_gate_allows_candidate_within_margin() -> None:
    decision = decide_deploy(
        candidate_log_loss=1.04,
        incumbent_log_loss=1.03,
        candidate_probabilities=np.array([[0.5, 0.3, 0.2]]),
        candidate_temperature=1.25,
        candidate_feature_columns=V3_FEATURE_COLUMNS,
    )
    assert decision.deploy is True


def test_deploy_gate_promotes_first_model() -> None:
    decision = decide_deploy(
        candidate_log_loss=1.05,
        incumbent_log_loss=None,
        candidate_probabilities=np.array([[0.5, 0.3, 0.2]]),
        candidate_temperature=1.0,
        candidate_feature_columns=V3_FEATURE_COLUMNS,
    )
    assert decision.deploy is True
    assert "no incumbent" in decision.reason


def test_deploy_gate_rejects_insane_candidate_even_without_incumbent() -> None:
    decision = decide_deploy(
        candidate_log_loss=1.0,
        incumbent_log_loss=None,
        candidate_probabilities=np.array([[np.inf, 0.0, 0.0]]),
        candidate_temperature=1.0,
        candidate_feature_columns=V3_FEATURE_COLUMNS,
    )
    assert decision.deploy is False
    assert "sanity" in decision.reason


def test_copy_model_artifacts_copies_sidecar_files(tmp_path: Path) -> None:
    source_dir = tmp_path / "candidate"
    destination_dir = tmp_path / "production"
    source_dir.mkdir()
    (source_dir / "model_v3.json").write_text('{"candidate": true}', encoding="utf-8")
    (source_dir / "model_v3_metrics.json").write_text('{"log_loss": 1.05}', encoding="utf-8")
    (source_dir / "model_v3_xgboost.json").write_text("{}", encoding="utf-8")

    copy_model_artifacts(source_dir / "model_v3.json", destination_dir / "model_v3.json")

    assert (destination_dir / "model_v3.json").read_text(encoding="utf-8") == '{"candidate": true}'
    assert (destination_dir / "model_v3_metrics.json").exists()
    assert (destination_dir / "model_v3_xgboost.json").exists()
    assert not (destination_dir / "model_v3_bundle.json").exists()
