# Build Progress

## Overview

This document tracks the technical build progress for the Premier League Predictor project: data ingestion, feature engineering, model training, frontend delivery, backend API work, and deployment notes.

The product-facing overview now lives in the root [README.md](../README.md).

### Current production status

- the Render backend is configured with `MODEL_VERSION=v3`
- the API loads the committed, hash-validated v3 bundle during its Docker build
- the final predictor is fitted on 12,809 finished matches spanning 33 seasons
- the saved evaluation replays all 380 matches from 2025/26 across 38
  chronological gameweek folds
- the guarded selection process chose Dixon-Coles in all 38 folds; XGBoost
  remains packaged as a research candidate rather than being forced into live
  probabilities

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

## Phase 3: Model v2 Research Baseline (Superseded)

Train the legacy XGBoost v2 baseline:

```bash
PYTHONPATH=src python3 scripts/train_phase3_model.py
```

This writes:

```text
data/models/model_v2.json
data/models/model_v2_metrics.json
```

Legacy trainer behavior:

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

V2 sample weighting defaults to:

- Premier League: `1.0`
- Champions League / Europa League / Conference League: `0.8`
- EFL Cup: `0.4`
- unknown cup-style competitions: `0.4`

### Walk-Forward Backtesting

Replay the legacy v2 model and its baselines as if each 2025/26
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

Recorded v2 replay results over all 380 matches from 2025/26:

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

The v2 dataset contained no bookmaker-odds columns, so its market baseline was
correctly reported as unavailable. These results motivated the historical-data,
Dixon-Coles, and guarded-selection work that became production v3 below.

## Phase 2b: Historical Premier League results

Download and normalize football-data.co.uk Premier League CSVs from 1993/94
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

`model_v3` is now the production forecasting pipeline. It evaluates a
time-decayed Dixon-Coles model and regularized XGBoost candidate without using
future matches. Within every outer gameweek fold, predictor selection and
temperature calibration use accumulated chronological season-block
out-of-fold predictions from the training data. The blend is promoted only
when its gameweek-block bootstrap interval beats Dixon-Coles; otherwise the
fold selects Dixon-Coles.

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

The complete audit output is committed at
`data/models/model_v3_walk_forward_backtest.json`.

### Authoritative v3 walk-forward result

The corrected 2025/26 replay uses all 380 league matches across 38 gameweek
folds. Each prediction is generated using only matches available before that
gameweek's first kickoff. The feature corpus contains 12,809 eligible finished
matches across 33 seasons, from 1993/94 through 2025/26.

| Model | Accuracy | Log loss | Brier | RPS | ECE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Uniform | 42.63% | 1.0986 | 0.6667 | 0.2322 | 0.0930 |
| Historical prior | 42.63% | 1.0813 | 0.6548 | 0.2278 | **0.0306** |
| Elo-only logistic | **47.89%** | 1.0314 | 0.6205 | 0.2109 | 0.0624 |
| Time-decayed Dixon-Coles | 46.84% | **1.0299** | **0.6186** | **0.2099** | 0.0476 |
| Regularized XGBoost v3 | 47.11% | 1.0441 | 0.6284 | 0.2137 | 0.0522 |
| Multinomial logistic v3 | **47.89%** | 1.0616 | 0.6330 | 0.2156 | 0.0417 |
| Selected v3 pipeline | 46.84% | 1.0310 | 0.6194 | 0.2101 | 0.0438 |
| Closing market (de-vigged) | 49.47% | 1.0118 | 0.6077 | 0.2045 | 0.0340 |

All 38 folds selected Dixon-Coles, producing a mean Dixon-Coles weight of
`1.0`; the mean fitted temperature was `0.997`. The selected v3 pipeline was
statistically indistinguishable from Elo: v3 minus Elo log-loss difference
`-0.0004`, with a 95% gameweek-block bootstrap interval from `-0.0173` to
`+0.0163`. It remained behind the closing market by `+0.0192` log loss, with a
95% interval from `+0.0044` to `+0.0333`.

The production decision is therefore deliberately conservative. V3 replaces
the underperforming v2 tree model, but its promotion gate does not pretend the
XGBoost candidate adds value when the evidence does not support it. The bundle
retains the tree component for evaluation while serving the selected
Dixon-Coles component.

### Validation versus final production fit

`model_v3_metrics.json` contains a separate latest-window smoke test: 12,767
matches precede a 42-match validation window. That small window currently
reports 40.48% accuracy, 1.0332 log loss, and 0.6219 Brier score. It should not
be confused with the authoritative 380-match walk-forward table above.

After that validation is recorded, the production predictor is refitted on all
12,809 eligible finished matches. This final refit does not invalidate the
earlier evaluation because its metrics were computed before the validation rows
were added back. Unfinished 2026/27 fixtures remain prediction-only rows and are
never used as training targets.

### Production artifacts

The committed v3 release consists of:

- `data/models/model_v3_bundle.json`: manifest and component hashes
- `data/models/model_v3.json`: selected Dixon-Coles/blend parameters
- `data/models/model_v3_xgboost.json`: guarded tree candidate
- `data/models/model_v3_metrics.json`: latest-window smoke-test metrics and
  final-fit summary
- `data/models/model_v3_team_keys.json`: canonical team lookup
- `data/features/match_pre_match_features_v3.csv`: warmed prediction features
- `data/models/model_v3_walk_forward_backtest.json`: complete out-of-sample
  predictions, fold details, metrics, and confidence intervals

The scheduled refresh now trains and packages v3 directly:

```bash
PYTHONPATH=src python3 scripts/run_refresh_pipeline.py --model-version v3
```

Render loads the immutable bundle with:

```text
MODEL_VERSION=v3
MODEL_BUNDLE_PATH=data/models/model_v3_bundle.json
BOOTSTRAP_RUNTIME_ASSETS=0
REFRESH_RUNTIME_ASSETS_ON_STARTUP=0
```

The API validates the manifest, file hashes, feature schema, and canonical team
keys during startup. An incomplete or mismatched v3 bundle fails startup instead
of silently falling back to average-team parameters. The dashboard JSON contract
remains `{homeWin, draw, awayWin}`. Historical UI probabilities are still a
current-model replay unless they are explicitly replaced with saved
walk-forward out-of-sample predictions.

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
- calibrated home/draw/away probabilities from production `model_v3`
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
3. refresh the historical corpus and rebuild v3 prediction/training features
4. retrain and package `model_v3`
5. regenerate the frontend dashboard payload with v3 probabilities
6. commit refreshed v3 artifacts back to the repository if data changed

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
- set `MODEL_VERSION=v3` and point `MODEL_BUNDLE_PATH` at the committed bundle
- keep runtime bootstrapping and startup refresh disabled so each deploy uses the
  validated immutable artifact built into its Docker image
