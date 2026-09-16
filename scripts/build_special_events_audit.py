#!/usr/bin/env python3
"""Build data/audits/special_events_current.json from public showtimes + recent logs.

Read-only inventory of product Special Events classifications. Does not ship to
public/data or dist.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reel_seattle.analysis.special_event import (  # noqa: E402
    METHOD_NAME,
    METHOD_VERSION,
    SCHEMA_VERSION,
    classify_special_event,
)
from reel_seattle.normalize import DEFAULT_TIMEZONE  # noqa: E402

PUBLIC_SHOWTIMES = ROOT / "public" / "data" / "showtimes_current.json"
LOGS_DIR = ROOT / "data" / "daily_logs"
OUTPUT_PATH = ROOT / "data" / "audits" / "special_events_current.json"


def _amc_codes_index(log_paths: list[Path]) -> dict[tuple[str, str, str], list[str]]:
    """Map (title_raw, date_raw, theater_name_raw) -> attribute codes from logs."""
    index: dict[tuple[str, str, str], list[str]] = {}
    for path in log_paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        for rec in data.get("records") or []:
            attrs = rec.get("attributes") or {}
            amc_attrs = attrs.get("amc_attributes") or []
            codes = [
                str(item.get("code")).upper()
                for item in amc_attrs
                if isinstance(item, dict) and item.get("code")
            ]
            if not codes:
                continue
            key = (
                str(rec.get("title_raw") or ""),
                str(rec.get("date_raw") or ""),
                str(rec.get("theater_name_raw") or ""),
            )
            index[key] = codes
    return index


def main() -> None:
    pub = json.loads(PUBLIC_SHOWTIMES.read_text(encoding="utf-8"))
    showtimes = pub.get("showtimes") or []
    amc_logs = sorted(LOGS_DIR.glob("*_amc.json"))[-5:]
    code_index = _amc_codes_index(amc_logs)

    # Also classify recent SIFF/Beacon/etc titles outside the public window.
    out_of_window: list[dict] = []
    for path in sorted(LOGS_DIR.glob("2026-09-1*_*.json")):
        if path.name.endswith("_amc.json"):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for rec in data.get("records") or []:
            title = str(rec.get("title_raw") or "")
            payload = classify_special_event(title=title, source_title=title)
            if payload.get("is_special_event") or payload.get("audit_signals"):
                out_of_window.append(
                    {
                        "log": path.name,
                        "title": title,
                        "date_raw": rec.get("date_raw"),
                        "theater": rec.get("theater_name_raw"),
                        "special_event": payload,
                    }
                )

    candidates = []
    ambiguous = []
    false_positives_avoided = []
    type_counts: Counter[str] = Counter()
    high_count = 0

    for row in showtimes:
        title = row.get("source_title") or row.get("film_title") or ""
        # Approximate AMC log join for attribute enrichment in the audit only.
        codes = []
        if row.get("source") == "amc":
            # date in public is ISO; logs use MM/DD/YYYY
            iso = row.get("date") or ""
            if iso:
                y, m, d = iso.split("-")
                date_raw = f"{m}/{d}/{y}"
            else:
                date_raw = ""
            # Theater name not on public row; try title+date only soft match later.
            for (t, dr, _th), c in code_index.items():
                if t == title and dr == date_raw:
                    codes = c
                    break

        payload = classify_special_event(
            title=row.get("film_title"),
            source_title=row.get("source_title"),
            attribute_codes=codes,
            format_tags=row.get("format_tags") or [],
        )

        entry = {
            "showtime_id": row.get("id"),
            "theater_id": row.get("theater_id"),
            "date": row.get("date"),
            "time": row.get("time"),
            "source": row.get("source"),
            "source_title": row.get("source_title"),
            "film_title": row.get("film_title"),
            "parent_display_title": row.get("parent_display_title"),
            "parent_film_key": row.get("parent_film_key"),
            "format_tags": row.get("format_tags") or [],
            "screening_variant_type": row.get("screening_variant_type"),
            "is_special_screening": row.get("is_special_screening"),
            "attribute_codes_from_log": codes,
            "special_event": payload,
        }

        if payload.get("is_special_event"):
            candidates.append(entry)
            high_count += 1 if payload.get("confidence") == "high" else 0
            for event_type in payload.get("types") or []:
                type_counts[event_type] += 1
        elif payload.get("audit_signals"):
            ambiguous.append(entry)
        elif row.get("screening_variant_type") not in (
            None,
            "none",
            "format_variant",
            "normal_first_run",
        ) or row.get("is_special_screening"):
            # Legacy analysis flags that the product classifier rejected.
            false_positives_avoided.append(
                {
                    "showtime_id": row.get("id"),
                    "theater_id": row.get("theater_id"),
                    "date": row.get("date"),
                    "source_title": row.get("source_title") or row.get("film_title"),
                    "screening_variant_type": row.get("screening_variant_type"),
                    "is_special_screening": row.get("is_special_screening"),
                    "reason": "legacy_analysis_variant_without_product_event",
                }
            )

    # Cap large avoided lists for readability.
    false_positives_avoided = false_positives_avoided[:80]

    examples_by_type: dict[str, list[dict]] = defaultdict(list)
    for entry in candidates:
        for event_type in entry["special_event"].get("types") or []:
            if len(examples_by_type[event_type]) < 5:
                examples_by_type[event_type].append(
                    {
                        "date": entry["date"],
                        "theater_id": entry["theater_id"],
                        "source_title": entry["source_title"] or entry["film_title"],
                        "labels": entry["special_event"].get("labels"),
                        "format_tags": entry["format_tags"],
                        "parent_display_title": entry["parent_display_title"],
                    }
                )

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(
            timespec="seconds"
        ),
        "timezone": DEFAULT_TIMEZONE,
        "method": {
            "name": METHOD_NAME,
            "version": METHOD_VERSION,
            "description": (
                "Screening-level product Special Events classification for Explore. "
                "Uses explicit title/description wording and specific AMC attribute "
                "codes. Does not publish format, accessibility, language, anniversary, "
                "or generic EVENT/ALTERNATIVECONTENT alone."
            ),
        },
        "sources": {
            "showtimes_current": str(PUBLIC_SHOWTIMES.as_posix()),
            "amc_logs_sampled": [p.name for p in amc_logs],
        },
        "stats": {
            "showtimes_inspected": len(showtimes),
            "high_confidence_special_events": sum(
                1
                for c in candidates
                if c["special_event"].get("confidence") == "high"
            ),
            "published_special_event_showtimes": len(candidates),
            "ambiguous_or_audit_only": len(ambiguous),
            "legacy_false_positive_samples": len(false_positives_avoided),
            "type_counts": dict(sorted(type_counts.items())),
            "out_of_window_log_hits": len(out_of_window),
        },
        "taxonomy": {
            "published_types": [
                "q_and_a",
                "intro_or_discussion",
                "early_access",
                "sneak_preview",
                "opening_night",
                "fan_event",
                "mystery_screening",
                "special_presentation",
                "other_event",
            ],
            "audit_only": [
                "concert_or_event_cinema",
                "double_feature",
                "generic_event_attribute",
                "anniversary_only",
                "ambiguous_wording",
            ],
            "recommendations": {
                "double_features": "audit_only — not Explore Special Events alone",
                "sing_alongs": "publish as other_event",
                "live_score": "prefer Special Presentations / format orthognality; audit until dedicated live-score copy exists",
                "concert_met_nt_live": "exclude from Special Events — event cinema / Special Presentations",
                "festival_screenings": "exclude unless explicit Q&A/guest/intro wording",
                "anniversary_events": "exclude unless explicit opening-night / Q&A / fan-event wording",
                "premieres": "publish when premiere event / opening night wording is explicit",
                "community_screenings": "publish as other_event when explicit",
            },
        },
        "examples_by_type": dict(examples_by_type),
        "candidates": candidates,
        "ambiguous": ambiguous[:100],
        "false_positives_avoided_sample": false_positives_avoided,
        "out_of_window_indie_hits": out_of_window[:40],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(artifact["stats"], indent=2))


if __name__ == "__main__":
    main()
