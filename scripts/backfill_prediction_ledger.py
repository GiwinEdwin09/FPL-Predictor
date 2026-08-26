from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from fpl_predictor.model_training import (
    FEATURE_COLUMNS,
    is_premier_league_frame,
    load_prediction_feature_frame,
)
from fpl_predictor.prediction_ledger import (
    DEFAULT_LEDGER_PATH,
    PREDICTION_TYPE_REPLAY,
    load_ledger,
    save_ledger,
    seed_walk_forward_predictions,
    upsert_prediction,
)
from fpl_predictor.predictors import feature_columns_for_model, predict_match_probabilities
from fpl_predictor.web_dashboard import load_model, load_model_metadata


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill the frozen prediction ledger from walk-forward OOS predictions, then replay leftovers.",
    )
    parser.add_argument("--ledger-path", default=str(DEFAULT_LEDGER_PATH))
    parser.add_argument(
        "--walk-forward-path",
        default="data/models/model_v3_walk_forward_backtest.json",
    )
    parser.add_argument("--matches-path", default="data/matches.csv")
    parser.add_argument("--feature-table-path", default="data/features/match_pre_match_features_v3.csv")
    parser.add_argument("--model-path", default="data/models/model_v3.json")
    parser.add_argument("--metrics-path", default="data/models/model_v3_metrics.json")
    parser.add_argument("--model-version", default="model_v3")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ledger_path = Path(args.ledger_path)
    entries = load_ledger(ledger_path)
    walk_forward_rows = seed_walk_forward_predictions(
        entries,
        Path(args.walk_forward_path),
        model_version=args.model_version,
    )

    matches = pd.read_csv(args.matches_path)
    matches["kickoff_time"] = pd.to_datetime(matches["kickoff_time"], errors="coerce", utc=True, format="mixed")
    finished = matches.loc[is_premier_league_frame(matches) & (matches["finished"] == True)].copy()
    missing_ids = [str(match_id) for match_id in finished["match_id"] if str(match_id) not in entries]

    replay_rows = 0
    if missing_ids and Path(args.model_path).exists() and Path(args.feature_table_path).exists():
        features = load_prediction_feature_frame(Path(args.feature_table_path)).set_index("match_id", drop=False)
        features.index = features.index.astype(str)
        temperature, _ = load_model_metadata(Path(args.metrics_path))
        model = load_model(Path(args.model_path))
        present = [match_id for match_id in missing_ids if match_id in features.index]
        if present:
            batch = features.loc[present]
            probabilities = predict_match_probabilities(
                model,
                batch,
                feature_columns=feature_columns_for_model(model, FEATURE_COLUMNS),
                temperature=temperature,
            )
            kickoffs = finished.set_index(finished["match_id"].astype(str))["kickoff_time"]
            for match_id, probability in zip(present, probabilities, strict=True):
                _, wrote = upsert_prediction(
                    entries,
                    match_id=match_id,
                    probabilities=probability,
                    model_version=args.model_version,
                    kickoff_time=kickoffs.get(match_id),
                    finished=True,
                    prediction_type=PREDICTION_TYPE_REPLAY,
                )
                if wrote:
                    replay_rows += 1

    save_ledger(ledger_path, entries)
    print(
        json.dumps(
            {
                "ledger_path": str(ledger_path),
                "entries": len(entries),
                "walk_forward_rows": walk_forward_rows,
                "replay_rows": replay_rows,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
