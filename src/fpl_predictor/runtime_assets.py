from __future__ import annotations

import argparse
from pathlib import Path

from fpl_predictor.data_ingestion import SEASONS, run_sync
from fpl_predictor.feature_factory import build_feature_table
from fpl_predictor.live_inference import InferencePaths
from fpl_predictor.model_training import train_and_save_model
from fpl_predictor.web_dashboard import export_dashboard


def required_runtime_paths(paths: InferencePaths) -> list[Path]:
    team_files = [paths.data_dir / "raw" / season / "teams.csv" for season in SEASONS]
    return [
        paths.matches_path,
        paths.players_path,
        paths.playerstats_path,
        paths.playermatchstats_path,
        paths.model_path,
        paths.metrics_path,
        *team_files,
    ]


def missing_runtime_paths(paths: InferencePaths) -> list[Path]:
    return [path for path in required_runtime_paths(paths) if not path.exists()]


def ensure_runtime_assets(
    paths: InferencePaths,
    *,
    prediction_feature_table_path: Path,
    training_feature_table_path: Path,
    dashboard_output_path: Path | None = None,
    force_sync: bool = False,
) -> bool:
    missing = missing_runtime_paths(paths)
    if not missing and not force_sync:
        return False

    paths.data_dir.mkdir(parents=True, exist_ok=True)
    run_sync(data_dir=paths.data_dir, force=force_sync)
    build_feature_table(
        matches_path=paths.matches_path,
        output_path=prediction_feature_table_path,
        competition_scope="premier_league",
    )
    build_feature_table(
        matches_path=paths.matches_path,
        output_path=training_feature_table_path,
        competition_scope="all",
    )
    train_and_save_model(
        prediction_feature_table_path=prediction_feature_table_path,
        training_feature_table_path=training_feature_table_path,
        matches_path=paths.matches_path,
        model_path=paths.model_path,
        metrics_path=paths.metrics_path,
    )
    if dashboard_output_path is not None:
        export_dashboard(
            output_path=dashboard_output_path,
            data_dir=paths.data_dir,
            feature_table_path=prediction_feature_table_path,
            matches_path=paths.matches_path,
            model_path=paths.model_path,
            metrics_path=paths.metrics_path,
        )
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ensure runtime data, model artifacts, and dashboard cache exist for the API.",
    )
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--matches-path", default="data/matches.csv")
    parser.add_argument("--players-path", default="data/players.csv")
    parser.add_argument("--playerstats-path", default="data/playerstats.csv")
    parser.add_argument("--playermatchstats-path", default="data/playermatchstats.csv")
    parser.add_argument("--model-path", default="data/models/model_v2.json")
    parser.add_argument("--metrics-path", default="data/models/model_v2_metrics.json")
    parser.add_argument(
        "--prediction-feature-table-path",
        default="data/features/match_pre_match_features.csv",
    )
    parser.add_argument(
        "--training-feature-table-path",
        default="data/features/all_match_pre_match_features.csv",
    )
    parser.add_argument("--dashboard-path", default=None)
    parser.add_argument("--force-sync", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_runtime_assets(
        InferencePaths(
            data_dir=Path(args.data_dir),
            matches_path=Path(args.matches_path),
            players_path=Path(args.players_path),
            playerstats_path=Path(args.playerstats_path),
            playermatchstats_path=Path(args.playermatchstats_path),
            model_path=Path(args.model_path),
            metrics_path=Path(args.metrics_path),
        ),
        prediction_feature_table_path=Path(args.prediction_feature_table_path),
        training_feature_table_path=Path(args.training_feature_table_path),
        dashboard_output_path=Path(args.dashboard_path) if args.dashboard_path else None,
        force_sync=args.force_sync,
    )


if __name__ == "__main__":
    main()
