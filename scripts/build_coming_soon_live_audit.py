#!/usr/bin/env python3
"""Combine the live AMC and TMDB investigations into one Coming Soon audit.

Writes ``coming_soon_source_audit_live.json`` plus a concise Markdown summary.
The four evidence concepts stay independent in the output:
``amcComingSoonCatalog``, ``amcTheaterBooking``, ``tmdbUsTheatrical``, and
``reelSeattleScheduled``.

With ``--require-live`` the script fails when the run did not actually exercise
both credentialed sources, so a green job cannot be mistaken for a real test.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from reel_seattle.emit.coming_soon_live import (
    EVIDENCE_DEFINITIONS,
    STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES,
    STATUS_CONFIRMED_LOCAL_FUTURE,
    STATUS_CURRENTLY_AVAILABLE,
    STATUS_TMDB_ONLY_UPCOMING,
    build_live_audit,
)
from reel_seattle.live_audit_security import (
    write_sanitized_json,
    write_sanitized_text,
)

TARGET_TITLES = ("Verity", "Avengers: Doomsday", "Dune: Part Three")


def _load_json(path: Path | str) -> dict[str, Any] | None:
    file_path = Path(path)
    if not file_path.exists():
        return None
    return json.loads(file_path.read_text(encoding="utf-8"))


def _yes_no(value: Any) -> str:
    if value is None:
        return "unknown"
    return "yes" if value else "no"


def render_markdown(
    *,
    audit: Mapping[str, Any],
    amc: Mapping[str, Any] | None,
    tmdb: Mapping[str, Any] | None,
) -> str:
    counts = audit["counts"]
    horizons = audit["horizons"]
    lines: list[str] = []

    lines.append("# Coming Soon live source audit")
    lines.append("")
    lines.append(f"- Pacific date: `{audit['pacific_today']}`")
    lines.append(
        f"- Window: `{audit['window']['start_date']}` -> `{audit['window']['end_date']}` "
        f"({audit['window']['window_days']} days; current window "
        f"{audit['window']['current_window_days']} days)"
    )
    lines.append("")

    lines.append("## Credentialed sources")
    lines.append("")
    lines.append("| Source | Live | Reachable | Endpoint | Titles |")
    lines.append("| --- | --- | --- | --- | --- |")
    for key, source in audit["sources"].items():
        lines.append(
            f"| `{key}` | {_yes_no(source.get('live'))} | "
            f"{_yes_no(source.get('accessible')) if source.get('live') else 'n/a'} | "
            f"`{source.get('endpoint') or source.get('input')}` | {source.get('titles')} |"
        )
    lines.append("")

    lines.append("## AMC catalog investigation")
    lines.append("")
    if amc is None:
        lines.append("AMC investigation artifact missing.")
    else:
        auth = amc.get("credentials", {}).get("auth_probe", {})
        catalog = amc.get("catalog", {})
        zero = amc.get("zero_performance_analysis", {})
        national = amc.get("national_vs_theater_specific", {})
        lines.append(
            f"- Vendor auth (`{auth.get('probe_path')}`): status `{auth.get('status')}`, "
            f"authenticated **{_yes_no(auth.get('authenticated'))}**"
        )
        lines.append(
            f"- Catalog endpoint reachable: **{_yes_no(catalog.get('accessible'))}** "
            f"(`{catalog.get('selected_endpoint')}`)"
        )
        if catalog.get("exact_url_template"):
            lines.append(f"- Exact query: `{catalog['exact_url_template']}`")
        if catalog.get("title_count") is not None:
            lines.append(f"- Catalog titles collected: **{catalog.get('title_count')}**")
        pagination = catalog.get("pagination") or {}
        if pagination:
            lines.append(
                f"- Pagination: {pagination.get('pages_fetched')} pages at page-size "
                f"{pagination.get('page_size_reported') or pagination.get('page_size_requested')}, "
                f"`count`={pagination.get('total_count_field')}, "
                f"next links observed: {_yes_no(pagination.get('next_link_observed'))}, "
                f"exhausted: {_yes_no(pagination.get('exhausted'))}"
            )
        release_range = catalog.get("release_date_range") or {}
        if release_range:
            lines.append(
                f"- Release-date range: `{release_range.get('min')}` -> `{release_range.get('max')}` "
                f"({release_range.get('missing_release_date')} missing)"
            )
        ticket_fields = (catalog.get("field_inventory") or {}).get("ticket_or_showtime_fields")
        if ticket_fields is not None:
            lines.append(
                f"- Ticket/on-sale/showtime fields present: "
                f"{', '.join(f'`{name}`' for name in ticket_fields) or 'none'}"
            )
        field_signal = zero.get("field_signal") or {}
        if field_signal.get("titles_with_flag"):
            lines.append(
                f"- Titles with zero scheduled performances (`hasScheduledShowtimes=false`): "
                f"**{field_signal.get('titles_with_zero_scheduled_showtimes')}** of "
                f"{field_signal.get('titles_with_flag')}"
            )
        local_comparison = zero.get("local_comparison") or {}
        if local_comparison.get("catalog_titles"):
            lines.append(
                f"- Catalog titles with zero Seattle-area performances: "
                f"**{local_comparison.get('titles_with_zero_known_local_performances')}** of "
                f"{local_comparison.get('catalog_titles')}"
            )
        per_movie = zero.get("live_per_movie_probe") or {}
        if per_movie.get("usable"):
            lines.append(
                f"- Per-movie performance endpoint `{per_movie.get('path_template')}` usable; "
                f"zero-performance titles in sample: "
                f"{per_movie.get('titles_with_zero_performances_national')}/{per_movie.get('sample_size')}"
            )
        else:
            lines.append("- Per-movie performance endpoint: none responded 200")
        lines.append(f"- National vs theater-specific: {national.get('behavior') or 'not determined'}")
        lines.append("")
        lines.append("### Target titles (catalog evidence vs theater bookings)")
        lines.append("")
        lines.append("| Title | In AMC catalog | Slug lookup | AMC theater booking | Independent of bookings |")
        lines.append("| --- | --- | --- | --- | --- |")
        for title in TARGET_TITLES:
            target = (amc.get("target_titles") or {}).get(title) or {}
            lines.append(
                f"| {title} | {_yes_no(target.get('in_amc_coming_soon_catalog'))} | "
                f"{_yes_no((target.get('slug_lookup') or {}).get('found'))} | "
                f"{_yes_no(target.get('amc_theater_booking_present'))} | "
                f"{_yes_no(target.get('appears_independently_of_theater_bookings'))} |"
            )
    lines.append("")

    lines.append("## TMDB US theatrical investigation")
    lines.append("")
    if tmdb is None:
        lines.append("TMDB investigation artifact missing.")
    else:
        query = tmdb.get("query", {})
        tmdb_counts = tmdb.get("counts", {})
        pagination = tmdb.get("pagination", {})
        lines.append(f"- Query executed: **{_yes_no(query.get('executed'))}**")
        lines.append(
            f"- `GET {query.get('endpoint')}` region=`{query.get('region')}` "
            f"release types=`{query.get('release_types')}` "
            f"window `{(query.get('window') or {}).get('start_date')}` -> "
            f"`{(query.get('window') or {}).get('end_date')}`"
        )
        lines.append(
            f"- Pagination: {pagination.get('pages_fetched')} pages fetched of "
            f"{pagination.get('total_pages_reported')} reported "
            f"({pagination.get('total_results_reported')} total results)"
        )
        lines.append(f"- Raw candidates: **{tmdb_counts.get('raw_candidates')}**")
        lines.append(f"- Valid candidates: **{tmdb_counts.get('valid_candidates')}**")
        lines.append(
            f"- AMC overlap: catalog **{tmdb_counts.get('amc_coming_soon_catalog_overlap')}**, "
            f"theater bookings **{tmdb_counts.get('amc_theater_booking_overlap')}**, "
            f"either **{tmdb_counts.get('amc_overlap_any')}**"
        )
        lines.append(f"- Reel Seattle overlap: **{tmdb_counts.get('reel_seattle_overlap')}**")
        lines.append(f"- TMDB-only: **{tmdb_counts.get('tmdb_only')}**")
        lines.append(
            f"- Poster availability: {tmdb_counts.get('with_poster')} with poster, "
            f"{tmdb_counts.get('without_poster')} without"
        )
        lines.append(f"- Questionable candidates: **{tmdb_counts.get('questionable_candidates')}**")
        lines.append("")
        representative = tmdb.get("representative_tmdb_only_titles") or []
        if representative:
            lines.append("### Representative TMDB-only titles")
            lines.append("")
            lines.append("| Title | Release | Popularity | Poster |")
            lines.append("| --- | --- | --- | --- |")
            for candidate in representative[:15]:
                lines.append(
                    f"| {candidate.get('title')} | `{candidate.get('release_date')}` | "
                    f"{candidate.get('popularity')} | {_yes_no(candidate.get('has_poster'))} |"
                )
            lines.append("")
        questionable = tmdb.get("questionable_candidates") or []
        if questionable:
            lines.append("### Questionable candidates")
            lines.append("")
            lines.append("| Title | Release | Flags |")
            lines.append("| --- | --- | --- |")
            for candidate in questionable[:10]:
                lines.append(
                    f"| {candidate.get('title')} | `{candidate.get('release_date')}` | "
                    f"{', '.join(candidate.get('quality_flags') or [])} |"
                )
            lines.append("")

    lines.append("## Combined evidence counts")
    lines.append("")
    lines.append("| Bucket | Count |")
    lines.append("| --- | --- |")
    for bucket in (
        STATUS_CURRENTLY_AVAILABLE,
        STATUS_CONFIRMED_LOCAL_FUTURE,
        STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES,
        STATUS_TMDB_ONLY_UPCOMING,
    ):
        lines.append(f"| `{bucket}` | {counts.get(bucket)} |")
    lines.append(f"| `unclassified` | {counts.get('unclassified')} |")
    lines.append(f"| **total entries** | {counts.get('total_entries')} |")
    lines.append("")
    lines.append("Evidence totals (independent flags, titles may carry several):")
    lines.append("")
    for key, total in audit["evidence_totals"].items():
        lines.append(f"- `{key}`: {total}")
    lines.append("")

    lines.append("## Horizons")
    lines.append("")
    lines.append(
        "| Horizon | currently_available | confirmed_local_future | "
        "amc_announced_without_local_showtimes | tmdb_only_upcoming | total |"
    )
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for label, bucket in horizons.items():
        lines.append(
            f"| {label.replace('_', ' ')} | {bucket.get(STATUS_CURRENTLY_AVAILABLE)} | "
            f"{bucket.get(STATUS_CONFIRMED_LOCAL_FUTURE)} | "
            f"{bucket.get(STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES)} | "
            f"{bucket.get(STATUS_TMDB_ONLY_UPCOMING)} | {bucket.get('total_in_horizon')} |"
        )
    lines.append("")

    lines.append("## Evidence definitions")
    lines.append("")
    for key, definition in EVIDENCE_DEFINITIONS.items():
        lines.append(f"- `{key}`: {definition}")
    lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="audit-output")
    parser.add_argument("--amc-investigation", default=None)
    parser.add_argument("--tmdb-investigation", default=None)
    parser.add_argument("--amc-log", default=None, help="AMC daily scrape log (defaults to newest)")
    parser.add_argument("--logs-dir", default="data/daily_logs")
    parser.add_argument("--showtimes", default="public/data/showtimes_current.json")
    parser.add_argument("--window-days", type=int, default=90)
    parser.add_argument("--current-window-days", type=int, default=7)
    parser.add_argument(
        "--require-live",
        action="store_true",
        help="Fail unless AMC vendor auth succeeded and the TMDB query executed",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    amc_path = Path(args.amc_investigation or output_dir / "amc_coming_soon_endpoint_investigation.json")
    tmdb_path = Path(args.tmdb_investigation or output_dir / "tmdb_us_theatrical_investigation.json")

    amc = _load_json(amc_path)
    tmdb = _load_json(tmdb_path)

    if args.amc_log:
        amc_log_path = Path(args.amc_log)
    else:
        logs = sorted(Path(args.logs_dir).glob("*_amc.json"))
        amc_log_path = logs[-1] if logs else Path(args.logs_dir) / "missing_amc.json"

    audit = build_live_audit(
        amc_investigation=amc,
        tmdb_investigation=tmdb,
        amc_log_path=amc_log_path,
        showtimes_current_path=args.showtimes,
        window_days=args.window_days,
        current_window_days=args.current_window_days,
    )

    audit_path = output_dir / "coming_soon_source_audit_live.json"
    write_sanitized_json(audit_path, audit)
    print(f"Wrote {audit_path}")

    summary = render_markdown(audit=audit, amc=amc, tmdb=tmdb)
    summary_path = output_dir / "coming_soon_live_audit_summary.md"
    write_sanitized_text(summary_path, summary)
    print(f"Wrote {summary_path}")

    print(json.dumps(audit["counts"], indent=2))
    print(json.dumps(audit["horizons"], indent=2))

    amc_authenticated = bool(((amc or {}).get("credentials") or {}).get("auth_probe", {}).get("authenticated"))
    tmdb_executed = bool(((tmdb or {}).get("query") or {}).get("executed"))
    print(f"AMC vendor auth succeeded: {amc_authenticated}")
    print(f"TMDB discover executed: {tmdb_executed}")

    if args.require_live and not (amc_authenticated and tmdb_executed):
        print(
            "ERROR: --require-live set but the run did not exercise both credentialed "
            f"sources (amc_authenticated={amc_authenticated}, tmdb_executed={tmdb_executed})",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
