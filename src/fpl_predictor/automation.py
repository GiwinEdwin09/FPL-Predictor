from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fpl_predictor.data_ingestion import run_sync
from fpl_predictor.feature_factory import build_feature_table
from fpl_predictor.model_training import train_and_save_model
from fpl_predictor.web_dashboard import export_dashboard


@dataclass(frozen=True)
class RefreshSummary:
    refreshed_at_utc: str
    data_changed: bool
    sync_state_path: str
    prediction_feature_table_path: str | None
    training_feature_table_path: str | None
    model_path: str | None
    metrics_path: str | None
    dashboard_path: str | None
    updated_datasets: dict[str, list[str]]


def changed_seasons_by_dataset(sync_summary: dict[str, Any]) -> dict[str, list[str]]:
    changed: dict[str, list[str]] = {}
    for dataset_name, dataset_summary in sync_summary["datasets"].items():
        seasons = [
            result["season"]
            for result in dataset_summary.get("seasons", [])
            if result.get("updated")
        ]
        if seasons:
            changed[dataset_name] = seasons
    return changed


def run_refresh_pipeline(
    data_dir: Path,
    prediction_feature_table_path: Path,
    training_feature_table_path: Path,
    matches_path: Path,
    model_path: Path,
    metrics_path: Path,
    dashboard_path: Path,
    force_sync: bool = False,
) -> RefreshSummary:
    sync_summary = run_sync(data_dir=data_dir, force=force_sync)
    updated_datasets = changed_seasons_by_dataset(sync_summary)

    if not sync_summary["any_updated"]:
        return RefreshSummary(
            refreshed_at_utc=datetime.now(UTC).isoformat(),
            data_changed=False,
            sync_state_path=str(sync_summary["sync_state_path"]),
            prediction_feature_table_path=None,
            training_feature_table_path=None,
            model_path=None,
            metrics_path=None,
            dashboard_path=None,
            updated_datasets={},
        )

    build_feature_table(
        matches_path=matches_path,
        output_path=prediction_feature_table_path,
        competition_scope="premier_league",
    )
    build_feature_table(
        matches_path=matches_path,
        output_path=training_feature_table_path,
        competition_scope="all",
    )
    training_summary = train_and_save_model(
        prediction_feature_table_path=prediction_feature_table_path,
        training_feature_table_path=training_feature_table_path,
        matches_path=matches_path,
        model_path=model_path,
        metrics_path=metrics_path,
    )
    export_dashboard(
        output_path=dashboard_path,
        data_dir=data_dir,
        feature_table_path=prediction_feature_table_path,
        matches_path=matches_path,
        model_path=model_path,
        metrics_path=metrics_path,
    )

    return RefreshSummary(
        refreshed_at_utc=datetime.now(UTC).isoformat(),
        data_changed=True,
        sync_state_path=str(sync_summary["sync_state_path"]),
        prediction_feature_table_path=str(prediction_feature_table_path),
        training_feature_table_path=str(training_feature_table_path),
        model_path=training_summary.model_path,
        metrics_path=training_summary.metrics_path,
        dashboard_path=str(dashboard_path),
        updated_datasets=updated_datasets,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the scheduled refresh pipeline: sync, feature rebuild, retrain, and dashboard export.",
    )
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--matches-path", default="data/matches.csv")
    parser.add_argument(
        "--prediction-feature-table-path",
        default="data/features/match_pre_match_features.csv",
    )
    parser.add_argument(
        "--training-feature-table-path",
        default="data/features/all_match_pre_match_features.csv",
    )
    parser.add_argument("--model-path", default="data/models/model_v2.json")
    parser.add_argument("--metrics-path", default="data/models/model_v2_metrics.json")
    parser.add_argument("--dashboard-path", default="apps/web/public/data/dashboard.json")
    parser.add_argument(
        "--summary-path",
        default="data/automation/last_refresh_summary.json",
        help="Path where the pipeline summary JSON should be written.",
    )
    parser.add_argument(
        "--force-sync",
        action="store_true",
        help="Force upstream sync even when remote row counts and hashes match.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = run_refresh_pipeline(
        data_dir=Path(args.data_dir),
        prediction_feature_table_path=Path(args.prediction_feature_table_path),
        training_feature_table_path=Path(args.training_feature_table_path),
        matches_path=Path(args.matches_path),
        model_path=Path(args.model_path),
        metrics_path=Path(args.metrics_path),
        dashboard_path=Path(args.dashboard_path),
        force_sync=args.force_sync,
    )
    summary_path = Path(args.summary_path)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(asdict(summary), indent=2), encoding="utf-8")
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":
    main()

