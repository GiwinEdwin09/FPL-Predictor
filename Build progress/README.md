# Build Progress

## Overview

This document tracks the technical build progress for the Premier League Predictor project: data ingestion, feature engineering, model training, frontend delivery, backend API work, and deployment notes.

The product-facing overview now lives in the root [README.md](../README.md).

## Phase 1: Automated Data Ingestion

This repo includes a sync script that:

- syncs `teams`, `players`, `matches`, `playerstats`, and `playermatchstats`
- pulls CSVs directly from GitHub raw URLs with `pandas`
- stores local season copies under `data/raw/{season}/`
- rebuilds season files from top-level gameweek snapshots when the upstream repo does not expose a single cumulative CSV
- only overwrites a local season file when the upstream data has more rows or the content hash changes
- keeps `teams.csv` season-specific and writes canonical merged outputs for `players.csv`, `matches.csv`, `playerstats.csv`, and `playermatchstats.csv`
- records sync metadata in `data/sync_state.json`

### Project structure

```text
data/
  raw/
    2024-2025/
      teams.csv
      players.csv
      matches.csv
      playerstats.csv
      playermatchstats.csv
    2025-2026/
      teams.csv
      players.csv
      matches.csv
      playerstats.csv
      playermatchstats.csv
  players.csv
  matches.csv
  playerstats.csv
  playermatchstats.csv
  sync_state.json
scripts/
  sync_matches.py
src/
  fpl_predictor/data_ingestion.py
```

### Install

```bash
python3 -m pip install -e .
```

### Run the sync

```bash
python3 scripts/sync_matches.py
```

Use `--force` to overwrite local files even if the row count has not grown:

```bash
python3 scripts/sync_matches.py --force
```

To sync a subset of datasets:

```bash
python3 scripts/sync_matches.py --datasets teams players matches
```

### How 2025/2026 is handled

- `teams.csv`: use the season-level file and keep it only at `data/raw/2025-2026/teams.csv`
- `players.csv`: use the season-level `data/2025-2026/players.csv`
- `matches.csv`: concatenate `data/2025-2026/By Gameweek/GW*/matches.csv`
- `playerstats.csv`: concatenate `data/2025-2026/By Gameweek/GW*/playerstats.csv`
- `playermatchstats.csv`: concatenate `data/2025-2026/By Gameweek/GW*/playermatchstats.csv`

For gameweek-built datasets, the pipeline stamps a `source_gameweek` column when the upstream CSV does not already include one. `playermatchstats` should still be joined back to `matches` through `match_id` when you need the authoritative fixture gameweek.

## Phase 2: Pre-match Feature Factory

Build the pre-match feature table:

```bash
PYTHONPATH=src python3 scripts/build_phase2_features.py
```

This writes:

```text
data/features/match_pre_match_features.csv
```

Current Phase 2 behavior:

- uses `kickoff_time` to order matches chronologically
- falls back to `source_gameweek` / `gameweek` when kickoff is missing
- avoids leaking same-batch results into the snapshot
- keeps Premier League fixtures in the prediction-facing table
- allows other competitions to influence each team's rolling history

Rolling features currently include:

- xG
- xGA
- shots on target
- big chances
- tackles won
- clean sheet rate
- days of rest
- current Elo from the match row

If all-competition rows are needed for model training:

```bash
PYTHONPATH=src python3 scripts/build_phase2_features.py --competition-scope all --output-path data/features/all_match_pre_match_features.csv
```

## Phase 3: Model Training

Train the current XGBoost model:

```bash
PYTHONPATH=src python3 scripts/train_phase3_model.py
```

This writes:

```text
data/models/model_v2.json
data/models/model_v2_metrics.json
```

Current trainer behavior:

- uses `XGBoost` for a 3-class target: `0` home win, `1` draw, `2` away win
- trains on all finished matches before the validation window, with competition-aware sample weights
- validates on the most recent 4 weeks of finished 2025/26 Premier League matches
- uses `kickoff_time` as the main split boundary and falls back to gameweek ordering if needed
- adds contextual competition features such as `is_cup_match` and `is_european_match`
- calibrates probabilities with temperature scaling on a recent pre-validation Premier League slice
- reports `accuracy`, multiclass `log loss`, and multiclass `Brier score`

Current `model_v2` validation metrics:

- accuracy: `0.45`
- multiclass log loss: `1.0847`
- multiclass Brier score: `0.6540`

Sample weighting currently defaults to:

- Premier League: `1.0`
- Champions League / Europa League / Conference League: `0.8`
- EFL Cup: `0.4`
- unknown cup-style competitions: `0.4`

## Reference Snapshot

Archive the synced source datasets into a single compressed snapshot:

```bash
PYTHONPATH=src python3 scripts/archive_original_data.py
```

This writes under:

```text
data/reference/
```

## Web Frontend

The Next.js frontend lives in:

```text
apps/web
```

It reads a generated dashboard payload that includes:

- upcoming unfinished Premier League fixtures
- calibrated home/draw/away probabilities from `model_v2`
- historical finished matches with key stats and pre-match context

App structure:

- `/`: landing page
- `/predictions`: upcoming fixtures grouped by gameweek with arrow navigation
- `/history`: historical matches grouped by gameweek with arrow navigation

Generate the web payload:

```bash
PYTHONPATH=src python3 scripts/export_web_dashboard.py
```

This writes:

```text
apps/web/public/data/dashboard.json
```

Run locally:

```bash
cd apps/web
npm install
npm run dev
```

If you deploy the frontend separately from the API, set:

```text
API_BASE_URL=https://your-api-host
```

## FastAPI Backend

The backend entrypoint lives at:

```text
apps/api/main.py
```

Run locally:

```bash
uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --reload
```

Main endpoints:

- `GET /health`
- `GET /api/dashboard`
- `GET /api/predictions/upcoming`
- `GET /api/history`
- `POST /api/admin/refresh`

Useful environment variables:

- `API_BASE_URL`
- `CORS_ALLOW_ORIGINS`
- `ADMIN_TOKEN`
- `DASHBOARD_CACHE_PATH`

## Automation

The scheduled refresh pipeline now lives in:

- [src/fpl_predictor/automation.py](../src/fpl_predictor/automation.py)
- [scripts/run_refresh_pipeline.py](../scripts/run_refresh_pipeline.py)
- [scheduled-refresh.yml](../.github/workflows/scheduled-refresh.yml)

What it does:

1. sync upstream source data
2. detect whether anything actually changed
3. rebuild prediction-facing and all-competition feature tables
4. retrain `model_v2`
5. regenerate the frontend dashboard payload
6. commit refreshed artifacts back to the repository if there was a real change

Schedule:

- `05:30 UTC`
- `17:30 UTC`

## Deployment Notes

### Vercel

- set project root to `apps/web`
- optionally set `API_BASE_URL=https://your-api-host`

### Render

- create a Docker-based web service from this repository
- healthcheck path: `/health`
- let Render provide the runtime `PORT` value and keep the app bound to `0.0.0.0`
- use the public `onrender.com` URL for Vercel's `API_BASE_URL`
- set `CORS_ALLOW_ORIGINS` to the Vercel production URL without a trailing slash
