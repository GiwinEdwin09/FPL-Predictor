from __future__ import annotations

import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from fpl_predictor.model_bundle import create_model_bundle
from fpl_predictor.model_training import TEMPERATURE_GRID, V3_FEATURE_COLUMNS
from fpl_predictor.predictors import feature_columns_for_model, predict_match_probabilities
from fpl_predictor.web_dashboard import load_model, load_model_metadata

LOG_LOSS_MARGIN = 0.02
PROBABILITY_SUM_TOLERANCE = 1e-5


@dataclass(frozen=True)
class DeployDecision:
    deploy: bool
    reason: str
    candidate_log_loss: float
    incumbent_log_loss: float | None
    margin: float = LOG_LOSS_MARGIN


def probabilities_are_sane(probabilities: np.ndarray) -> bool:
    values = np.asarray(probabilities, dtype=float)
    if values.ndim != 2 or values.shape[1] != 3:
        return False
    if not np.isfinite(values).all():
        return False
    totals = values.sum(axis=1)
    return bool(np.all(np.abs(totals - 1.0) <= PROBABILITY_SUM_TOLERANCE))


def temperature_is_sane(temperature: float) -> bool:
    return float(TEMPERATURE_GRID.min()) <= float(temperature) <= float(TEMPERATURE_GRID.max())


def feature_columns_match(candidate_columns: list[str] | tuple[str, ...], expected: tuple[str, ...] | None = None) -> bool:
    expected_columns = list(expected or V3_FEATURE_COLUMNS)
    return list(candidate_columns) == expected_columns


def score_model_log_loss(
    model: Any,
    frame: pd.DataFrame,
    *,
    temperature: float,
    feature_columns: list[str] | tuple[str, ...] | None = None,
) -> tuple[float, np.ndarray]:
    columns = feature_columns_for_model(model, feature_columns)
    probabilities = predict_match_probabilities(
        model,
        frame,
        feature_columns=columns,
        temperature=temperature,
    )
    return float(log_loss(frame["target"], probabilities, labels=[0, 1, 2])), probabilities


def decide_deploy(
    *,
    candidate_log_loss: float,
    incumbent_log_loss: float | None,
    candidate_probabilities: np.ndarray,
    candidate_temperature: float,
    candidate_feature_columns: list[str] | tuple[str, ...],
    margin: float = LOG_LOSS_MARGIN,
) -> DeployDecision:
    if not probabilities_are_sane(candidate_probabilities):
        return DeployDecision(
            False,
            "candidate failed probability sanity checks",
            candidate_log_loss,
            incumbent_log_loss,
            margin,
        )
    if not temperature_is_sane(candidate_temperature):
        return DeployDecision(
            False,
            "candidate temperature is outside the allowed grid",
            candidate_log_loss,
            incumbent_log_loss,
            margin,
        )
    if not feature_columns_match(candidate_feature_columns):
        return DeployDecision(
            False,
            "candidate feature columns do not match the v3 schema",
            candidate_log_loss,
            incumbent_log_loss,
            margin,
        )
    if incumbent_log_loss is None or not np.isfinite(incumbent_log_loss):
        return DeployDecision(
            True,
            "no incumbent model; deploying candidate",
            candidate_log_loss,
            incumbent_log_loss,
            margin,
        )
    if candidate_log_loss <= incumbent_log_loss + margin:
        return DeployDecision(
            True,
            "candidate log loss is within the allowed margin of the incumbent",
            candidate_log_loss,
            incumbent_log_loss,
            margin,
        )
    return DeployDecision(
        False,
        "candidate log loss is worse than the incumbent by more than the allowed margin",
        candidate_log_loss,
        incumbent_log_loss,
        margin,
    )


def score_saved_model(
    model_path: Path,
    metrics_path: Path,
    validation: pd.DataFrame,
) -> tuple[float, np.ndarray, float, list[str]] | None:
    if not model_path.exists() or not metrics_path.exists():
        return None
    try:
        model = load_model(model_path)
        temperature, metadata = load_model_metadata(metrics_path)
        columns = list(metadata.get("feature_columns") or V3_FEATURE_COLUMNS)
        loss, probabilities = score_model_log_loss(
            model,
            validation,
            temperature=temperature,
            feature_columns=columns,
        )
    except Exception:
        return None
    return loss, probabilities, float(temperature), columns


def copy_model_artifacts(source_model_path: Path, destination_model_path: Path) -> None:
    destination_model_path.parent.mkdir(parents=True, exist_ok=True)
    stem = source_model_path.stem
    source_dir = source_model_path.parent
    destination_dir = destination_model_path.parent
    for suffix in ("", "_xgboost", "_metrics", "_bundle", "_team_keys"):
        source = source_dir / f"{stem}{suffix}.json"
        if source.exists():
            shutil.copy2(source, destination_dir / f"{destination_model_path.stem}{suffix}.json")


def rewrite_production_bundle(
    *,
    model_path: Path,
    metrics_path: Path,
    prediction_features_path: Path,
    feature_columns: list[str],
) -> None:
    bundle_path = model_path.with_name(f"{model_path.stem}_bundle.json")
    team_keys_path = model_path.with_name(f"{model_path.stem}_team_keys.json")
    tree_path = model_path.with_name(f"{model_path.stem}_xgboost.json")
    additional = {"tree_model": tree_path} if tree_path.exists() else None
    if not team_keys_path.exists():
        return
    create_model_bundle(
        bundle_path,
        model_version="v3",
        predictor_type="blend_v3",
        feature_columns=feature_columns,
        model_path=model_path,
        metrics_path=metrics_path,
        prediction_features_path=prediction_features_path,
        team_keys_path=team_keys_path,
        additional_components=additional,
    )


def maybe_promote_candidate(
    *,
    candidate_model_path: Path,
    candidate_metrics_path: Path,
    production_model_path: Path,
    production_metrics_path: Path,
    validation: pd.DataFrame,
    prediction_features_path: Path,
) -> dict[str, Any]:
    candidate = score_saved_model(candidate_model_path, candidate_metrics_path, validation)
    if candidate is None:
        return asdict(
            DeployDecision(
                False,
                "candidate model could not be scored",
                float("nan"),
                None,
            )
        )
    candidate_loss, candidate_probabilities, candidate_temperature, candidate_columns = candidate
    incumbent = score_saved_model(production_model_path, production_metrics_path, validation)
    incumbent_loss = None if incumbent is None else incumbent[0]
    decision = decide_deploy(
        candidate_log_loss=candidate_loss,
        incumbent_log_loss=incumbent_loss,
        candidate_probabilities=candidate_probabilities,
        candidate_temperature=candidate_temperature,
        candidate_feature_columns=candidate_columns,
    )
    if decision.deploy:
        copy_model_artifacts(candidate_model_path, production_model_path)
        rewrite_production_bundle(
            model_path=production_model_path,
            metrics_path=production_metrics_path,
            prediction_features_path=prediction_features_path,
            feature_columns=candidate_columns,
        )
    elif production_model_path.exists():
        rewrite_production_bundle(
            model_path=production_model_path,
            metrics_path=production_metrics_path,
            prediction_features_path=prediction_features_path,
            feature_columns=list((incumbent[3] if incumbent else candidate_columns)),
        )
    return asdict(decision)
