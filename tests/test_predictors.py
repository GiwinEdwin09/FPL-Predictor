import numpy as np
import pandas as pd

from fpl_predictor.feature_selection import permutation_importance
from fpl_predictor.predictors import choose_blend_and_temperature, fit_multinomial_logistic


def test_choose_blend_and_temperature_recovers_the_better_model() -> None:
    targets = np.array([0, 0, 2, 2, 1])
    good = np.array(
        [
            [0.8, 0.1, 0.1],
            [0.7, 0.2, 0.1],
            [0.1, 0.2, 0.7],
            [0.05, 0.15, 0.8],
            [0.2, 0.6, 0.2],
        ]
    )
    bad = np.full((5, 3), 1 / 3)

    weight, temperature, score = choose_blend_and_temperature(good, bad, targets)

    assert weight >= 0.8
    assert temperature >= 1.0
    assert np.isfinite(score)


def test_permutation_importance_ranks_the_informative_feature() -> None:
    frame = pd.DataFrame(
        {
            "signal": [3.0, 3.0, 0.0, 0.0, 1.5, 1.5],
            "noise": [0.1, 0.8, 0.2, 0.9, 0.4, 0.3],
            "target": [0, 0, 2, 2, 1, 1],
        }
    )
    model = fit_multinomial_logistic(frame, ["signal", "noise"])
    importance = permutation_importance(model, frame, ["signal", "noise"], repeats=2, seed=0)

    ranked = importance.set_index("feature")["mean_log_loss_increase"]
    assert ranked["signal"] > ranked["noise"]
