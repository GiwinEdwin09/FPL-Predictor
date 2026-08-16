from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from fpl_predictor.predictors import sklearn_probabilities


def permutation_importance(
    model: object,
    frame: pd.DataFrame,
    feature_columns: list[str] | tuple[str, ...],
    *,
    repeats: int = 3,
    seed: int = 42,
) -> pd.DataFrame:
    baseline = sklearn_probabilities(model, frame, feature_columns)
    baseline_score = float(log_loss(frame["target"], baseline, labels=[0, 1, 2]))
    rng = np.random.default_rng(seed)
    rows: list[dict[str, float | str]] = []
    for column in feature_columns:
        deltas: list[float] = []
        for _ in range(repeats):
            shuffled = frame.copy()
            shuffled[column] = rng.permutation(shuffled[column].to_numpy())
            score = float(log_loss(frame["target"], sklearn_probabilities(model, shuffled, feature_columns), labels=[0, 1, 2]))
            deltas.append(score - baseline_score)
        rows.append(
            {
                "feature": column,
                "baseline_log_loss": baseline_score,
                "mean_log_loss_increase": float(np.mean(deltas)),
                "std_log_loss_increase": float(np.std(deltas)),
            }
        )
    return pd.DataFrame(rows).sort_values("mean_log_loss_increase", ascending=False).reset_index(drop=True)
