#!/usr/bin/env python3
"""Shadow-evaluate today's automatic TMDB matcher against human confirmations.

Read-only: never writes authored/admin decision files or public film IDs.

Usage:
  python scripts/shadow_evaluate_tmdb_matcher.py
  python scripts/shadow_evaluate_tmdb_matcher.py --via-production-proxy
  python scripts/shadow_evaluate_tmdb_matcher.py --json-stdout
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Mapping

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.cache import TmdbResponseCache  # noqa: E402
from reel_seattle.film_identity.constants import (  # noqa: E402
    ADMIN_OVERRIDES_REL,
    CATALOG_REL,
    DECISIONS_REL,
    SHADOW_EVAL_REL,
    SHADOW_EVAL_SUMMARY_REL,
)
from reel_seattle.film_identity.decisions import (  # noqa: E402
    load_admin_override_decisions,
    load_decisions,
)
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.inventory import inventory_source_identities  # noqa: E402
from reel_seattle.film_identity.io_util import atomic_write_json  # noqa: E402
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage  # noqa: E402
from reel_seattle.film_identity.shadow_eval import (  # noqa: E402
    build_shadow_summary_markdown,
    compare_shadow_metrics,
    run_shadow_evaluation,
)
from reel_seattle.film_identity.tmdb_client import (  # noqa: E402
    TmdbAuthError,
    TmdbClient,
    describe_auth_mode,
    resolve_tmdb_auth,
)

DEFAULT_PROXY_BASE = (
    "https://jnxhnvbwzsnhenuhsaje.supabase.co/functions/v1/tmdb-api"
)


class ProductionProxyTmdbClient:
    """Best-effort TMDB client via the public production Edge Function.

    Used only when local TMDB secrets are unavailable. Not bit-identical to
    ``TmdbClient`` (search capped at 5; year filtered locally after search).
    """

    def __init__(self, base_url: str = DEFAULT_PROXY_BASE) -> None:
        self.base_url = base_url.rstrip("/")

    def search_movie(self, query: str, *, year: int | None = None, page: int = 1) -> dict[str, Any]:
        _ = page
        params = {"action": "search", "query": query, "limit": "5"}
        payload = self._get(params)
        results = list(payload.get("results") or [])
        if isinstance(year, int):
            filtered = []
            for row in results:
                release = str(row.get("release_date") or "")
                if len(release) >= 4 and release[:4].isdigit() and int(release[:4]) == year:
                    filtered.append(row)
            results = filtered
        return {"results": results}

    def movie_details(self, tmdb_id: int) -> dict[str, Any]:
        payload = self._get({"action": "movie", "id": str(int(tmdb_id))})
        # Shape into the fields enrich_candidate_from_details expects.
        return {
            "id": payload.get("id"),
            "title": payload.get("title"),
            "original_title": payload.get("original_title"),
            "release_date": payload.get("release_date"),
            "runtime": payload.get("runtime"),
            "overview": payload.get("overview"),
            "poster_path": payload.get("poster_path"),
            "credits": payload.get("credits") or {"crew": []},
            "external_ids": {},
        }

    def _get(self, params: Mapping[str, str]) -> dict[str, Any]:
        url = f"{self.base_url}?{urllib.parse.urlencode(dict(params))}"
        request = urllib.request.Request(
            url,
            headers={"Accept": "application/json"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"production TMDB proxy HTTP {exc.code}") from exc
        payload = json.loads(raw) if raw else {}
        if not isinstance(payload, dict):
            raise RuntimeError("production TMDB proxy returned non-object JSON")
        if "error" in payload and "results" not in payload and "id" not in payload:
            raise RuntimeError(f"production TMDB proxy error: {payload.get('error')}")
        return payload


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--showtimes-path", type=Path, default=None)
    parser.add_argument("--products-path", type=Path, default=None)
    parser.add_argument(
        "--decisions-path",
        type=Path,
        default=PROJECT_ROOT / DECISIONS_REL,
    )
    parser.add_argument(
        "--admin-overrides-path",
        type=Path,
        default=PROJECT_ROOT / ADMIN_OVERRIDES_REL,
    )
    parser.add_argument(
        "--catalog-path",
        type=Path,
        default=PROJECT_ROOT / CATALOG_REL,
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=PROJECT_ROOT / SHADOW_EVAL_REL,
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        default=PROJECT_ROOT / SHADOW_EVAL_SUMMARY_REL,
    )
    parser.add_argument(
        "--via-production-proxy",
        action="store_true",
        help=(
            "Use the public production TMDB Edge Function when local TMDB "
            "secrets are missing (approximate; search limit 5)."
        ),
    )
    parser.add_argument(
        "--proxy-base",
        default=DEFAULT_PROXY_BASE,
        help="Override production TMDB proxy base URL.",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Ignore cached TMDB responses (live auth mode only).",
    )
    parser.add_argument(
        "--json-stdout",
        action="store_true",
        help="Also print the full JSON report to stdout.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap on confirm cases for debugging.",
    )
    parser.add_argument(
        "--compare-baseline",
        type=Path,
        default=None,
        help=(
            "Optional baseline metrics JSON (fixture or prior audit) for "
            "before/after headline comparison."
        ),
    )
    return parser.parse_args(argv)


def _load_catalog(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as handle:
        doc = json.load(handle)
    if not isinstance(doc, dict):
        raise ValueError(f"catalog is not an object: {path}")
    return doc


def main(argv: list[str] | None = None) -> int:
    load_dotenv_local(PROJECT_ROOT)
    args = parse_args(argv)

    authored = load_decisions(args.decisions_path)
    admin = load_admin_override_decisions(args.admin_overrides_path)
    catalog = _load_catalog(args.catalog_path)
    inventory = inventory_source_identities(
        showtimes_path=args.showtimes_path,
        products_path=args.products_path,
        root=PROJECT_ROOT,
    )
    identities = list(inventory.get("identities") or [])

    client: Any
    tmdb_mode: str
    try:
        auth = resolve_tmdb_auth(require=True)
        tmdb_mode = f"live:{describe_auth_mode(auth)}"
        client = TmdbClient(
            auth,
            cache=TmdbResponseCache(PROJECT_ROOT),
            refresh=args.refresh_cache,
        )
        print(f"TMDB mode: {tmdb_mode}")
    except TmdbAuthError:
        if not args.via_production_proxy:
            print(
                "Missing TMDB credentials. Set TMDB_READ_ACCESS_TOKEN or "
                "TMDB_API_KEY, or pass --via-production-proxy for an "
                "approximate audit against the public Edge Function.",
                file=sys.stderr,
            )
            return 2
        tmdb_mode = "production_proxy_approximate"
        client = ProductionProxyTmdbClient(args.proxy_base)
        print(
            "TMDB mode: production_proxy_approximate "
            "(search limit 5; year filtered locally)"
        )

    # Optional debug limit applied after ground-truth collection inside runner
    # by trimming identities? Better: trim confirm cases via wrapper.
    report = run_shadow_evaluation(
        identities=identities,
        authored_doc=authored,
        admin_doc=admin,
        catalog=catalog,
        client=client,
        tmdb_mode=tmdb_mode,
    )
    if args.limit is not None:
        report["movie_confirm_cases"] = list(report["movie_confirm_cases"])[: max(0, args.limit)]
        from reel_seattle.film_identity.shadow_eval import aggregate_movie_metrics

        report["movie_confirm_metrics"] = aggregate_movie_metrics(
            report["movie_confirm_cases"]
        )

    assert_no_tmdb_secret_leakage(report)
    markdown = build_shadow_summary_markdown(report)
    assert_no_tmdb_secret_leakage({"summary": markdown})

    atomic_write_json(args.output_json, report)
    args.output_md.parent.mkdir(parents=True, exist_ok=True)
    args.output_md.write_text(
        markdown if markdown.endswith("\n") else markdown + "\n",
        encoding="utf-8",
    )

    metrics = report["movie_confirm_metrics"]
    program = report["program_decision_metrics"]
    print(
        "Shadow movie confirms: "
        f"evaluated={metrics['evaluated']} "
        f"exact_auto={metrics['exact_automatic_agreement']} "
        f"({metrics['exact_automatic_agreement_pct']}%) "
        f"auto_correct={metrics['auto_confirmed_correct']} "
        f"review_top_correct={metrics['review_required_top_correct']} "
        f"wrong_top={metrics['wrong_top_candidate']} "
        f"not_found={metrics['correct_candidate_not_found']} "
        f"unresolved={metrics['unresolved_no_viable_candidate']}"
    )
    print(
        "Shadow program decisions: "
        f"evaluated={program['evaluated']} "
        f"classified_correct={program['classified_correctly']} "
        f"movie_path={program['incorrectly_enters_movie_matching_or_review']}"
    )
    print(f"Wrote {args.output_json.relative_to(PROJECT_ROOT)}")
    print(f"Wrote {args.output_md.relative_to(PROJECT_ROOT)}")
    if args.compare_baseline:
        baseline_doc = json.loads(args.compare_baseline.read_text(encoding="utf-8"))
        comparison = compare_shadow_metrics(baseline_doc, report)
        report["baseline_comparison"] = comparison
        atomic_write_json(args.output_json, report)
        print("Baseline comparison (movie confirms):")
        for key, row in (comparison.get("headline") or {}).items():
            print(
                f"  {key}: {row.get('before')} → {row.get('after')} "
                f"(delta={row.get('delta')})"
            )
        print("NWFF:")
        for key, row in (comparison.get("nwff") or {}).items():
            print(
                f"  {key}: {row.get('before')} → {row.get('after')} "
                f"(delta={row.get('delta')})"
            )
    if args.json_stdout:
        print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
