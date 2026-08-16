from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from fpl_predictor.dixon_coles import DEFAULT_HALF_LIFE_DAYS, fit_dixon_coles, predict_dixon_coles
from fpl_predictor.feature_factory import build_pre_match_feature_table
from fpl_predictor.model_training import (
    V3_FEATURE_COLUMNS,
    TrainingSummary,
    add_derived_features,
    add_sorting_columns,
    apply_temperature,
    build_target,
    competition_sample_weight,
    load_prediction_feature_frame,
    multiclass_brier_score,
    select_calibration_rows,
    split_train_validation,
    summarize_competitions,
    summarize_targets,
)
from fpl_predictor.predictors import (
    BlendPredictor,
    choose_blend_and_temperature,
    fit_regularized_xgboost,
    recency_sample_weights,
    sklearn_probabilities,
)
from fpl_predictor.training_corpus import load_team_key_lookup


@dataclass(frozen=True)
class ModelV3TrainingSummary(TrainingSummary):
    dixon_coles_weight: float
    half_life_days: float
    predictor_type: str


def build_v3_training_feature_frame(
    matches_path: Path,
    training_feature_table_path: Path,
    data_dir: Path = Path("data"),
    include_historical_rows: bool = True,
) -> pd.DataFrame:
    matches = pd.read_csv(matches_path)
    lookup = load_team_key_lookup(data_dir)
    features = build_pre_match_feature_table(
        matches,
        competition_scope="all",
        team_key_lookup=lookup,
        include_historical_rows=include_historical_rows,
    )
    features = add_sorting_columns(features)
    features = add_derived_features(features)
    training_feature_table_path.parent.mkdir(parents=True, exist_ok=True)
    features.to_csv(training_feature_table_path, index=False)
    return features


def load_v3_training_frame(training_feature_table_path: Path) -> pd.DataFrame:
    features = pd.read_csv(training_feature_table_path)
    features = add_sorting_columns(features)
    features = add_derived_features(features)
    features["target"] = build_target(features)
    features = features.loc[features["target"] >= 0].copy()
    features = features.loc[features["kickoff_time"].notna()].copy()
    features["sample_weight"] = competition_sample_weight(features)
    return features.sort_values(
        ["kickoff_time", "source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)


def train_blend_predictor(
    train: pd.DataFrame,
    *,
    feature_columns: tuple[str, ...] = V3_FEATURE_COLUMNS,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    bake_temperature: bool = False,
) -> tuple[BlendPredictor, dict[str, Any]]:
    fit_train, calibration, calibration_cutoff = select_calibration_rows(train)
    if fit_train.empty:
        fit_train = train
        calibration = train.iloc[0:0].copy()
        calibration_cutoff = "disabled"

    weights = recency_sample_weights(
        fit_train["kickoff_time"],
        fit_train["sample_weight"],
        half_life_days=half_life_days,
    )
    tree_model = fit_regularized_xgboost(fit_train, feature_columns, sample_weight=weights)
    dixon_coles = fit_dixon_coles(fit_train, half_life_days=half_life_days)

    if calibration.empty:
        weight, temperature, calibration_score = 0.6, 1.0, float("nan")
    else:
        dixon_probabilities = predict_dixon_coles(
            dixon_coles,
            calibration.get("home_team_key", calibration["home_team"]),
            calibration.get("away_team_key", calibration["away_team"]),
        )
        tree_probabilities = sklearn_probabilities(tree_model, calibration, feature_columns)
        weight, temperature, calibration_score = choose_blend_and_temperature(
            dixon_probabilities,
            tree_probabilities,
            calibration["target"].to_numpy(dtype=int),
        )

    predictor = BlendPredictor(
        dixon_coles=dixon_coles,
        tree_model=tree_model,
        feature_columns=list(feature_columns),
        dixon_coles_weight=weight,
        temperature=temperature if bake_temperature else 1.0,
    )
    details = {
        "dixon_coles_weight": weight,
        "calibration_temperature": temperature,
        "calibration_rows": int(len(calibration)),
        "calibration_cutoff_utc": calibration_cutoff,
        "calibration_log_loss": calibration_score,
        "fit_train_rows": int(len(fit_train)),
        "half_life_days": half_life_days,
    }
    return predictor, details


def train_and_save_model_v3(
    prediction_feature_table_path: Path,
    training_feature_table_path: Path,
    matches_path: Path,
    model_path: Path,
    metrics_path: Path,
    data_dir: Path = Path("data"),
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> ModelV3TrainingSummary:
    load_prediction_feature_frame(prediction_feature_table_path)
    build_v3_training_feature_frame(
        matches_path,
        training_feature_table_path,
        data_dir=data_dir,
        include_historical_rows=True,
    )
    frame = load_v3_training_frame(training_feature_table_path)
    train, validation, split_summary = split_train_validation(frame)
    predictor, details = train_blend_predictor(train, half_life_days=half_life_days)
    probabilities = predictor.predict_proba(validation)
    probabilities = apply_temperature(probabilities, details["calibration_temperature"])
    predictions = probabilities.argmax(axis=1)

    metrics = {
        "accuracy": float((predictions == validation["target"].to_numpy()).mean()),
        "multiclass_log_loss": float(log_loss(validation["target"], probabilities, labels=[0, 1, 2])),
        "multiclass_brier_score": multiclass_brier_score(validation["target"].to_numpy(), probabilities),
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    predictor.save(model_path)

    summary = ModelV3TrainingSummary(
        model_path=str(model_path),
        metrics_path=str(metrics_path),
        prediction_feature_table_path=str(prediction_feature_table_path),
        training_feature_table_path=str(training_feature_table_path),
        target_distribution_train=summarize_targets(train),
        target_distribution_validation=summarize_targets(validation),
        competition_distribution_train=summarize_competitions(train),
        split=split_summary,
        calibration_temperature=float(details["calibration_temperature"]),
        calibration_rows=int(details["calibration_rows"]),
        calibration_cutoff_utc=str(details["calibration_cutoff_utc"]),
        metrics=metrics,
        feature_columns=list(V3_FEATURE_COLUMNS),
        dixon_coles_weight=float(details["dixon_coles_weight"]),
        half_life_days=float(half_life_days),
        predictor_type="blend_v3",
    )
    metrics_path.write_text(json.dumps(asdict(summary), indent=2), encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the blended model_v3 predictor.")
    parser.add_argument("--feature-table-path", default="data/features/match_pre_match_features.csv")
    parser.add_argument("--training-feature-table-path", default="data/features/all_match_pre_match_features_v3.csv")
    parser.add_argument("--matches-path", default="data/matches_training.csv")
    parser.add_argument("--model-path", default="data/models/model_v3.json")
    parser.add_argument("--metrics-path", default="data/models/model_v3_metrics.json")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--half-life-days", type=float, default=DEFAULT_HALF_LIFE_DAYS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = train_and_save_model_v3(
        prediction_feature_table_path=Path(args.feature_table_path),
        training_feature_table_path=Path(args.training_feature_table_path),
        matches_path=Path(args.matches_path),
        model_path=Path(args.model_path),
        metrics_path=Path(args.metrics_path),
        data_dir=Path(args.data_dir),
        half_life_days=args.half_life_days,
    )
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":
    main()
