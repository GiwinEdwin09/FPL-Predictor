from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss

from fpl_predictor.feature_factory import build_pre_match_feature_table

PREMIER_LEAGUE_TOURNAMENTS = frozenset({"prem", "premier league"})
FEATURE_COLUMNS = (
    "is_cup_match",
    "is_european_match",
    "is_premier_league_match",
    "home_last5_matches",
    "home_days_rest",
    "home_current_elo",
    "home_last5_avg_xg",
    "home_last5_avg_xga",
    "home_last5_avg_shots_on_target",
    "home_last5_avg_big_chances",
    "home_last5_avg_tackles_won",
    "home_last5_clean_sheet_rate",
    "away_last5_matches",
    "away_days_rest",
    "away_current_elo",
    "away_last5_avg_xg",
    "away_last5_avg_xga",
    "away_last5_avg_shots_on_target",
    "away_last5_avg_big_chances",
    "away_last5_avg_tackles_won",
    "away_last5_clean_sheet_rate",
    "elo_diff",
    "days_rest_diff",
    "last5_matches_diff",
    "last5_avg_xg_diff",
    "last5_avg_xga_diff",
    "last5_avg_shots_on_target_diff",
    "last5_avg_big_chances_diff",
    "last5_avg_tackles_won_diff",
    "last5_clean_sheet_rate_diff",
)
VALIDATION_WINDOW_DAYS = 28
CALIBRATION_WINDOW_DAYS = 21
TEMPERATURE_GRID = np.linspace(1.0, 5.0, 41)
COMPETITION_WEIGHTS = {
    "prem": 1.0,
    "premier league": 1.0,
    "champions-league": 0.8,
    "europa-league": 0.8,
    "conference-league": 0.8,
    "efl-cup": 0.4,
    "fa-cup": 0.4,
    "league-cup": 0.4,
    "carabao-cup": 0.4,
    "friendly": 0.1,
}


@dataclass(frozen=True)
class SplitSummary:
    train_rows: int
    validation_rows: int
    validation_cutoff_utc: str
    latest_finished_kickoff_utc: str


@dataclass(frozen=True)
class TrainingSummary:
    model_path: str
    metrics_path: str
    prediction_feature_table_path: str
    training_feature_table_path: str
    target_distribution_train: dict[str, int]
    target_distribution_validation: dict[str, int]
    competition_distribution_train: dict[str, int]
    split: SplitSummary
    calibration_temperature: float
    calibration_rows: int
    calibration_cutoff_utc: str
    metrics: dict[str, float]
    feature_columns: list[str]


def normalize_tournament(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().casefold()


def is_premier_league_frame(frame: pd.DataFrame) -> pd.Series:
    tournament = frame.get("tournament")
    if tournament is None:
        tournament_match = pd.Series(False, index=frame.index)
    else:
        tournament_match = tournament.map(normalize_tournament).isin(PREMIER_LEAGUE_TOURNAMENTS)

    match_ids = frame.get("match_id")
    if match_ids is None:
        slug_match = pd.Series(False, index=frame.index)
    else:
        slug_match = match_ids.astype(str).str.contains("-prem-", na=False)

    return tournament_match | slug_match


def build_target(frame: pd.DataFrame) -> pd.Series:
    home_score = frame["home_score"]
    away_score = frame["away_score"]
    return np.select(
        [home_score > away_score, home_score == away_score, home_score < away_score],
        [0, 1, 2],
        default=-1,
    )


def multiclass_brier_score(y_true: np.ndarray, probabilities: np.ndarray, num_classes: int = 3) -> float:
    one_hot = np.eye(num_classes)[y_true]
    return float(np.mean(np.sum((probabilities - one_hot) ** 2, axis=1)))


def add_sorting_columns(frame: pd.DataFrame) -> pd.DataFrame:
    working = frame.copy()
    working["kickoff_time"] = pd.to_datetime(
        working["kickoff_time"],
        errors="coerce",
        utc=True,
        format="mixed",
    )
    working["source_gameweek"] = pd.to_numeric(working.get("source_gameweek"), errors="coerce")
    working["gameweek"] = pd.to_numeric(working.get("gameweek"), errors="coerce")
    working["_ordering_gameweek"] = working["source_gameweek"].fillna(working["gameweek"])
    return working


def add_derived_features(frame: pd.DataFrame) -> pd.DataFrame:
    working = frame.copy()
    working["elo_diff"] = working["home_current_elo"] - working["away_current_elo"]
    working["days_rest_diff"] = working["home_days_rest"] - working["away_days_rest"]
    working["last5_matches_diff"] = working["home_last5_matches"] - working["away_last5_matches"]
    working["last5_avg_xg_diff"] = working["home_last5_avg_xg"] - working["away_last5_avg_xg"]
    working["last5_avg_xga_diff"] = working["home_last5_avg_xga"] - working["away_last5_avg_xga"]
    working["last5_avg_shots_on_target_diff"] = (
        working["home_last5_avg_shots_on_target"] - working["away_last5_avg_shots_on_target"]
    )
    working["last5_avg_big_chances_diff"] = (
        working["home_last5_avg_big_chances"] - working["away_last5_avg_big_chances"]
    )
    working["last5_avg_tackles_won_diff"] = (
        working["home_last5_avg_tackles_won"] - working["away_last5_avg_tackles_won"]
    )
    working["last5_clean_sheet_rate_diff"] = (
        working["home_last5_clean_sheet_rate"] - working["away_last5_clean_sheet_rate"]
    )
    return working


def competition_sample_weight(frame: pd.DataFrame) -> pd.Series:
    return frame["competition_code"].map(COMPETITION_WEIGHTS).fillna(0.4)


def apply_temperature(probabilities: np.ndarray, temperature: float) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-9, 1.0)
    logits = np.log(clipped) / temperature
    logits = logits - logits.max(axis=1, keepdims=True)
    exponentiated = np.exp(logits)
    return exponentiated / exponentiated.sum(axis=1, keepdims=True)


def load_prediction_feature_frame(feature_table_path: Path) -> pd.DataFrame:
    features = pd.read_csv(feature_table_path)
    features = add_sorting_columns(features)
    return add_derived_features(features)


def build_training_feature_frame(matches_path: Path, training_feature_table_path: Path) -> pd.DataFrame:
    matches = pd.read_csv(matches_path)
    features = build_pre_match_feature_table(matches, competition_scope="all")
    features = add_sorting_columns(features)
    features = add_derived_features(features)
    training_feature_table_path.parent.mkdir(parents=True, exist_ok=True)
    features.to_csv(training_feature_table_path, index=False)
    return features


def load_training_frame(training_feature_table_path: Path) -> pd.DataFrame:
    features = pd.read_csv(training_feature_table_path)
    features = add_sorting_columns(features)
    features = add_derived_features(features)
    features["target"] = build_target(features)
    features = features.loc[features["target"] >= 0].copy()
    features["sample_weight"] = competition_sample_weight(features)
    return features.sort_values(
        ["kickoff_time", "source_season", "_ordering_gameweek", "match_id"],
        kind="stable",
        na_position="last",
    ).reset_index(drop=True)


def split_train_validation(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, SplitSummary]:
    premier_league_rows = frame.loc[is_premier_league_frame(frame)].copy()
    finished_2025 = premier_league_rows.loc[premier_league_rows["source_season"] == "2025-2026"].copy()
    if finished_2025.empty:
        raise ValueError("No finished 2025-2026 Premier League matches available for validation.")

    latest_finished_kickoff = finished_2025["kickoff_time"].dropna().max()
    if pd.isna(latest_finished_kickoff):
        latest_finished_kickoff = pd.NaT

    if pd.notna(latest_finished_kickoff):
        validation_cutoff = latest_finished_kickoff - timedelta(days=VALIDATION_WINDOW_DAYS)
        validation_mask = is_premier_league_frame(frame) & (
            (frame["source_season"] == "2025-2026")
            & frame["kickoff_time"].notna()
            & (frame["kickoff_time"] >= validation_cutoff)
        )
        validation_rows = frame.loc[validation_mask]
        validation_gw_floor = validation_rows["_ordering_gameweek"].min() if not validation_rows.empty else np.nan
        train_mask = (
            frame["kickoff_time"].notna() & (frame["kickoff_time"] < validation_cutoff)
        ) | (
            frame["kickoff_time"].isna() & (frame["_ordering_gameweek"] < validation_gw_floor)
        )
    else:
        validation_cutoff = pd.NaT
        latest_gw = finished_2025["_ordering_gameweek"].max()
        validation_gw_floor = latest_gw - 3
        validation_mask = is_premier_league_frame(frame) & (
            (frame["source_season"] == "2025-2026")
            & (frame["_ordering_gameweek"] >= validation_gw_floor)
        )
        train_mask = (
            (frame["source_season"] != "2025-2026")
            | (frame["_ordering_gameweek"] < validation_gw_floor)
        )

    if frame.loc[validation_mask].empty:
        latest_gw = finished_2025["_ordering_gameweek"].max()
        validation_gw_floor = latest_gw - 3
        validation_mask = is_premier_league_frame(frame) & (
            (frame["source_season"] == "2025-2026")
            & (frame["_ordering_gameweek"] >= validation_gw_floor)
        )
        train_mask = (
            (frame["source_season"] != "2025-2026")
            | (frame["_ordering_gameweek"] < validation_gw_floor)
        )
        validation_cutoff = pd.NaT

    validation = frame.loc[validation_mask].copy()
    train = frame.loc[train_mask].copy()

    if train.empty or validation.empty:
        raise ValueError("Chronological split produced an empty train or validation set.")

    split_summary = SplitSummary(
        train_rows=len(train),
        validation_rows=len(validation),
        validation_cutoff_utc=(
            validation_cutoff.isoformat() if pd.notna(validation_cutoff) else "gameweek_fallback"
        ),
        latest_finished_kickoff_utc=(
            latest_finished_kickoff.isoformat() if pd.notna(latest_finished_kickoff) else "unknown"
        ),
    )
    return train, validation, split_summary


def fit_model(train: pd.DataFrame) -> Any:
    try:
        from xgboost import XGBClassifier
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "xgboost is required for Phase 3 training. Install it before running the trainer.",
        ) from exc

    model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=400,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        min_child_weight=1.0,
        eval_metric="mlogloss",
        tree_method="hist",
        random_state=42,
    )
    model.fit(
        train.loc[:, FEATURE_COLUMNS],
        train["target"],
        sample_weight=train["sample_weight"],
    )
    return model


def select_calibration_rows(train: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    premier_league_rows = train.loc[is_premier_league_frame(train) & train["kickoff_time"].notna()].copy()
    if premier_league_rows.empty:
        return train, train.iloc[0:0].copy(), "disabled"

    latest_kickoff = premier_league_rows["kickoff_time"].max()
    calibration_cutoff = latest_kickoff - timedelta(days=CALIBRATION_WINDOW_DAYS)
    calibration_mask = is_premier_league_frame(train) & train["kickoff_time"].notna() & (
        train["kickoff_time"] >= calibration_cutoff
    )

    calibration = train.loc[calibration_mask].copy()
    fit_train = train.loc[~calibration_mask].copy()

    if calibration.empty or fit_train.empty:
        calibration_size = min(max(20, len(premier_league_rows) // 10), len(premier_league_rows) - 1)
        if calibration_size <= 0:
            return train, train.iloc[0:0].copy(), "disabled"
        calibration = premier_league_rows.sort_values("kickoff_time", kind="stable").tail(calibration_size).copy()
        fit_train = train.loc[~train["match_id"].isin(calibration["match_id"])].copy()
        calibration_cutoff = calibration["kickoff_time"].min()

    return fit_train, calibration, calibration_cutoff.isoformat()


def choose_temperature(train: pd.DataFrame) -> tuple[float, int, str]:
    fit_train, calibration, calibration_cutoff = select_calibration_rows(train)
    if calibration.empty:
        return 1.0, 0, calibration_cutoff

    model = fit_model(fit_train)
    calibration_probabilities = model.predict_proba(calibration.loc[:, FEATURE_COLUMNS])

    best_temperature = 1.0
    best_score = float("inf")
    for temperature in TEMPERATURE_GRID:
        scaled_probabilities = apply_temperature(calibration_probabilities, float(temperature))
        score = log_loss(calibration["target"], scaled_probabilities, labels=[0, 1, 2])
        if score < best_score:
            best_temperature = float(temperature)
            best_score = float(score)

    return best_temperature, len(calibration), calibration_cutoff


def summarize_targets(frame: pd.DataFrame) -> dict[str, int]:
    counts = frame["target"].value_counts().sort_index()
    return {str(int(index)): int(value) for index, value in counts.items()}


def summarize_competitions(frame: pd.DataFrame) -> dict[str, int]:
    counts = frame["competition_code"].value_counts()
    return {str(index): int(value) for index, value in counts.items()}


def train_and_save_model(
    prediction_feature_table_path: Path,
    training_feature_table_path: Path,
    matches_path: Path,
    model_path: Path,
    metrics_path: Path,
) -> TrainingSummary:
    load_prediction_feature_frame(prediction_feature_table_path)
    build_training_feature_frame(matches_path, training_feature_table_path)
    frame = load_training_frame(training_feature_table_path)
    train, validation, split_summary = split_train_validation(frame)
    calibration_temperature, calibration_rows, calibration_cutoff = choose_temperature(train)

    model = fit_model(train)
    probabilities = model.predict_proba(validation.loc[:, FEATURE_COLUMNS])
    probabilities = apply_temperature(probabilities, calibration_temperature)
    predictions = probabilities.argmax(axis=1)

    metrics = {
        "accuracy": float(accuracy_score(validation["target"], predictions)),
        "multiclass_log_loss": float(log_loss(validation["target"], probabilities, labels=[0, 1, 2])),
        "multiclass_brier_score": multiclass_brier_score(validation["target"].to_numpy(), probabilities),
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(model_path)

    summary = TrainingSummary(
        model_path=str(model_path),
        metrics_path=str(metrics_path),
        prediction_feature_table_path=str(prediction_feature_table_path),
        training_feature_table_path=str(training_feature_table_path),
        target_distribution_train=summarize_targets(train),
        target_distribution_validation=summarize_targets(validation),
        competition_distribution_train=summarize_competitions(train),
        split=split_summary,
        calibration_temperature=calibration_temperature,
        calibration_rows=calibration_rows,
        calibration_cutoff_utc=calibration_cutoff,
        metrics=metrics,
        feature_columns=list(FEATURE_COLUMNS),
    )
    metrics_path.write_text(json.dumps(asdict(summary), indent=2), encoding="utf-8")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train an XGBoost Premier League result model with a chronological validation split.",
    )
    parser.add_argument(
        "--feature-table-path",
        default="data/features/match_pre_match_features.csv",
        help="Premier League Phase 2 feature table path used for prediction-facing features.",
    )
    parser.add_argument(
        "--training-feature-table-path",
        default="data/features/all_match_pre_match_features.csv",
        help="All-competition feature table path used for weighted model training.",
    )
    parser.add_argument(
        "--matches-path",
        default="data/matches.csv",
        help="Canonical matches dataset used to build all-competition training rows.",
    )
    parser.add_argument(
        "--model-path",
        default="data/models/model_v2.json",
        help="Output path for the trained XGBoost model.",
    )
    parser.add_argument(
        "--metrics-path",
        default="data/models/model_v2_metrics.json",
        help="Output path for training and validation summary metrics.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = train_and_save_model(
        prediction_feature_table_path=Path(args.feature_table_path),
        training_feature_table_path=Path(args.training_feature_table_path),
        matches_path=Path(args.matches_path),
        model_path=Path(args.model_path),
        metrics_path=Path(args.metrics_path),
    )
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":
    main()
