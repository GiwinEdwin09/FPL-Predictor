from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from fpl_predictor.dixon_coles import (
    DEFAULT_HALF_LIFE_DAYS,
    add_cold_start_teams,
    fit_dixon_coles,
    predict_dixon_coles,
)
from fpl_predictor.feature_factory import build_pre_match_feature_table
from fpl_predictor.model_bundle import create_model_bundle, write_team_key_snapshot
from fpl_predictor.model_training import (
    V3_FEATURE_COLUMNS,
    TrainingSummary,
    add_derived_features,
    add_sorting_columns,
    apply_temperature,
    build_target,
    competition_sample_weight,
    is_premier_league_frame,
    load_prediction_feature_frame,
    multiclass_brier_score,
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

MIN_CALIBRATION_TRAIN_ROWS = 1_000
MIN_CALIBRATION_SEASON_ROWS = 100
MAX_CALIBRATION_SEASONS = 3
CALIBRATION_BLOCKS_PER_SEASON = 4
DEFAULT_TREE_COUNT = 250
MAX_TREE_COUNT = 1_000
PROMOTION_BOOTSTRAP_SAMPLES = 2_000
MIN_PROMOTION_LOG_LOSS = 1e-4


@dataclass(frozen=True)
class ModelV3TrainingSummary(TrainingSummary):
    dixon_coles_weight: float
    half_life_days: float
    predictor_type: str
    bundle_path: str
    team_keys_path: str
    cold_start_teams: list[str]
    calibration_strategy: str
    calibration_folds: int
    calibration_seasons: list[str]
    tree_n_estimators: int
    selected_predictor: str
    blend_candidate_log_loss: float
    dixon_coles_oof_log_loss: float
    blend_vs_dc_log_loss_ci95: list[float]
    final_fit: dict[str, Any]


def build_calibration_season_folds(
    train: pd.DataFrame,
    *,
    min_train_rows: int = MIN_CALIBRATION_TRAIN_ROWS,
    min_season_rows: int = MIN_CALIBRATION_SEASON_ROWS,
    max_seasons: int = MAX_CALIBRATION_SEASONS,
    blocks_per_season: int = CALIBRATION_BLOCKS_PER_SEASON,
) -> list[tuple[str, pd.DataFrame, pd.DataFrame]]:
    premier_league = train.loc[is_premier_league_frame(train)].copy()
    eligible_seasons = [
        str(season)
        for season, count in premier_league["source_season"].value_counts().items()
        if count >= min_season_rows
    ]
    folds: list[tuple[str, pd.DataFrame, pd.DataFrame]] = []
    for season in sorted(eligible_seasons)[-max(1, max_seasons) :]:
        season_rows = premier_league.loc[premier_league["source_season"] == season].copy()
        kickoff_dates = season_rows["kickoff_time"].dt.normalize().drop_duplicates().sort_values()
        for block_index, date_block in enumerate(
            np.array_split(kickoff_dates.to_numpy(), max(1, blocks_per_season)),
            start=1,
        ):
            if len(date_block) == 0:
                continue
            validation = season_rows.loc[
                season_rows["kickoff_time"].dt.normalize().isin(date_block)
            ].copy()
            cutoff = validation["kickoff_time"].min()
            fit_train = train.loc[train["kickoff_time"] < cutoff].copy()
            if len(fit_train) < min_train_rows or fit_train["target"].nunique() < 3:
                continue
            folds.append((f"{season}-B{block_index}", fit_train, validation))
    return folds


def _fit_blend_components(
    train: pd.DataFrame,
    feature_columns: tuple[str, ...],
    half_life_days: float,
    tree_count: int,
) -> tuple[Any, Any]:
    weights = recency_sample_weights(
        train["kickoff_time"],
        train["sample_weight"],
        half_life_days=half_life_days,
    )
    tree_model = fit_regularized_xgboost(
        train,
        feature_columns,
        sample_weight=weights,
        n_estimators=tree_count,
    )
    dixon_coles = fit_dixon_coles(train, half_life_days=half_life_days)
    return tree_model, dixon_coles


def choose_xgboost_tree_count(
    train: pd.DataFrame,
    *,
    feature_columns: tuple[str, ...],
    half_life_days: float,
) -> int:
    ordered = train.sort_values("kickoff_time", kind="stable").reset_index(drop=True)
    validation_rows = max(100, len(ordered) // 10)
    if len(ordered) - validation_rows < 500:
        return DEFAULT_TREE_COUNT
    fit_train = ordered.iloc[:-validation_rows].copy()
    validation = ordered.iloc[-validation_rows:].copy()
    fit_weights = recency_sample_weights(
        fit_train["kickoff_time"],
        fit_train["sample_weight"],
        half_life_days=half_life_days,
    )
    validation_weights = recency_sample_weights(
        validation["kickoff_time"],
        validation["sample_weight"],
        half_life_days=half_life_days,
    )
    tuning_model = fit_regularized_xgboost(
        fit_train,
        feature_columns,
        sample_weight=fit_weights,
        validation=validation,
        validation_sample_weight=validation_weights,
        n_estimators=MAX_TREE_COUNT,
    )
    best_iteration = getattr(tuning_model, "best_iteration", None)
    return int(best_iteration) + 1 if best_iteration is not None else DEFAULT_TREE_COUNT


def select_calibrated_predictor(
    dixon: np.ndarray,
    trees: np.ndarray,
    targets: np.ndarray,
    fold_labels: list[str],
    *,
    bootstrap_samples: int = PROMOTION_BOOTSTRAP_SAMPLES,
) -> tuple[float, float, float, dict[str, Any]]:
    candidate_weight, candidate_temperature, candidate_score = choose_blend_and_temperature(
        dixon,
        trees,
        targets,
    )
    _, dixon_temperature, dixon_score = choose_blend_and_temperature(
        dixon,
        dixon,
        targets,
        blend_grid=(1.0,),
    )
    candidate_probabilities = apply_temperature(
        candidate_weight * dixon + (1.0 - candidate_weight) * trees,
        candidate_temperature,
    )
    dixon_probabilities = apply_temperature(dixon, dixon_temperature)
    row_indices = np.arange(len(targets))
    loss_difference = (
        -np.log(candidate_probabilities[row_indices, targets])
        + np.log(dixon_probabilities[row_indices, targets])
    )
    labels = np.asarray(fold_labels)
    unique_folds = np.unique(labels)
    fold_losses = [loss_difference[labels == fold_id] for fold_id in unique_folds]
    rng = np.random.default_rng(42)
    bootstrap = np.empty(bootstrap_samples, dtype=float)
    for sample_index in range(bootstrap_samples):
        sampled = rng.integers(0, len(fold_losses), size=len(fold_losses))
        bootstrap[sample_index] = float(np.concatenate([fold_losses[index] for index in sampled]).mean())
    confidence_interval = np.quantile(bootstrap, [0.025, 0.975]).tolist()
    promote_blend = (
        candidate_score < dixon_score - MIN_PROMOTION_LOG_LOSS
        and confidence_interval[1] < -MIN_PROMOTION_LOG_LOSS
    )
    if promote_blend:
        weight, temperature, score = candidate_weight, candidate_temperature, candidate_score
        selected_predictor = "blend"
    else:
        weight, temperature, score = 1.0, dixon_temperature, dixon_score
        selected_predictor = "dixon_coles"
    return weight, temperature, score, {
        "selected_predictor": selected_predictor,
        "blend_candidate_log_loss": candidate_score,
        "dixon_coles_oof_log_loss": dixon_score,
        "blend_vs_dc_log_loss_ci95": confidence_interval,
    }


def choose_oof_blend_and_temperature(
    train: pd.DataFrame,
    *,
    feature_columns: tuple[str, ...],
    half_life_days: float,
    tree_count: int,
) -> tuple[float, float, float, int, list[str], str, dict[str, Any]]:
    folds = build_calibration_season_folds(train)
    dixon_predictions: list[np.ndarray] = []
    tree_predictions: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    fold_labels: list[str] = []
    for fold_id, fit_train, validation in folds:
        tree_model, dixon_coles = _fit_blend_components(
            fit_train,
            feature_columns,
            half_life_days,
            tree_count,
        )
        dixon_predictions.append(
            predict_dixon_coles(
                dixon_coles,
                validation["home_team_key"],
                validation["away_team_key"],
            )
        )
        tree_predictions.append(sklearn_probabilities(tree_model, validation, feature_columns))
        targets.append(validation["target"].to_numpy(dtype=int))
        fold_labels.extend([fold_id] * len(validation))

    if not folds:
        return 1.0, 1.0, float("nan"), 0, [], "disabled", {
            "selected_predictor": "dixon_coles",
            "blend_candidate_log_loss": float("nan"),
            "dixon_coles_oof_log_loss": float("nan"),
            "blend_vs_dc_log_loss_ci95": [float("nan"), float("nan")],
        }
    dixon = np.vstack(dixon_predictions)
    trees = np.vstack(tree_predictions)
    calibration_targets = np.concatenate(targets)
    weight, temperature, score, selection_details = select_calibrated_predictor(
        dixon,
        trees,
        calibration_targets,
        fold_labels,
    )
    fold_ids = [fold_id for fold_id, _, _ in folds]
    cutoff = min(validation["kickoff_time"].min() for _, _, validation in folds).isoformat()
    return weight, temperature, score, int(sum(len(values) for values in targets)), fold_ids, cutoff, selection_details


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
    tree_count = choose_xgboost_tree_count(
        train,
        feature_columns=feature_columns,
        half_life_days=half_life_days,
    )
    (
        weight,
        temperature,
        calibration_score,
        calibration_rows,
        calibration_fold_ids,
        calibration_cutoff,
        selection_details,
    ) = (
        choose_oof_blend_and_temperature(
            train,
            feature_columns=feature_columns,
            half_life_days=half_life_days,
            tree_count=tree_count,
        )
    )
    tree_model, dixon_coles = _fit_blend_components(
        train,
        feature_columns,
        half_life_days,
        tree_count,
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
        "calibration_rows": calibration_rows,
        "calibration_cutoff_utc": calibration_cutoff,
        "calibration_log_loss": calibration_score,
        "calibration_strategy": "season_block_walk_forward_oof" if calibration_fold_ids else "disabled",
        "calibration_folds": len(calibration_fold_ids),
        "calibration_seasons": sorted(
            {fold_id.rsplit("-B", 1)[0] for fold_id in calibration_fold_ids}
        ),
        "fit_train_rows": int(len(train)),
        "half_life_days": half_life_days,
        "tree_n_estimators": tree_count,
        **selection_details,
    }
    return predictor, details


def fit_final_blend_predictor(
    frame: pd.DataFrame,
    selection_details: dict[str, Any],
    *,
    feature_columns: tuple[str, ...] = V3_FEATURE_COLUMNS,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    bake_temperature: bool = False,
) -> BlendPredictor:
    """Refit the selected production predictor on every eligible finished match."""
    tree_model, dixon_coles = _fit_blend_components(
        frame,
        feature_columns,
        half_life_days,
        int(selection_details["tree_n_estimators"]),
    )
    return BlendPredictor(
        dixon_coles=dixon_coles,
        tree_model=tree_model,
        feature_columns=list(feature_columns),
        dixon_coles_weight=float(selection_details["dixon_coles_weight"]),
        temperature=(
            float(selection_details["calibration_temperature"])
            if bake_temperature
            else 1.0
        ),
    )


def summarize_final_fit(frame: pd.DataFrame) -> dict[str, Any]:
    seasons = sorted(str(value) for value in frame["source_season"].dropna().unique())
    kickoffs = pd.to_datetime(
        frame["kickoff_time"],
        errors="coerce",
        utc=True,
        format="mixed",
    ).dropna()
    return {
        "rows": int(len(frame)),
        "seasons": len(seasons),
        "first_season": seasons[0] if seasons else None,
        "latest_season": seasons[-1] if seasons else None,
        "first_finished_kickoff_utc": kickoffs.min().isoformat() if not kickoffs.empty else None,
        "latest_finished_kickoff_utc": kickoffs.max().isoformat() if not kickoffs.empty else None,
        "target_distribution": summarize_targets(frame),
        "competition_distribution": summarize_competitions(frame),
    }


def train_and_save_model_v3(
    prediction_feature_table_path: Path,
    training_feature_table_path: Path,
    matches_path: Path,
    model_path: Path,
    metrics_path: Path,
    data_dir: Path = Path("data"),
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    bundle_path: Path | None = None,
    team_keys_path: Path | None = None,
) -> ModelV3TrainingSummary:
    prediction_features = load_prediction_feature_frame(prediction_feature_table_path)
    build_v3_training_feature_frame(
        matches_path,
        training_feature_table_path,
        data_dir=data_dir,
        include_historical_rows=True,
    )
    frame = load_v3_training_frame(training_feature_table_path)
    train, validation, split_summary = split_train_validation(frame)
    evaluation_predictor, details = train_blend_predictor(
        train,
        half_life_days=half_life_days,
    )
    probabilities = evaluation_predictor.predict_proba(validation)
    probabilities = apply_temperature(probabilities, details["calibration_temperature"])
    predictions = probabilities.argmax(axis=1)
    predictor = fit_final_blend_predictor(
        frame,
        details,
        half_life_days=half_life_days,
    )
    prediction_team_keys = pd.concat(
        [prediction_features["home_team_key"], prediction_features["away_team_key"]],
        ignore_index=True,
    )
    predictor.dixon_coles, cold_start_teams = add_cold_start_teams(
        predictor.dixon_coles,
        prediction_team_keys.dropna(),
    )

    metrics = {
        "accuracy": float((predictions == validation["target"].to_numpy()).mean()),
        "multiclass_log_loss": float(log_loss(validation["target"], probabilities, labels=[0, 1, 2])),
        "multiclass_brier_score": multiclass_brier_score(validation["target"].to_numpy(), probabilities),
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    predictor.save(model_path)
    bundle_path = bundle_path or model_path.with_name(f"{model_path.stem}_bundle.json")
    team_keys_path = team_keys_path or model_path.with_name(f"{model_path.stem}_team_keys.json")
    write_team_key_snapshot(team_keys_path, load_team_key_lookup(data_dir))

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
        bundle_path=str(bundle_path),
        team_keys_path=str(team_keys_path),
        cold_start_teams=cold_start_teams,
        calibration_strategy=str(details["calibration_strategy"]),
        calibration_folds=int(details["calibration_folds"]),
        calibration_seasons=list(details["calibration_seasons"]),
        tree_n_estimators=int(details["tree_n_estimators"]),
        selected_predictor=str(details["selected_predictor"]),
        blend_candidate_log_loss=float(details["blend_candidate_log_loss"]),
        dixon_coles_oof_log_loss=float(details["dixon_coles_oof_log_loss"]),
        blend_vs_dc_log_loss_ci95=[
            float(value) for value in details["blend_vs_dc_log_loss_ci95"]
        ],
        final_fit=summarize_final_fit(frame),
    )
    metrics_path.write_text(json.dumps(asdict(summary), indent=2), encoding="utf-8")
    create_model_bundle(
        bundle_path,
        model_version="v3",
        predictor_type=summary.predictor_type,
        feature_columns=summary.feature_columns,
        model_path=model_path,
        metrics_path=metrics_path,
        prediction_features_path=prediction_feature_table_path,
        team_keys_path=team_keys_path,
        additional_components={
            "tree_model": model_path.with_name(f"{model_path.stem}_xgboost.json"),
        },
    )
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the blended model_v3 predictor.")
    parser.add_argument("--feature-table-path", default="data/features/match_pre_match_features_v3.csv")
    parser.add_argument("--training-feature-table-path", default="data/features/all_match_pre_match_features_v3.csv")
    parser.add_argument("--matches-path", default="data/matches_training.csv")
    parser.add_argument("--model-path", default="data/models/model_v3.json")
    parser.add_argument("--metrics-path", default="data/models/model_v3_metrics.json")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--half-life-days", type=float, default=DEFAULT_HALF_LIFE_DAYS)
    parser.add_argument("--bundle-path", default=None)
    parser.add_argument("--team-keys-path", default=None)
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
        bundle_path=Path(args.bundle_path) if args.bundle_path else None,
        team_keys_path=Path(args.team_keys_path) if args.team_keys_path else None,
    )
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":
    main()
