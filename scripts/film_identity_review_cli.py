#!/usr/bin/env python3
"""CLI bridge for Film Identity Review cockpit diagnostics (local-only)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.review_diagnostics import (  # noqa: E402
    build_review_pack,
    export_review_report,
    live_explain,
    load_review_notes,
    propose_normalization_rule,
    redact_secrets,
    save_review_note,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Film identity review diagnostics CLI")
    parser.add_argument(
        "command",
        choices=[
            "pack",
            "explain",
            "experimental",
            "notes-get",
            "notes-set",
            "export",
            "propose-rule",
        ],
    )
    parser.add_argument("--stdin-json", action="store_true", help="Read JSON body from stdin")
    parser.add_argument("--record-id", default=None)
    parser.add_argument("--title", default=None)
    parser.add_argument("--runtime", type=int, default=None)
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--directors", default=None)
    parser.add_argument("--search-title", default=None)
    parser.add_argument("--include-year", action="store_true", default=None)
    parser.add_argument("--no-year", action="store_true")
    parser.add_argument("--notes", default=None)
    parser.add_argument("--category", default=None)
    parser.add_argument("--offline-candidates-json", type=Path, default=None)
    return parser.parse_args(argv)


def _read_body(args: argparse.Namespace) -> dict[str, Any]:
    if args.stdin_json:
        raw = sys.stdin.read() or "{}"
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise SystemExit("stdin JSON must be an object")
        return data
    return {}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    body = _read_body(args)
    try:
        if args.command == "pack":
            pack = build_review_pack(PROJECT_ROOT)
            print(json.dumps({"ok": True, "counts": pack["counts"], "pack": pack}))
            return 0

        if args.command == "notes-get":
            print(json.dumps(load_review_notes(PROJECT_ROOT)))
            return 0

        if args.command == "notes-set":
            record_id = body.get("record_id") or args.record_id
            if not record_id:
                raise SystemExit("record_id required")
            doc = save_review_note(
                PROJECT_ROOT,
                record_id=str(record_id),
                diagnostic_category=body.get("diagnostic_category") or args.category,
                notes=body.get("notes") if "notes" in body else args.notes,
                normalization_proposal=body.get("normalization_proposal"),
            )
            print(json.dumps({"ok": True, "notes": doc}))
            return 0

        if args.command in {"explain", "experimental"}:
            title = body.get("source_title") or args.title
            if not title:
                raise SystemExit("source_title/title required")
            include_year = True
            if args.no_year or body.get("include_year") is False:
                include_year = False
            if args.include_year:
                include_year = True
            offline = None
            if args.offline_candidates_json:
                offline = json.loads(args.offline_candidates_json.read_text(encoding="utf-8"))
                if isinstance(offline, dict):
                    offline = offline.get("candidates")
            elif body.get("offline_candidates") is not None:
                offline = body.get("offline_candidates")
            payload = live_explain(
                PROJECT_ROOT,
                source_title=str(title),
                runtime_min=body.get("runtime_min", args.runtime),
                directors_raw=body.get("directors_raw", args.directors),
                product_year=body.get("year", args.year),
                include_year=include_year,
                experimental_title=body.get("search_title", args.search_title),
                experimental=args.command == "experimental",
                offline_candidates=offline,
            )
            print(json.dumps(payload))
            return 0 if not payload.get("error") else 1

        if args.command == "export":
            pack = body.get("pack")
            if not pack:
                pack = build_review_pack(PROJECT_ROOT)
            paths = export_review_report(
                PROJECT_ROOT,
                records=pack.get("records") or [],
                explains=body.get("explains") or {},
            )
            print(json.dumps({"ok": True, **paths}))
            return 0

        if args.command == "propose-rule":
            pack = build_review_pack(PROJECT_ROOT)
            proposal = propose_normalization_rule(
                original_title=str(body.get("original_title") or args.title or ""),
                proposed_base_title=str(
                    body.get("proposed_base_title") or args.search_title or ""
                ),
                records=pack.get("records") or [],
            )
            print(json.dumps({"ok": True, "proposal": proposal}))
            return 0

        raise SystemExit(f"Unknown command {args.command}")
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": redact_secrets(str(exc))}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
