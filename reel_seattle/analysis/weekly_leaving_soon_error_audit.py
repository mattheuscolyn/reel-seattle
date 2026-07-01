"""False-positive error audit for weekly Leaving Soon evaluation (PR D4)."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_eval import PredictFn
from reel_seattle.analysis.special_screening_flags import classify_run_type

ERROR_AUDIT_FIELDNAMES = [
    "error_type",
    "rule_id",
    "anchor_date",
    "anchor_month",
    "showtime_film_key",
    "film_title",
    "leaving_soon_label",
    "predicted_leaving_soon",
    "current_week_showtime_count",
    "current_week_theater_count",
    "current_week_visible_days",
    "prior_week_showtime_count",
    "prior_week_theater_count",
    "showtime_count_change_vs_prior_week",
    "peak_week_showtime_count_to_date",
    "peak_week_theater_count_to_date",
    "current_showtime_pct_of_peak",
    "current_theater_pct_of_peak",
    "weeks_since_first_seen",
    "run_segment",
    "run_type",
    "strict_event_like_flag",
    "flag_family_holiday_like",
    "flag_holiday_rerelease_like",
    "flag_awards_limited_like",
    "flag_anime_event_like",
    "flag_probable_normal_first_run",
    "extended_briefly",
    "notes",
]


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def _extended_briefly(row: Mapping[str, str]) -> str:
    """Heuristic: film got following week but with very small footprint."""
    if _parse_bool(row.get("gets_following_week_showtimes", "false")):
        following = int(row.get("following_week_showtime_count", "0") or 0)
        if following <= 3:
            return "true"
        return "false"
    return "false"


def build_error_audit_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    rule_id: str,
    predict: PredictFn,
    error_types: Sequence[str] = ("false_positive", "false_negative"),
) -> list[dict[str, str]]:
    audit_rows: list[dict[str, str]] = []
    for row in rows:
        predicted = predict(row)
        actual = _parse_bool(row["leaving_soon_label"])
        if predicted and not actual and "false_positive" in error_types:
            error_type = "false_positive"
        elif not predicted and actual and "false_negative" in error_types:
            error_type = "false_negative"
        else:
            continue
        anchor_month = row["anchor_date"][:7]
        run_type = row.get("run_type") or classify_run_type(
            row.get("film_title", ""),
            anchor_month=anchor_month,
        )
        audit_rows.append(
            {
                "error_type": error_type,
                "rule_id": rule_id,
                "anchor_date": row["anchor_date"],
                "anchor_month": anchor_month,
                "showtime_film_key": row.get("showtime_film_key", ""),
                "film_title": row.get("film_title", ""),
                "leaving_soon_label": row.get("leaving_soon_label", ""),
                "predicted_leaving_soon": "true" if predicted else "false",
                "current_week_showtime_count": row.get("current_week_showtime_count", ""),
                "current_week_theater_count": row.get("current_week_theater_count", ""),
                "current_week_visible_days": row.get("current_week_visible_days", ""),
                "prior_week_showtime_count": row.get("prior_week_showtime_count", ""),
                "prior_week_theater_count": row.get("prior_week_theater_count", ""),
                "showtime_count_change_vs_prior_week": row.get(
                    "showtime_count_change_vs_prior_week", ""
                ),
                "peak_week_showtime_count_to_date": row.get(
                    "peak_week_showtime_count_to_date", ""
                ),
                "peak_week_theater_count_to_date": row.get(
                    "peak_week_theater_count_to_date", ""
                ),
                "current_showtime_pct_of_peak": row.get("current_showtime_pct_of_peak", ""),
                "current_theater_pct_of_peak": row.get("current_theater_pct_of_peak", ""),
                "weeks_since_first_seen": row.get("weeks_since_first_seen", ""),
                "run_segment": row.get("run_segment", ""),
                "run_type": run_type,
                "strict_event_like_flag": row.get("strict_event_like_flag", ""),
                "flag_family_holiday_like": row.get("flag_family_holiday_like", ""),
                "flag_holiday_rerelease_like": row.get("flag_holiday_rerelease_like", ""),
                "flag_awards_limited_like": row.get("flag_awards_limited_like", ""),
                "flag_anime_event_like": row.get("flag_anime_event_like", ""),
                "flag_probable_normal_first_run": row.get("flag_probable_normal_first_run", ""),
                "extended_briefly": _extended_briefly(row),
                "notes": _audit_notes(row, run_type),
            }
        )
    audit_rows.sort(key=lambda item: (item["anchor_date"], item["film_title"]))
    return audit_rows


def _audit_notes(row: Mapping[str, str], run_type: str) -> str:
    if run_type == "family_holiday_title":
        return "Holiday classic with low footprint; often extends through December."
    if run_type in {"holiday_re_release", "classic_revival"}:
        return "Re-release/engagement pattern; low footprint may not mean leaving."
    if run_type == "awards_season_limited":
        return "Awards-season limited engagement; footprint can rebound."
    if run_type == "anime_special_engagement":
        return "Anime/special engagement with intermittent booking extensions."
    if _parse_bool(row.get("flag_probable_normal_first_run", "false")):
        return "Looks like normal first-run; review rule thresholds."
    return "Special/limited scheduling pattern suspected."


def summarize_false_positive_audit(audit_rows: Sequence[Mapping[str, str]]) -> dict[str, Any]:
    fps = [row for row in audit_rows if row["error_type"] == "false_positive"]
    by_month: dict[str, int] = {}
    by_run_type: dict[str, int] = {}
    by_segment: dict[str, int] = {}
    for row in fps:
        by_month[row["anchor_month"]] = by_month.get(row["anchor_month"], 0) + 1
        by_run_type[row["run_type"]] = by_run_type.get(row["run_type"], 0) + 1
        by_segment[row["run_segment"]] = by_segment.get(row["run_segment"], 0) + 1
    return {
        "false_positive_count": len(fps),
        "false_negative_count": sum(
            1 for row in audit_rows if row["error_type"] == "false_negative"
        ),
        "by_anchor_month": dict(sorted(by_month.items())),
        "by_run_type": dict(sorted(by_run_type.items(), key=lambda item: -item[1])),
        "by_run_segment": dict(sorted(by_segment.items(), key=lambda item: -item[1])),
    }


def write_error_audit_csv(path: Path, audit_rows: Sequence[Mapping[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=ERROR_AUDIT_FIELDNAMES)
        writer.writeheader()
        writer.writerows(audit_rows)
