import pandas as pd

from fpl_predictor.live_inference import LiveInferenceService, _is_available, _position_bucket


def test_position_bucket_normalizes_common_positions() -> None:
    assert _position_bucket("Goalkeeper") == "goalkeeper"
    assert _position_bucket("Defender") == "defender"
    assert _position_bucket("Midfielder") == "midfielder"
    assert _position_bucket("Forward") == "forward"
    assert _position_bucket("Unknown") == "unknown"


def test_is_available_uses_status_and_playing_chance() -> None:
    assert _is_available("a", 100) is True
    assert _is_available("i", 100) is False
    assert _is_available("a", 0) is False


def test_select_lineup_prefers_balanced_xi() -> None:
    service = LiveInferenceService.__new__(LiveInferenceService)
    candidates = pd.DataFrame(
        [
            {"player_id": 1, "position_bucket": "goalkeeper", "lineup_score": 90},
            {"player_id": 2, "position_bucket": "defender", "lineup_score": 99},
            {"player_id": 3, "position_bucket": "defender", "lineup_score": 98},
            {"player_id": 4, "position_bucket": "defender", "lineup_score": 97},
            {"player_id": 5, "position_bucket": "defender", "lineup_score": 96},
            {"player_id": 6, "position_bucket": "midfielder", "lineup_score": 95},
            {"player_id": 7, "position_bucket": "midfielder", "lineup_score": 94},
            {"player_id": 8, "position_bucket": "midfielder", "lineup_score": 93},
            {"player_id": 9, "position_bucket": "midfielder", "lineup_score": 92},
            {"player_id": 10, "position_bucket": "forward", "lineup_score": 91},
            {"player_id": 11, "position_bucket": "forward", "lineup_score": 90},
            {"player_id": 12, "position_bucket": "forward", "lineup_score": 89},
        ]
    )

    selected = service._select_lineup(candidates)

    assert len(selected) == 11
    assert 1 in selected
    assert len({2, 3, 4}.intersection(selected)) == 3
    assert len({6, 7}.intersection(selected)) == 2
    assert 10 in selected


def test_scaled_feature_clips_extreme_ratios() -> None:
    service = LiveInferenceService.__new__(LiveInferenceService)

    lower_clipped = service._scaled_feature(10.0, baseline_strength=10.0, simulated_strength=1.0)
    upper_clipped = service._scaled_feature(10.0, baseline_strength=10.0, simulated_strength=100.0)
    inverse_scaled = service._scaled_feature(10.0, baseline_strength=10.0, simulated_strength=20.0, inverse=True)

    assert lower_clipped == 6.5
    assert upper_clipped == 13.5
    assert round(inverse_scaled, 4) == round(10.0 / 1.35, 4)
