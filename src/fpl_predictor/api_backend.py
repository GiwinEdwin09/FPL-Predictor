from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from fpl_predictor.web_dashboard import build_dashboard_payload


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


def generate_dashboard(cache_path: Path) -> dict[str, Any]:
    payload = build_dashboard_payload(
        data_dir=env_path("DATA_DIR", "data"),
        feature_table_path=env_path("FEATURE_TABLE_PATH", "data/features/match_pre_match_features.csv"),
        matches_path=env_path("MATCHES_PATH", "data/matches.csv"),
        model_path=env_path("MODEL_PATH", "data/models/model_v2.json"),
        metrics_path=env_path("METRICS_PATH", "data/models/model_v2_metrics.json"),
    )
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


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
        cache_path = dashboard_cache_path()
        if refresh:
            return generate_dashboard(cache_path)
        try:
            return load_cached_dashboard(cache_path)
        except FileNotFoundError:
            return generate_dashboard(cache_path)

    @app.get("/api/predictions/upcoming")
    def upcoming_predictions(
        season: str | None = Query(default=None),
        gameweek: int | None = Query(default=None),
        refresh: bool = Query(default=False),
    ) -> dict[str, Any]:
        payload = dashboard(refresh=refresh)
        fixtures = payload["upcomingFixtures"]
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

