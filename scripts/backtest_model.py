from __future__ import annotations

import argparse
import json
from pathlib import Path

from fpl_predictor.backtesting import run_walk_forward_backtest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a leakage-safe, gameweek walk-forward backtest of the current result model.",
    )
    parser.add_argument(
        "--training-feature-table-path",
        default="data/features/all_match_pre_match_features.csv",
    )
    parser.add_argument("--matches-path", default="data/matches.csv")
    parser.add_argument(
        "--evaluation-seasons",
        nargs="+",
        default=["2025-2026"],
        help="Seasons to replay. Defaults to 2025-2026, which has a full prior season for training.",
    )
    parser.add_argument("--minimum-train-rows", type=int, default=200)
    parser.add_argument("--bootstrap-samples", type=int, default=2_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--no-calibration",
        action="store_true",
        help="Skip per-fold temperature calibration (faster, but unlike production).",
    )
    parser.add_argument(
        "--output-path",
        default="data/models/model_v2_walk_forward_backtest.json",
    )
    parser.add_argument(
        "--v3",
        action="store_true",
        help="Evaluate the blended model_v3 candidates instead of production model_v2.",
    )
    parser.add_argument("--half-life-days", type=float, default=550.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.v3:
        from fpl_predictor.backtesting import run_walk_forward_backtest_v3

        result = run_walk_forward_backtest_v3(
            training_feature_table_path=Path(args.training_feature_table_path),
            matches_path=Path(args.matches_path),
            evaluation_seasons=args.evaluation_seasons,
            min_train_rows=args.minimum_train_rows,
            bootstrap_samples=args.bootstrap_samples,
            seed=args.seed,
            half_life_days=args.half_life_days,
        )
        if args.output_path == "data/models/model_v2_walk_forward_backtest.json":
            args.output_path = "data/models/model_v3_walk_forward_backtest.json"
    else:
        result = run_walk_forward_backtest(
            training_feature_table_path=Path(args.training_feature_table_path),
            matches_path=Path(args.matches_path),
            evaluation_seasons=args.evaluation_seasons,
            min_train_rows=args.minimum_train_rows,
            bootstrap_samples=args.bootstrap_samples,
            seed=args.seed,
            calibrate_xgboost=not args.no_calibration,
        )
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"Wrote {output_path}")
    print(
        json.dumps(
            {
                "data": result["data"],
                "models": {
                    name: {
                        metric: model.get(metric)
                        for metric in ("rows", "accuracy", "log_loss", "brier", "rps", "ece")
                        if metric in model
                    }
                    for name, model in result["models"].items()
                },
                "xgboost_calibration": result.get("xgboost_calibration"),
                "blend_calibration": result.get("blend_calibration"),
                "comparisons": result["comparisons"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
