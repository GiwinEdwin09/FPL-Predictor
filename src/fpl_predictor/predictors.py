from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from fpl_predictor.dixon_coles import (
    DixonColesParameters,
    parameters_from_dict,
    predict_dixon_coles,
)

NUM_OUTCOMES = 3
PROBABILITY_EPSILON = 1e-12
DEFAULT_BLEND_GRID = tuple(round(value, 2) for value in np.linspace(0.0, 1.0, 11))
DEFAULT_HALF_LIFE_DAYS = 550.0


class OutcomePredictor(Protocol):
    def predict_proba(self, frame: pd.DataFrame) -> np.ndarray:
        ...


def normalize_probabilities(probabilities: np.ndarray) -> np.ndarray:
    values = np.asarray(probabilities, dtype=float)
    if values.ndim != 2 or values.shape[1] != NUM_OUTCOMES:
        raise ValueError("Probabilities must have shape (rows, 3).")
    values = np.clip(values, PROBABILITY_EPSILON, 1.0)
    return values / values.sum(axis=1, keepdims=True)


def apply_temperature(probabilities: np.ndarray, temperature: float) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-9, 1.0)
    logits = np.log(clipped) / temperature
    logits = logits - logits.max(axis=1, keepdims=True)
    exponentiated = np.exp(logits)
    return exponentiated / exponentiated.sum(axis=1, keepdims=True)


def recency_sample_weights(
    kickoffs: pd.Series,
    base_weights: pd.Series | np.ndarray | None = None,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> np.ndarray:
    timestamps = pd.to_datetime(kickoffs, errors="coerce", utc=True, format="mixed")
    latest = timestamps.max()
    days_ago = (latest - timestamps).dt.total_seconds().to_numpy() / 86_400
    days_ago = np.where(np.isfinite(days_ago), days_ago, 2.0 * half_life_days)
    recency = np.exp(-np.log(2.0) * days_ago / max(half_life_days, 1e-6))
    if base_weights is None:
        return recency
    return recency * np.asarray(base_weights, dtype=float)


def _feature_matrix(frame: pd.DataFrame, feature_columns: tuple[str, ...] | list[str]) -> pd.DataFrame:
    missing = [column for column in feature_columns if column not in frame.columns]
    working = frame.copy()
    for column in missing:
        working[column] = np.nan
    return working.loc[:, list(feature_columns)]


def fit_regularized_xgboost(
    train: pd.DataFrame,
    feature_columns: tuple[str, ...] | list[str],
    *,
    sample_weight: np.ndarray | None = None,
) -> Any:
    try:
        from xgboost import XGBClassifier
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError("xgboost is required for the regularized candidate model.") from exc

    model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=250,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=5.0,
        min_child_weight=10.0,
        eval_metric="mlogloss",
        tree_method="hist",
        random_state=42,
    )
    model.fit(
        _feature_matrix(train, feature_columns),
        train["target"],
        sample_weight=sample_weight,
    )
    return model


def fit_multinomial_logistic(
    train: pd.DataFrame,
    feature_columns: tuple[str, ...] | list[str],
    *,
    sample_weight: np.ndarray | None = None,
) -> Pipeline:
    model = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    C=0.5,
                    max_iter=1_000,
                    solver="lbfgs",
                    random_state=42,
                ),
            ),
        ]
    )
    model.fit(
        _feature_matrix(train, feature_columns),
        train["target"].to_numpy(dtype=int),
        classifier__sample_weight=sample_weight,
    )
    return model


def sklearn_probabilities(model: Any, frame: pd.DataFrame, feature_columns: tuple[str, ...] | list[str]) -> np.ndarray:
    raw = model.predict_proba(_feature_matrix(frame, feature_columns))
    aligned = np.zeros((len(frame), NUM_OUTCOMES), dtype=float)
    classes = getattr(model, "classes_", None)
    if classes is None and hasattr(model, "named_steps"):
        classes = model.named_steps["classifier"].classes_
    if classes is None:
        return normalize_probabilities(raw)
    for raw_index, outcome_class in enumerate(classes):
        aligned[:, int(outcome_class)] = raw[:, raw_index]
    return normalize_probabilities(aligned)


def choose_blend_and_temperature(
    model_a: np.ndarray,
    model_b: np.ndarray,
    targets: np.ndarray,
    *,
    blend_grid: tuple[float, ...] = DEFAULT_BLEND_GRID,
    temperature_grid: np.ndarray | None = None,
) -> tuple[float, float, float]:
    from sklearn.metrics import log_loss

    if temperature_grid is None:
        temperature_grid = np.linspace(1.0, 5.0, 17)
    best = (0.5, 1.0, float("inf"))
    for weight in blend_grid:
        blended = normalize_probabilities(weight * model_a + (1.0 - weight) * model_b)
        for temperature in temperature_grid:
            scaled = apply_temperature(blended, float(temperature))
            score = float(log_loss(targets, scaled, labels=[0, 1, 2]))
            if score < best[2]:
                best = (float(weight), float(temperature), score)
    return best


@dataclass
class BlendPredictor:
    dixon_coles: DixonColesParameters
    tree_model: Any
    feature_columns: list[str]
    dixon_coles_weight: float
    temperature: float = 1.0
    home_key_column: str = "home_team_key"
    away_key_column: str = "away_team_key"

    def predict_proba(self, frame: pd.DataFrame) -> np.ndarray:
        home_keys = frame[self.home_key_column] if self.home_key_column in frame.columns else frame["home_team"]
        away_keys = frame[self.away_key_column] if self.away_key_column in frame.columns else frame["away_team"]
        dixon = predict_dixon_coles(self.dixon_coles, home_keys, away_keys)
        trees = sklearn_probabilities(self.tree_model, frame, self.feature_columns)
        blended = normalize_probabilities(self.dixon_coles_weight * dixon + (1.0 - self.dixon_coles_weight) * trees)
        if self.temperature == 1.0:
            return blended
        return apply_temperature(blended, self.temperature)

    def save(self, model_path: Path, booster_path: Path | None = None) -> None:
        model_path.parent.mkdir(parents=True, exist_ok=True)
        booster_path = booster_path or model_path.with_name(model_path.stem + "_xgboost.json")
        if hasattr(self.tree_model, "save_model"):
            self.tree_model.save_model(booster_path)
            tree_kind = "xgboost"
        else:
            raise ValueError("BlendPredictor currently persists XGBoost tree models only.")
        payload = {
            "predictor_type": "blend_v3",
            "dixon_coles": asdict(self.dixon_coles),
            "dixon_coles_weight": self.dixon_coles_weight,
            "temperature": self.temperature,
            "feature_columns": self.feature_columns,
            "home_key_column": self.home_key_column,
            "away_key_column": self.away_key_column,
            "tree_model_kind": tree_kind,
            "tree_model_path": str(booster_path),
        }
        model_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, model_path: Path) -> "BlendPredictor":
        payload = json.loads(model_path.read_text(encoding="utf-8"))
        booster_path = Path(payload["tree_model_path"])
        if not booster_path.is_absolute():
            booster_path = model_path.parent / booster_path.name
        try:
            from xgboost import XGBClassifier
        except ModuleNotFoundError as exc:
            raise ModuleNotFoundError("xgboost is required to load model_v3.") from exc
        tree_model = XGBClassifier()
        tree_model.load_model(booster_path)
        return cls(
            dixon_coles=parameters_from_dict(payload["dixon_coles"]),
            tree_model=tree_model,
            feature_columns=list(payload["feature_columns"]),
            dixon_coles_weight=float(payload["dixon_coles_weight"]),
            temperature=float(payload.get("temperature", 1.0)),
            home_key_column=str(payload.get("home_key_column", "home_team_key")),
            away_key_column=str(payload.get("away_key_column", "away_team_key")),
        )


def feature_columns_for_model(model: Any, fallback: list[str] | tuple[str, ...] | None = None) -> list[str]:
    columns = getattr(model, "feature_columns", None)
    if columns:
        return list(columns)
    if fallback:
        return list(fallback)
    raise ValueError("Model does not expose feature_columns.")


def predict_match_probabilities(
    model: Any,
    frame: pd.DataFrame,
    *,
    feature_columns: list[str] | tuple[str, ...] | None = None,
    temperature: float = 1.0,
) -> np.ndarray:
    columns = list(feature_columns or getattr(model, "feature_columns", ()))
    if not columns:
        raise ValueError("feature_columns are required for this predictor.")
    if hasattr(model, "dixon_coles") and hasattr(model, "tree_model"):
        probabilities = model.predict_proba(frame)
        if getattr(model, "temperature", 1.0) != 1.0:
            return probabilities
        return apply_temperature(probabilities, temperature)
    probabilities = sklearn_probabilities(model, frame, columns)
    return apply_temperature(probabilities, temperature)
