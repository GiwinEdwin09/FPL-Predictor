# FPL-Predictor

Premier League prediction pipeline built on top of the
[FPL Core Insights](https://github.com/olbauday/FPL-Core-Insights) dataset.

## Phase 1: Automated Data Ingestion

This repo now includes a sync script that:

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

The script prints a JSON summary with the source URLs, row counts, and whether each season file was updated.

### How 2025/2026 is handled

- `teams.csv`: use the season-level file and keep it only at `data/raw/2025-2026/teams.csv`
- `players.csv`: use the season-level `data/2025-2026/players.csv`
- `matches.csv`: concatenate `data/2025-2026/By Gameweek/GW*/matches.csv`
- `playerstats.csv`: concatenate `data/2025-2026/By Gameweek/GW*/playerstats.csv`
- `playermatchstats.csv`: concatenate `data/2025-2026/By Gameweek/GW*/playermatchstats.csv`

For gameweek-built datasets, the pipeline stamps a `source_gameweek` column when the upstream CSV does not already include one. `playermatchstats` should still be joined back to `matches` through `match_id` when you need the authoritative fixture gameweek.

## Next phases

- Build rolling team and player feature factories from the canonical datasets
- Train a time-aware multi-class result model
- Automate retraining and fixture predictions on a schedule
