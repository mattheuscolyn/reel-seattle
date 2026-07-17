#!/usr/bin/env python3
"""Evaluate AMC catalog refresh cadence and inactive-product growth (read-only).

No AMC API calls. Does not mutate catalogs or change production policy.

Examples:
  # Current committed catalogs only
  python scripts/audit_amc_catalog_cadence.py

  # Reconstruct distinct generated_at snapshots from git history (read-only)
  python scripts/audit_amc_catalog_cadence.py --from-git

  # Pre-extracted snapshot directory:
  #   <dir>/<label>/amc_movie_products.json
  #   <dir>/<label>/amc_release_observations.json  (optional)
  python scripts/audit_amc_catalog_cadence.py --snapshots-dir audit-output/catalog-snaps
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_catalog_cadence_audit import (  # noqa: E402
    CatalogCadenceAuditError,
    build_catalog_cadence_evaluation,
    load_catalog_snapshot,
    write_evaluation_outputs,
)

PRODUCTS_REL = "data/source_catalog/amc_movie_products.json"
RELEASES_REL = "data/source_catalog/amc_release_observations.json"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only AMC durable-catalog cadence / inactive-growth evaluation (P-21C)."
        )
    )
    parser.add_argument(
        "--products-path",
        type=Path,
        default=Path(PRODUCTS_REL),
        help="Current products catalog path (default: durable production path).",
    )
    parser.add_argument(
        "--releases-path",
        type=Path,
        default=Path(RELEASES_REL),
        help="Current releases catalog path.",
    )
    parser.add_argument(
        "--snapshots-dir",
        type=Path,
        default=None,
        help="Directory of pre-extracted snapshot subfolders (preferred historical input).",
    )
    parser.add_argument(
        "--from-git",
        action="store_true",
        help=(
            "Load distinct generated_at catalog snapshots via read-only "
            "`git show` (does not check out or modify the working tree)."
        ),
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=PROJECT_ROOT,
        help="Repository root for --from-git and relative paths.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("audit-output/amc-catalog-cadence-evaluation"),
        help="Gitignored research output directory.",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Fixed report timestamp for deterministic tests.",
    )
    return parser.parse_args(argv)


def _load_from_snapshots_dir(snapshots_dir: Path) -> list[dict]:
    if not snapshots_dir.is_dir():
        raise CatalogCadenceAuditError(f"snapshots dir not found: {snapshots_dir}")
    snapshots: list[dict] = []
    for child in sorted(snapshots_dir.iterdir()):
        if not child.is_dir():
            continue
        products_path = child / "amc_movie_products.json"
        if not products_path.is_file():
            continue
        releases_path = child / "amc_release_observations.json"
        snapshots.append(
            load_catalog_snapshot(
                label=child.name,
                products_path=products_path,
                releases_path=releases_path if releases_path.is_file() else None,
            )
        )
    if not snapshots:
        raise CatalogCadenceAuditError(
            f"no snapshot subfolders with amc_movie_products.json under {snapshots_dir}"
        )
    # Order by catalog generated_at when present.
    snapshots.sort(
        key=lambda item: str((item.get("products") or {}).get("generated_at") or item["label"])
    )
    return snapshots


def _load_from_git(repo_root: Path) -> list[dict]:
    commits = subprocess.check_output(
        ["git", "log", "--pretty=format:%H", "--", PRODUCTS_REL],
        cwd=repo_root,
        text=True,
    ).strip().splitlines()
    if not commits:
        raise CatalogCadenceAuditError("no git history for AMC movie products catalog")

    snapshots: list[dict] = []
    seen_generated: set[str] = set()
    for commit in commits:
        try:
            products_raw = subprocess.check_output(
                ["git", "show", f"{commit}:{PRODUCTS_REL}"],
                cwd=repo_root,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            continue
        products = json.loads(products_raw.decode("utf-8"))
        generated_at = str(products.get("generated_at") or "")
        if not generated_at or generated_at in seen_generated:
            continue
        seen_generated.add(generated_at)
        releases = None
        try:
            releases_raw = subprocess.check_output(
                ["git", "show", f"{commit}:{RELEASES_REL}"],
                cwd=repo_root,
                stderr=subprocess.DEVNULL,
            )
            releases = json.loads(releases_raw.decode("utf-8"))
        except subprocess.CalledProcessError:
            releases = None
        snapshots.append(
            {
                "label": generated_at,
                "commit": commit,
                "products_path": PRODUCTS_REL,
                "releases_path": RELEASES_REL if releases is not None else None,
                "products": products,
                "releases": releases,
            }
        )

    snapshots.sort(key=lambda item: str(item["label"]))
    if not snapshots:
        raise CatalogCadenceAuditError("git history yielded no distinct catalog snapshots")
    return snapshots


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 2

    try:
        notes: list[str] = []
        if args.snapshots_dir is not None:
            snapshots = _load_from_snapshots_dir(args.snapshots_dir)
            notes.append(f"Loaded pre-extracted snapshots from {args.snapshots_dir}")
        elif args.from_git:
            snapshots = _load_from_git(args.repo_root)
            notes.append(
                "Loaded distinct generated_at snapshots via read-only git show "
                "(same-day workflow reruns retained as separate generated_at values)."
            )
        else:
            root = args.repo_root
            products_path = args.products_path
            if not products_path.is_absolute():
                products_path = root / products_path
            releases_path = args.releases_path
            if not releases_path.is_absolute():
                releases_path = root / releases_path
            snapshots = [
                load_catalog_snapshot(
                    label="current",
                    products_path=products_path,
                    releases_path=releases_path if releases_path.is_file() else None,
                )
            ]
            notes.append("Current working-tree catalogs only (pass --from-git for history).")

        report = build_catalog_cadence_evaluation(
            snapshots,
            generated_at=args.generated_at,
            evidence_notes=notes,
        )
        paths = write_evaluation_outputs(report, args.output_dir)
    except CatalogCadenceAuditError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2

    classes = report["classifications"]
    window = report["evidence_window"]
    print(
        "AMC catalog cadence evaluation: "
        f"snapshots={window['snapshot_count']} "
        f"dates={window['distinct_catalog_calendar_date_count']} "
        f"refresh={classes['refresh_cadence']} "
        f"inactive={classes['inactive_growth']}"
    )
    print(f"Wrote {paths['json']}")
    print(f"Wrote {paths['markdown']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
