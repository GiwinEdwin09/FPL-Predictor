from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from fpl_predictor.live_inference import InferencePaths, LiveInferenceService, _is_available, _position_bucket
from fpl_predictor.predictors import predict_match_probabilities
from fpl_predictor.prediction_ledger import load_ledger, save_ledger, upsert_prediction
from fpl_predictor.web_dashboard import build_dashboard_payload, serialize_probabilities


class _FakeBlendPredictor:
    feature_columns = ["home_current_elo"]
    temperature = 1.0
    tree_model = object()
    dixon_coles = SimpleNamespace(teams=["arsenal", "chelsea"])

    def predict_proba(self, frame: pd.DataFrame) -> np.ndarray:
        home_probability = frame["home_current_elo"].to_numpy(dtype=float) / 3_000.0
        draw_probability = np.full(len(frame), 0.25)
        away_probability = 1.0 - home_probability - draw_probability
        return np.column_stack([home_probability, draw_probability, away_probability])


def _write_runtime_csvs(tmp_path: Path) -> InferencePaths:
    raw_dir = tmp_path / "raw" / "2025-2026"
    raw_dir.mkdir(parents=True)
    pd.DataFrame(
        [
            {"code": 1, "name": "Arsenal", "short_name": "ARS"},
            {"code": 2, "name": "Chelsea", "short_name": "CHE"},
        ]
    ).to_csv(raw_dir / "teams.csv", index=False)
    pd.DataFrame(
        [
            {
                "match_id": "fixture-1",
                "source_season": "2025-2026",
                "kickoff_time": "2099-08-01T15:00:00Z",
                "source_gameweek": 1,
                "gameweek": 1,
                "home_team": 1,
                "away_team": 2,
                "home_score": np.nan,
                "away_score": np.nan,
                "finished": False,
                "tournament": "prem",
            }
        ]
    ).to_csv(tmp_path / "matches.csv", index=False)
    pd.DataFrame(
        columns=["player_id", "team_code", "web_name", "position", "source_season"]
    ).to_csv(tmp_path / "players.csv", index=False)
    pd.DataFrame(columns=["id", "source_gameweek", "form"]).to_csv(
        tmp_path / "playerstats.csv", index=False
    )
    pd.DataFrame(columns=["player_id", "match_id", "source_season", "source_gameweek"]).to_csv(
        tmp_path / "playermatchstats.csv", index=False
    )
    pd.DataFrame(
        [
            {
                "match_id": "fixture-1",
                "source_season": "2025-2026",
                "source_gameweek": 1,
                "gameweek": 1,
                "kickoff_time": "2099-08-01T15:00:00Z",
                "finished": False,
                "tournament": "prem",
                "home_team": 1,
                "away_team": 2,
                "home_score": np.nan,
                "away_score": np.nan,
                "home_team_key": "arsenal",
                "away_team_key": "chelsea",
                "home_current_elo": 1_650.0,
                "away_current_elo": 1_500.0,
                "home_days_rest": 7.0,
                "away_days_rest": 7.0,
                "home_last5_matches": 5,
                "away_last5_matches": 5,
                "home_last5_avg_xg": 1.5,
                "away_last5_avg_xg": 1.2,
                "home_last5_avg_xga": 1.0,
                "away_last5_avg_xga": 1.1,
                "home_last5_avg_shots_on_target": 5.0,
                "away_last5_avg_shots_on_target": 4.0,
                "home_last5_avg_big_chances": 2.0,
                "away_last5_avg_big_chances": 1.5,
                "home_last5_avg_tackles_won": 8.0,
                "away_last5_avg_tackles_won": 8.0,
                "home_last5_clean_sheet_rate": 0.4,
                "away_last5_clean_sheet_rate": 0.2,
            }
        ]
    ).to_csv(tmp_path / "prediction_features.csv", index=False)
    (tmp_path / "model.json").write_text("{}", encoding="utf-8")
    (tmp_path / "metrics.json").write_text(
        '{"calibration_temperature": 1.0, "metrics": {}, "split": {}}',
        encoding="utf-8",
    )
    return InferencePaths(
        data_dir=tmp_path,
        matches_path=tmp_path / "matches.csv",
        players_path=tmp_path / "players.csv",
        playerstats_path=tmp_path / "playerstats.csv",
        playermatchstats_path=tmp_path / "playermatchstats.csv",
        model_path=tmp_path / "model.json",
        metrics_path=tmp_path / "metrics.json",
        prediction_feature_table_path=tmp_path / "prediction_features.csv",
    )


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


def test_api_inference_service_matches_offline_exported_feature_prediction(tmp_path: Path, monkeypatch) -> None:
    paths = _write_runtime_csvs(tmp_path)
    model = _FakeBlendPredictor()
    monkeypatch.setattr("fpl_predictor.live_inference.load_model", lambda _: model)
    service = LiveInferenceService(paths)

    state, _, api_fixture = service._baseline_fixture("fixture-1")
    exported_row = pd.read_csv(paths.prediction_feature_table_path)
    offline = predict_match_probabilities(
        model,
        exported_row,
        feature_columns=model.feature_columns,
        temperature=1.0,
    )

    assert state.features.loc[0, "home_current_elo"] == 1_650.0
    assert api_fixture["probabilities"] == serialize_probabilities(offline[0])


def test_v3_rejects_numeric_team_keys_before_prediction(tmp_path: Path, monkeypatch) -> None:
    paths = _write_runtime_csvs(tmp_path)
    features = pd.read_csv(paths.prediction_feature_table_path)
    features["home_team_key"] = 1
    features["away_team_key"] = 2
    features.to_csv(paths.prediction_feature_table_path, index=False)
    monkeypatch.setattr("fpl_predictor.live_inference.load_model", lambda _: _FakeBlendPredictor())

    service = LiveInferenceService(paths)

    with pytest.raises(ValueError, match="numeric FPL IDs"):
        service.state()


def test_live_inference_rejects_bundle_missing_an_upcoming_fixture(tmp_path: Path, monkeypatch) -> None:
    paths = _write_runtime_csvs(tmp_path)
    features = pd.read_csv(paths.prediction_feature_table_path)
    features["match_id"] = "different-fixture"
    features.to_csv(paths.prediction_feature_table_path, index=False)
    monkeypatch.setattr("fpl_predictor.live_inference.load_model", lambda _: _FakeBlendPredictor())

    service = LiveInferenceService(paths)

    with pytest.raises(ValueError, match="bundle is stale"):
        service.state()


@pytest.mark.parametrize("bundle_version", [None, "v3"])
def test_live_and_exported_dashboards_preserve_locked_forecasts(tmp_path: Path, monkeypatch, bundle_version) -> None:
    paths = replace(_write_runtime_csvs(tmp_path), ledger_path=tmp_path / "ledger.json")
    model = _FakeBlendPredictor()
    monkeypatch.setattr("fpl_predictor.live_inference.load_model", lambda _: model)
    monkeypatch.setattr("fpl_predictor.web_dashboard.load_model", lambda _: model)
    monkeypatch.setattr("fpl_predictor.web_dashboard.seed_walk_forward_predictions", lambda *_, **__: 0)
    entries = {}
    upsert_prediction(
        entries,
        match_id="fixture-1",
        probabilities=np.array([0.42, 0.28, 0.30]),
        model_version="original-model",
        finished=True,
    )
    save_ledger(paths.ledger_path, entries)

    service = LiveInferenceService(paths)
    if bundle_version:
        service.state().bundle_metadata = {"model_version": bundle_version, "schema_version": 1}
    live = service.dashboard_payload()
    exported = build_dashboard_payload(
        paths.data_dir,
        paths.prediction_feature_table_path,
        paths.matches_path,
        paths.model_path,
        paths.metrics_path,
        ledger_path=paths.ledger_path,
    )

    assert live["model"]["version"] == (bundle_version or "model")
    assert live["model"].pop("bundleSchemaVersion") == (1 if bundle_version else None)
    live["model"]["version"] = exported["model"]["version"]
    live.pop("generatedAtUtc")
    exported.pop("generatedAtUtc")
    assert live == exported
    fixture = live["upcomingFixtures"][0]
    assert fixture["probabilities"] == {"homeWin": 0.42, "draw": 0.28, "awayWin": 0.30}
    assert load_ledger(paths.ledger_path)["fixture-1"].model_version == "original-model"


def test_lineup_simulation_adjusts_only_the_changed_team(tmp_path: Path, monkeypatch) -> None:
    paths = _write_runtime_csvs(tmp_path)
    monkeypatch.setattr("fpl_predictor.live_inference.load_model", lambda _: _FakeBlendPredictor())
    service = LiveInferenceService(paths)
    original = service.state().features.copy(deep=True)
    monkeypatch.setattr(
        service,
        "projected_lineup",
        lambda team_id, **_: {"lineup": [{"playerId": team_id}], "roster": []},
    )

    def lineup_metrics(_state, player_ids, **_):
        strength = 2.0 if player_ids == [99] else 1.0
        return dict.fromkeys(
            ["attack_strength", "finishing_strength", "creation_strength", "touch_strength",
             "tackle_strength", "defensive_strength"],
            strength,
        )

    monkeypatch.setattr(service, "_lineup_metrics", lineup_metrics)
    result = service.simulate_fixture("fixture-1", home_player_ids=[99])

    assert result["simulatedMatch"]["context"]["homeLast5Xg"] == 2.03
    assert result["simulatedMatch"]["context"]["homeLast5Xga"] == 0.74
    assert result["simulatedMatch"]["context"]["awayLast5Xg"] == 1.2
    assert result["simulatedMatch"]["context"]["awayLast5Xga"] == 1.1
    assert result["adjustments"] == {
        "homeAttackRatio": 2.0, "awayAttackRatio": 1.0,
        "homeDefenceRatio": 2.0, "awayDefenceRatio": 1.0,
    }
    assert result["home"]["selectedPlayerIds"] == [99]
    assert result["away"]["selectedPlayerIds"] == [2]
    pd.testing.assert_frame_equal(service.state().features, original)
