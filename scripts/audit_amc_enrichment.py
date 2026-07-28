#!/usr/bin/env python3
"""Read-only AMC enrichment coverage + join audit (T-ENR-AMC-R).

Uses committed local artifacts only. No AMC API calls. No secrets.

Examples:
  python scripts/audit_amc_enrichment.py
  python scripts/audit_amc_enrichment.py --output-dir data/audits
  python scripts/audit_amc_enrichment.py \\
    --products-path path/to/amc_movie_products.json \\
    --showtimes-path path/to/showtimes_current.json \\
    --generated-at 2026-07-25T00:00:00+00:00
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_enrichment_audit import (  # noqa: E402
    DEFAULT_PRODUCTS_REL,
    DEFAULT_RELEASES_REL,
    DEFAULT_SHOWTIMES_REL,
    EnrichmentAuditError,
    build_amc_enrichment_audit,
    write_audit_outputs,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit AMC durable-catalog enrichment fields vs public showtimes "
            "(read-only; no API secret)."
        )
    )
    parser.add_argument(
        "--products-path",
        type=Path,
        default=PROJECT_ROOT / DEFAULT_PRODUCTS_REL,
        help="AMC movie products catalog path.",
    )
    parser.add_argument(
        "--releases-path",
        type=Path,
        default=PROJECT_ROOT / DEFAULT_RELEASES_REL,
        help="AMC release observations catalog path (optional if missing).",
    )
    parser.add_argument(
        "--showtimes-path",
        type=Path,
        default=PROJECT_ROOT / DEFAULT_SHOWTIMES_REL,
        help="Public showtimes_current.json path.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=PROJECT_ROOT / "data" / "audits",
        help="Directory for amc_enrichment_coverage.json (not under public/).",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Optional fixed timestamp for deterministic output.",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Also print the JSON report to stdout.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = build_amc_enrichment_audit(
            products_path=args.products_path,
            releases_path=args.releases_path,
            showtimes_path=args.showtimes_path,
            generated_at=args.generated_at,
        )
    except EnrichmentAuditError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    out_path = write_audit_outputs(report, args.output_dir)
    join = report["join"]
    cat = report["catalog_coverage"]["fields"]
    print(
        "AMC enrichment audit written:",
        str(out_path).replace("\\", "/"),
    )
    print(
        "catalog products=",
        report["counts"]["catalog_products"],
        "current-window AMC ids=",
        report["counts"]["current_window_amc_source_film_ids"],
        "join success=",
        f"{join['join_success_film_keys']}/{join['showtime_film_keys_with_amc']}",
        f"({join['join_success_rate_percent']}%)",
    )
    print(
        "catalog synopsis=",
        f"{cat['synopsis']['present']}/{report['counts']['catalog_products']}",
        "genre=",
        f"{cat['genre']['present']}/{report['counts']['catalog_products']}",
        "mpaa=",
        f"{cat['mpaa_rating']['present']}/{report['counts']['catalog_products']}",
        "terms_gate=",
        report["terms_gate"]["status"],
    )
    if args.stdout:
        print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
