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

The trainer writes the latest single-window metrics to
`data/models/model_v2_metrics.json`. Those values change with each refresh and
are useful as a smoke test, but the walk-forward evaluation below is the
authoritative model-comparison tool.

Sample weighting currently defaults to:

- Premier League: `1.0`
- Champions League / Europa League / Conference League: `0.8`
- EFL Cup: `0.4`
- unknown cup-style competitions: `0.4`

### Walk-Forward Backtesting

Run the current production model and its baselines as if each 2025/26
gameweek were still in the future:

```bash
PYTHONPATH=src python3 scripts/backtest_model.py
```

The harness:

- trains only on matches before the first kickoff of each evaluated gameweek
- refits and recalibrates `model_v2` for every fold
- compares it with uniform, historical-outcome-rate, and Elo-only logistic
  baselines
- automatically adds a de-vigged market baseline if recognized
  football-data.co.uk odds columns exist
- reports accuracy, multiclass log loss, multiclass Brier score, Ranked
  Probability Score, Expected Calibration Error, reliability bins, and
  gameweek-block bootstrap confidence intervals
- retains every out-of-sample match probability in the output for auditing and
  later error analysis
- writes the complete result to
  `data/models/model_v2_walk_forward_backtest.json`

Current 2025/26 replay results over all 380 league matches:

| Model | Accuracy | Log loss | Brier | RPS | ECE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Uniform | 42.63% | 1.0986 | 0.6667 | 0.2322 | 0.0930 |
| Historical prior | 42.63% | 1.0835 | 0.6560 | 0.2283 | 0.0083 |
| Elo-only logistic | **48.68%** | **1.0327** | **0.6209** | **0.2108** | 0.0578 |
| Calibrated XGBoost v2 | 42.37% | 1.0830 | 0.6530 | 0.2232 | **0.0433** |

The calibrated XGBoost model is statistically worse than the Elo-only
baseline: XGBoost minus Elo log-loss difference `+0.0503` (gameweek-block
bootstrap 95% CI `+0.0238` to `+0.0796`) and RPS difference `+0.0124` (95% CI
`+0.0033` to `+0.0216`). The raw, uncalibrated XGBoost result is substantially
worse (`1.3308` log loss, `0.2465` ECE), so temperature scaling is doing
important work rather than merely polishing the output. Per-fold temperatures
average `3.57`, and 12 of 38 folds hit the current grid maximum of `5.0`,
which is strong evidence that the tree model is overconfident at this data
volume.

The current dataset contains no bookmaker-odds columns, so the market baseline
is correctly reported as unavailable. Do not tune a replacement model directly
against these 380 results and then call the same replay a final test; first add
older seasons, use those for development/tuning, and retain 2025/26 as the
untouched final comparison season.

## Phase 2b: Historical Premier League results

Download and normalize football-data.co.uk Premier League CSVs from 1994/95
onward:

```bash
PYTHONPATH=src python3 scripts/sync_historical_results.py
PYTHONPATH=src python3 scripts/build_training_corpus.py
```

This writes:

```text
data/historical/football-data/raw/E0_*.csv
data/historical/football_data_premier_league.csv
data/matches_training.csv
```

`data/matches.csv` remains the product source of truth from FPL-Core-Insights.
The training corpus concatenates older result/odds rows with current FCI
matches. On overlapping fixtures, FCI wins and historical closing odds are
copied onto the FCI row.

Team names are reconciled to canonical slugs (`manchester-united`,
`nottingham-forest`, ...). Feature generation keys rolling form, Elo, and
pi-ratings by those slugs so historical Arsenal results warm current Arsenal
rows even though FCI still stores numeric team IDs.

## Phase 3b–5: Ratings, Dixon-Coles, and model_v3

Pre-match features now include:

- locally recomputed Elo (not unverified upstream Elo)
- Constantinou–Fenton pi-ratings, stamped before each match is applied
- last-5 observation counts and an `has_xg_coverage` flag for result-only eras
- a COVID-season flag for 2019/20 and 2020/21

`model_v3` is a leakage-safe blend of time-decayed Dixon-Coles and a
regularized XGBoost model. Blend weight and temperature are chosen on a
held-out train slice; the trees are not refit on that slice.

Train it:

```bash
PYTHONPATH=src python3 scripts/train_model_v3.py
```

Walk-forward evaluation, still defaulting to untouched 2025/26:

```bash
PYTHONPATH=src python3 scripts/backtest_model.py --v3 \
  --training-feature-table-path data/features/all_match_pre_match_features_v3.csv \
  --matches-path data/matches_training.csv
```

Authoritative 2025/26 replay after adding 1994–2025 history (380 league
matches, 38 gameweek folds, ~12.3k training rows available):

| Model | Accuracy | Log loss | Brier | RPS | ECE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Uniform | 42.63% | 1.0986 | 0.6667 | 0.2322 | 0.0930 |
| Historical prior | 42.63% | 1.0815 | 0.6550 | 0.2279 | 0.0322 |
| Elo-only logistic | 47.89% | 1.0314 | 0.6205 | 0.2108 | 0.0599 |
| Time-decayed Dixon-Coles | 47.11% | **1.0297** | **0.6190** | **0.2100** | 0.0434 |
| Regularized XGBoost v3 | 46.05% | 1.0954 | 0.6569 | 0.2245 | 0.0961 |
| Multinomial logistic v3 | 47.63% | 1.0632 | 0.6341 | 0.2159 | 0.0457 |
| Blend v3 (DC + XGB) | **48.42%** | 1.0301 | 0.6200 | 0.2101 | **0.0254** |
| Closing market (de-vigged) | 49.47% | 1.0118 | 0.6077 | 0.2045 | 0.0340 |

The blend is mostly Dixon-Coles (mean weight `0.77`) with a mean temperature of
`1.44`. It is statistically better than v2 XGBoost and the historical prior,
statistically indistinguishable from Elo (log-loss difference `-0.0013`, 95%
CI `-0.024` to `+0.022`), and still behind the closing line. Production
refresh therefore stays on `model_v2` until a later candidate beats Elo with a
bootstrap interval that excludes zero.

To train v3 during a refresh without changing the live default:

```bash
PYTHONPATH=src python3 scripts/run_refresh_pipeline.py --model-version v3 \
  --model-path data/models/model_v3.json \
  --metrics-path data/models/model_v3_metrics.json
```

The dashboard JSON contract is unchanged: `{homeWin, draw, awayWin}`. Historical
UI probabilities are still a current-model replay unless they are later wired
to walk-forward out-of-sample predictions.

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
