from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping

BUNDLE_SCHEMA_VERSION = 1
REQUIRED_COMPONENTS = frozenset({"model", "metrics", "prediction_features", "team_keys"})


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _relative_artifact_path(bundle_path: Path, artifact_path: Path) -> str:
    return os.path.relpath(artifact_path.resolve(), start=bundle_path.parent.resolve())


def _component(bundle_path: Path, artifact_path: Path) -> dict[str, Any]:
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Model bundle artifact not found: {artifact_path}")
    return {
        "path": _relative_artifact_path(bundle_path, artifact_path),
        "sha256": sha256_file(artifact_path),
        "size_bytes": artifact_path.stat().st_size,
    }


def write_team_key_snapshot(
    output_path: Path,
    lookup: Mapping[tuple[str, int], str],
) -> Path:
    entries = [
        {"season": season, "team_id": team_id, "team_key": team_key}
        for (season, team_id), team_key in sorted(lookup.items())
    ]
    payload = {
        "schema_version": 1,
        "entries": entries,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return output_path


def create_model_bundle(
    bundle_path: Path,
    *,
    model_version: str,
    predictor_type: str,
    feature_columns: list[str],
    model_path: Path,
    metrics_path: Path,
    prediction_features_path: Path,
    team_keys_path: Path,
    additional_components: Mapping[str, Path] | None = None,
) -> dict[str, Any]:
    component_paths = {
        "model": model_path,
        "metrics": metrics_path,
        "prediction_features": prediction_features_path,
        "team_keys": team_keys_path,
        **dict(additional_components or {}),
    }
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": BUNDLE_SCHEMA_VERSION,
        "model_version": model_version,
        "predictor_type": predictor_type,
        "created_at_utc": datetime.now(UTC).isoformat(),
        "feature_columns": feature_columns,
        "components": {
            name: _component(bundle_path, path)
            for name, path in sorted(component_paths.items())
        },
    }
    bundle_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def load_model_bundle(bundle_path: Path, *, verify_hashes: bool = True) -> dict[str, Any]:
    payload = json.loads(bundle_path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != BUNDLE_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported model bundle schema {payload.get('schema_version')!r}; "
            f"expected {BUNDLE_SCHEMA_VERSION}."
        )
    components = payload.get("components")
    if not isinstance(components, dict):
        raise ValueError("Model bundle components must be an object.")
    missing = sorted(REQUIRED_COMPONENTS.difference(components))
    if missing:
        raise ValueError(f"Model bundle is missing required components: {', '.join(missing)}")

    resolved: dict[str, Path] = {}
    for name, component in components.items():
        if not isinstance(component, dict) or not component.get("path"):
            raise ValueError(f"Invalid model bundle component: {name}")
        path = (bundle_path.parent / str(component["path"])).resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Model bundle component {name!r} not found: {path}")
        if verify_hashes:
            expected = str(component.get("sha256", ""))
            actual = sha256_file(path)
            if not expected or actual != expected:
                raise ValueError(f"Model bundle component {name!r} failed SHA-256 verification.")
        resolved[name] = path

    payload["resolved_components"] = resolved
    return payload
