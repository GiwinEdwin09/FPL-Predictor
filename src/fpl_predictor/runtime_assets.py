from __future__ import annotations

import argparse
from pathlib import Path

from fpl_predictor.data_ingestion import run_sync
from fpl_predictor.feature_factory import build_feature_table
from fpl_predictor.live_inference import InferencePaths
from fpl_predictor.model_bundle import MODEL_VERSIONS, default_artifact_paths, load_model_bundle
from fpl_predictor.model_training import train_and_save_model
from fpl_predictor.web_dashboard import export_dashboard


def required_runtime_paths(paths: InferencePaths) -> list[Path]:
    raw_root = paths.data_dir / "raw"
    team_files = sorted(raw_root.glob("*/teams.csv"))
    return [
        paths.matches_path,
        paths.players_path,
        paths.playerstats_path,
        paths.playermatchstats_path,
        paths.model_path,
        paths.metrics_path,
        *(
            [paths.prediction_feature_table_path]
            if paths.prediction_feature_table_path is not None
            else []
        ),
        *([paths.bundle_path] if paths.bundle_path is not None else []),
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
    model_version: str = "v2",
    reuse_existing_bundle: bool = False,
) -> bool:
    if model_version not in MODEL_VERSIONS:
        raise ValueError(f"Unsupported model_version {model_version!r}; expected 'v2' or 'v3'.")
    missing = missing_runtime_paths(paths)
    if not missing and not force_sync:
        return False

    paths.data_dir.mkdir(parents=True, exist_ok=True)
    run_sync(data_dir=paths.data_dir, force=force_sync)
    if model_version == "v3" and reuse_existing_bundle:
        if paths.bundle_path is None:
            raise ValueError("A bundle path is required when reusing an existing v3 bundle.")
        bundle = load_model_bundle(paths.bundle_path, verify_hashes=True)
        components = bundle["resolved_components"]
        if dashboard_output_path is not None:
            export_dashboard(
                output_path=dashboard_output_path,
                data_dir=paths.data_dir,
                feature_table_path=components["prediction_features"],
                matches_path=paths.matches_path,
                model_path=components["model"],
                metrics_path=components["metrics"],
            )
        return True
    feature_matches_path = paths.matches_path
    include_historical_rows = True
    team_key_lookup = None
    if model_version == "v3":
        from fpl_predictor.training_corpus import build_v3_training_corpus, load_team_key_lookup

        feature_matches_path = build_v3_training_corpus(paths.data_dir, paths.matches_path)
        include_historical_rows = False
        team_key_lookup = load_team_key_lookup(paths.data_dir)
    build_feature_table(
        matches_path=feature_matches_path,
        output_path=prediction_feature_table_path,
        competition_scope="premier_league",
        team_key_lookup=team_key_lookup,
        include_historical_rows=include_historical_rows,
    )
    if model_version == "v3":
        from fpl_predictor.model_v3 import train_and_save_model_v3

        train_and_save_model_v3(
            prediction_feature_table_path=prediction_feature_table_path,
            training_feature_table_path=training_feature_table_path,
            matches_path=feature_matches_path,
            model_path=paths.model_path,
            metrics_path=paths.metrics_path,
            data_dir=paths.data_dir,
            bundle_path=paths.bundle_path,
        )
    else:
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
    parser.add_argument("--model-path", default=None)
    parser.add_argument("--metrics-path", default=None)
    parser.add_argument("--bundle-path", default=None)
    parser.add_argument("--model-version", choices=("v2", "v3"), default="v2")
    parser.add_argument(
        "--prediction-feature-table-path",
        default=None,
    )
    parser.add_argument(
        "--training-feature-table-path",
        default=None,
    )
    parser.add_argument("--dashboard-path", default=None)
    parser.add_argument("--force-sync", action="store_true")
    parser.add_argument("--reuse-existing-bundle", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    defaults = default_artifact_paths(args.model_version)
    model_path = Path(args.model_path or defaults.model)
    metrics_path = Path(args.metrics_path or defaults.metrics)
    prediction_feature_table_path = Path(args.prediction_feature_table_path or defaults.prediction_features)
    training_feature_table_path = Path(args.training_feature_table_path or defaults.training_features)
    bundle_path = Path(args.bundle_path) if args.bundle_path else None
    if args.model_version == "v3" and bundle_path is None:
        bundle_path = model_path.with_name(f"{model_path.stem}_bundle.json")
    ensure_runtime_assets(
        InferencePaths(
            data_dir=Path(args.data_dir),
            matches_path=Path(args.matches_path),
            players_path=Path(args.players_path),
            playerstats_path=Path(args.playerstats_path),
            playermatchstats_path=Path(args.playermatchstats_path),
            model_path=model_path,
            metrics_path=metrics_path,
            prediction_feature_table_path=prediction_feature_table_path,
            bundle_path=bundle_path,
        ),
        prediction_feature_table_path=prediction_feature_table_path,
        training_feature_table_path=training_feature_table_path,
        dashboard_output_path=Path(args.dashboard_path) if args.dashboard_path else None,
        force_sync=args.force_sync,
        model_version=args.model_version,
        reuse_existing_bundle=args.reuse_existing_bundle,
    )


if __name__ == "__main__":
    main()
