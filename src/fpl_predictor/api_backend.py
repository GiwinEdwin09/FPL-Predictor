from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fpl_predictor.live_inference import InferencePaths, LiveInferenceService


def env_path(name: str, default: str) -> Path:
    return Path(os.getenv(name, default))


def allowed_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def require_admin_token(admin_token: str | None, provided_token: str | None) -> None:
    if not admin_token:
        return
    if provided_token == admin_token:
        return
    raise HTTPException(status_code=401, detail="Invalid admin token.")


def dashboard_cache_path() -> Path:
    return env_path("DASHBOARD_CACHE_PATH", "apps/web/public/data/dashboard.json")


def load_cached_dashboard(cache_path: Path) -> dict[str, Any]:
    if not cache_path.exists():
        raise FileNotFoundError(f"Dashboard cache not found at {cache_path}.")
    return json.loads(cache_path.read_text(encoding="utf-8"))


def inference_paths() -> InferencePaths:
    data_dir = env_path("DATA_DIR", "data")
    return InferencePaths(
        data_dir=env_path("DATA_DIR", "data"),
        matches_path=env_path("MATCHES_PATH", "data/matches.csv"),
        players_path=env_path("PLAYERS_PATH", "data/players.csv"),
        playerstats_path=env_path("PLAYERSTATS_PATH", "data/playerstats.csv"),
        playermatchstats_path=env_path("PLAYERMATCHSTATS_PATH", "data/playermatchstats.csv"),
        model_path=env_path("MODEL_PATH", "data/models/model_v2.json"),
        metrics_path=env_path("METRICS_PATH", "data/models/model_v2_metrics.json"),
    )


_service: LiveInferenceService | None = None


def get_inference_service() -> LiveInferenceService:
    global _service
    if _service is None:
        _service = LiveInferenceService(inference_paths())
    return _service


def generate_dashboard(cache_path: Path) -> dict[str, Any]:
    payload = get_inference_service().dashboard_payload(refresh=True)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


class SimulationRequest(BaseModel):
    match_id: str = Field(alias="matchId")
    home_player_ids: list[int] | None = Field(default=None, alias="homePlayerIds")
    away_player_ids: list[int] | None = Field(default=None, alias="awayPlayerIds")

    model_config = {"populate_by_name": True}


def create_app() -> FastAPI:
    app = FastAPI(
        title="Premier League Predictor API",
        version="0.1.0",
        description="FastAPI backend for Premier League predictions and historical match data.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/dashboard")
    def dashboard(refresh: bool = Query(default=False)) -> dict[str, Any]:
        if refresh:
            return generate_dashboard(dashboard_cache_path())
        return get_inference_service().dashboard_payload()

    @app.get("/api/predictions/upcoming")
    def upcoming_predictions(
        season: str | None = Query(default=None),
        gameweek: int | None = Query(default=None),
        refresh: bool = Query(default=False),
    ) -> dict[str, Any]:
        payload = dashboard(refresh=refresh)
        fixtures = payload["currentGameweekFixtures"] + payload["upcomingFixtures"]
        if season is not None:
            fixtures = [fixture for fixture in fixtures if fixture["season"] == season]
        if gameweek is not None:
            fixtures = [fixture for fixture in fixtures if fixture["gameweek"] == gameweek]
        return {
            "generatedAtUtc": payload["generatedAtUtc"],
            "currentSeason": payload["currentSeason"],
            "count": len(fixtures),
            "fixtures": fixtures,
        }

    @app.get("/api/history")
    def history(
        season: str | None = Query(default=None),
        gameweek: int | None = Query(default=None),
        limit: int | None = Query(default=None, ge=1),
        refresh: bool = Query(default=False),
    ) -> dict[str, Any]:
        payload = dashboard(refresh=refresh)
        matches = payload["historicalMatches"]
        if season is not None:
            matches = [match for match in matches if match["season"] == season]
        if gameweek is not None:
            matches = [match for match in matches if match["gameweek"] == gameweek]
        if limit is not None:
            matches = matches[:limit]
        return {
            "generatedAtUtc": payload["generatedAtUtc"],
            "count": len(matches),
            "matches": matches,
        }

    @app.get("/api/v1/fixtures/{match_id}/lineup-context")
    def lineup_context(match_id: str, refresh: bool = Query(default=False)) -> dict[str, Any]:
        try:
            return get_inference_service().fixture_lineup_context(match_id, refresh=refresh)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/v1/predict/simulate")
    def simulate_prediction(request: SimulationRequest, refresh: bool = Query(default=False)) -> dict[str, Any]:
        try:
            return get_inference_service().simulate_fixture(
                request.match_id,
                home_player_ids=request.home_player_ids,
                away_player_ids=request.away_player_ids,
                refresh=refresh,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/admin/refresh")
    def refresh_dashboard(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
        require_admin_token(os.getenv("ADMIN_TOKEN"), x_admin_token)
        payload = generate_dashboard(dashboard_cache_path())
        return {
            "status": "refreshed",
            "generatedAtUtc": payload["generatedAtUtc"],
            "upcomingCount": len(payload["upcomingFixtures"]),
            "historyCount": len(payload["historicalMatches"]),
        }

    return app


app = create_app()
