from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tarfile
from datetime import UTC, datetime
from pathlib import Path


ARCHIVE_SOURCES = (
    "data/raw",
    "data/matches.csv",
    "data/players.csv",
    "data/playerstats.csv",
    "data/playermatchstats.csv",
    "data/sync_state.json",
)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_archive(snapshot_root: Path) -> dict[str, object]:
    copied_files: list[dict[str, object]] = []
    for source in ARCHIVE_SOURCES:
        source_path = Path(source)
        destination = snapshot_root / source_path
        if source_path.is_dir():
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(source_path, destination)
            for path in sorted(destination.rglob("*")):
                if path.is_file():
                    copied_files.append(
                        {
                            "path": str(path.relative_to(snapshot_root)),
                            "sha256": file_sha256(path),
                            "size_bytes": path.stat().st_size,
                        }
                    )
        elif source_path.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)
            copied_files.append(
                {
                    "path": str(destination.relative_to(snapshot_root)),
                    "sha256": file_sha256(destination),
                    "size_bytes": destination.stat().st_size,
                }
            )

    manifest = {
        "archived_at_utc": datetime.now(UTC).isoformat(),
        "snapshot_root": str(snapshot_root),
        "files": copied_files,
    }
    (snapshot_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def create_compressed_snapshot(output_dir: Path) -> tuple[Path, Path]:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    snapshot_root = output_dir / f"original_datasets_snapshot_{timestamp}"
    snapshot_root.mkdir(parents=True, exist_ok=True)
    build_archive(snapshot_root)

    archive_path = output_dir / f"{snapshot_root.name}.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        archive.add(snapshot_root, arcname=snapshot_root.name)

    return snapshot_root, archive_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Archive original synced datasets into a single compressed snapshot.",
    )
    parser.add_argument(
        "--output-dir",
        default="data/reference",
        help="Directory where the snapshot folder and tar.gz archive should be written.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    snapshot_root, archive_path = create_compressed_snapshot(Path(args.output_dir))
    print(json.dumps({"snapshot_root": str(snapshot_root), "archive_path": str(archive_path)}, indent=2))


if __name__ == "__main__":
    main()
