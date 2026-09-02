"""Tests for opening_this_week_current.json emission."""

from __future__ import annotations

import copy
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.opening_this_week import (
    OpeningOverride,
    BOOTSTRAP_DAYS,
    OPENING_THIS_WEEK_SCHEMA_VERSION,
    build_opening_this_week_current,
    classify_opening_type,
    load_opening_overrides,
    week_bounds,
    write_opening_this_week_current,
)
from reel_seattle.normalize import format_date_csv, showtime_film_key
from reel_seattle.validate import (
    SchemaValidationError,
    validate_opening_this_week_current,
)

PACIFIC = ZoneInfo("America/Los_Angeles")
# Wednesday mid-week reference → week Mon 2026-06-22 .. Sun 2026-06-28
REFERENCE = date(2026, 6, 24)
WEEK_START, WEEK_END = week_bounds(REFERENCE)
GENERATED_AT = datetime(2026, 6, 24, 12, 0, 0, tzinfo=PACIFIC)

MATURE_COVERAGE_START = REFERENCE - timedelta(days=BOOTSTRAP_DAYS + 30)
BOOTSTRAP_COVERAGE_START = REFERENCE - timedelta(days=5)


def _row(
    show_date: date,
    *,
    film: str = "Brand New Film",
    theater: str = "AMC Pacific Place 11",
    theater_id: str = "amc-pacific-place-11",
    source: str = "amc",
    canceled: bool = False,
    first_seen: date | None = None,
    film_key: str | None = None,
    source_film_id: str = "",
) -> dict[str, str]:
    key = film_key or showtime_film_key(film) or "unknown"
    return {
        "Date": format_date_csv(show_date),
        "Time": "7:30PM",
        "Theater": theater,
        "Film": film,
        "Runtime": "120",
        "isAlmostSoldOut": "None",
        "posterDynamic": "",
        "isCanceled": "true" if canceled else "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": (first_seen or show_date).isoformat(),
        "last_updated": show_date.isoformat(),
        "source": source,
        "theater_id": theater_id,
        "showtime_film_key": key,
        "time_24h": "19:30",
        "source_film_id": source_film_id,
        "source_title": film,
        "source_showtime_id": "",
    }


def _mature_filler(
    theater: str = "AMC Pacific Place 11",
    theater_id: str = "amc-pacific-place-11",
    source: str = "amc",
) -> dict[str, str]:
    """Establish mature history coverage for a theater before the bootstrap window."""
    return _row(
        MATURE_COVERAGE_START,
        film="Ancient Catalog Title",
        theater=theater,
        theater_id=theater_id,
        source=source,
    )


def _build(history, *, overrides=None, current=None, registry=None, reference=REFERENCE):
    return build_opening_this_week_current(
        history,
        registry=registry,
        current_artifact=current,
        overrides=overrides or [],
        reference_date=reference,
        generated_at=GENERATED_AT,
        identity_catalog={"films": []},
    )


def _keys(artifact) -> set[str]:
    return {entry["showtime_film_key"] for entry in artifact["entries"]}


def _low_keys(artifact) -> set[str]:
    return {entry["showtime_film_key"] for entry in artifact["low_confidence_candidates"]}


@pytest.fixture
def registry(theaters_registry):
    return theaters_registry


def test_week_bounds_monday_sunday():
    start, end = week_bounds(date(2026, 6, 24))
    assert start == date(2026, 6, 22)
    assert end == date(2026, 6, 28)
    assert start.weekday() == 0
    assert end.weekday() == 6


def test_01_brand_new_film_earliest_in_week_included(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=2), film="Fresh Open"),
    ]
    artifact = _build(history, registry=registry)
    assert "fresh-open" in _keys(artifact)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "fresh-open")
    assert entry["opening_date"] == (WEEK_START + timedelta(days=2)).isoformat()
    assert entry["confidence"] == "high"


def test_02_earliest_before_week_excluded(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START - timedelta(days=3), film="Already Open"),
        _row(WEEK_START + timedelta(days=1), film="Already Open"),
    ]
    artifact = _build(history, registry=registry)
    assert "already-open" not in _keys(artifact)


def test_03_announced_this_week_but_earliest_last_week_excluded(registry):
    """first_seen / announce timing must not drive membership."""
    history = [
        _mature_filler(),
        _row(
            WEEK_START - timedelta(days=2),
            film="Restate Noise",
            first_seen=WEEK_START + timedelta(days=1),
        ),
    ]
    artifact = _build(history, registry=registry)
    assert "restate-noise" not in _keys(artifact)


def test_04_expands_to_another_theater_this_week_excluded(registry):
    history = [
        _mature_filler(),
        _mature_filler("The Beacon", "the-beacon", "indie"),
        _row(WEEK_START - timedelta(days=10), film="Expansion Film"),
        _row(
            WEEK_START + timedelta(days=1),
            film="Expansion Film",
            theater="The Beacon",
            theater_id="the-beacon",
            source="indie",
        ),
    ]
    artifact = _build(history, registry=registry)
    assert "expansion-film" not in _keys(artifact)


def test_05_one_night_first_ever_included(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=3), film="Single Date Debut"),
    ]
    artifact = _build(history, registry=registry)
    assert "single-date-debut" in _keys(artifact)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "single-date-debut")
    assert entry["opening_type"] == "limited"


def test_06_weeklong_repertory_first_ever_included(registry):
    history = [_mature_filler()]
    for offset in range(7):
        history.append(
            _row(WEEK_START + timedelta(days=offset), film="Weeklong Rep")
        )
    artifact = _build(history, registry=registry)
    assert "weeklong-rep" in _keys(artifact)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "weeklong-rep")
    assert entry["opening_type"] == "theatrical"
    assert entry["opening_date"] == WEEK_START.isoformat()


def test_07_return_after_long_absence_excluded_in_v1(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START - timedelta(days=200), film="Returning Classic"),
        _row(WEEK_START + timedelta(days=1), film="Returning Classic"),
    ]
    artifact = _build(history, registry=registry)
    assert "returning-classic" not in _keys(artifact)


def test_08_source_outage_recovery_no_new_opening(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START - timedelta(days=5), film="Outage Film"),
        # Reappearance this week with same earliest historical Date.
        _row(WEEK_START + timedelta(days=2), film="Outage Film"),
    ]
    artifact = _build(history, registry=registry)
    assert "outage-film" not in _keys(artifact)


def test_09_parent_variant_collapse_uses_earliest(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="Variant Film"),
        _row(
            WEEK_START + timedelta(days=3),
            film="Variant Film: Sensory Friendly Screening",
        ),
    ]
    artifact = _build(history, registry=registry)
    # Collapsed under parent key variant-film
    matches = [
        e
        for e in artifact["entries"]
        if e["parent_film_key"] == "variant-film"
        or e["showtime_film_key"] == "variant-film"
    ]
    assert len(matches) == 1
    assert matches[0]["opening_date"] == (WEEK_START + timedelta(days=1)).isoformat()
    assert "variant-film" in matches[0]["evidence"]["variant_showtime_film_keys"] or any(
        "sensory" in k for k in matches[0]["evidence"]["variant_showtime_film_keys"]
    )


def test_10_opening_next_week_excluded(registry):
    history = [
        _mature_filler(),
        _row(WEEK_END + timedelta(days=1), film="Next Week Open"),
    ]
    artifact = _build(history, registry=registry)
    assert "next-week-open" not in _keys(artifact)


def test_11_multi_theater_staggered_uses_earliest(registry):
    history = [
        _mature_filler(),
        _mature_filler("The Beacon", "the-beacon", "indie"),
        _row(
            WEEK_START,
            film="Stagger Open",
            theater="The Beacon",
            theater_id="the-beacon",
            source="indie",
        ),
        _row(WEEK_START + timedelta(days=2), film="Stagger Open"),
    ]
    artifact = _build(history, registry=registry)
    entry = next(e for e in artifact["entries"] if e["parent_film_key"] == "stagger-open")
    assert entry["opening_date"] == WEEK_START.isoformat()
    assert "the-beacon" in entry["theaters_on_opening_date"]
    assert entry["theater_count_on_opening_date"] >= 1


def test_12_midweek_run_still_includes_monday_opening(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START, film="Monday Opener"),
    ]
    artifact = _build(history, registry=registry)
    assert "monday-opener" in _keys(artifact)


def test_13_monday_sunday_boundaries_inclusive(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START, film="Monday Bound"),
        _row(WEEK_END, film="Sunday Bound"),
    ]
    artifact = _build(history, registry=registry)
    assert "monday-bound" in _keys(artifact)
    assert "sunday-bound" in _keys(artifact)


def test_14_pacific_date_boundary_uses_local_calendar_date(registry):
    """Scheduled Date strings are local calendar dates; no UTC reinterpretation."""
    history = [
        _mature_filler(),
        _row(WEEK_START, film="Pacific Bound"),
    ]
    # Reference late Wednesday Pacific still uses Mon–Sun local week.
    artifact = _build(history, registry=registry, reference=REFERENCE)
    assert artifact["week"]["start_date"] == WEEK_START.isoformat()
    assert "pacific-bound" in _keys(artifact)


def test_15_bootstrap_only_low_confidence_not_in_entries(registry):
    # Thin theater coverage from an unrelated title; candidate opens this week.
    history = [
        _row(
            BOOTSTRAP_COVERAGE_START,
            film="Thin Coverage Filler",
            theater="AMC Pacific Place 11",
            theater_id="amc-pacific-place-11",
        ),
        _row(
            WEEK_START + timedelta(days=1),
            film="Bootstrap Only Film",
            theater="AMC Pacific Place 11",
            theater_id="amc-pacific-place-11",
        ),
    ]
    artifact = _build(history, registry=registry)
    assert "bootstrap-only-film" not in _keys(artifact)
    assert "bootstrap-only-film" in _low_keys(artifact)
    low = next(
        e
        for e in artifact["low_confidence_candidates"]
        if e["showtime_film_key"] == "bootstrap-only-film"
    )
    assert low["confidence"] == "low"


def test_16_mature_theater_corroborates_bootstrap_film(registry):
    history = [
        _mature_filler(),
        # Oak Tree has only thin coverage so far.
        _row(
            BOOTSTRAP_COVERAGE_START,
            film="Oak Tree Thin Filler",
            theater="AMC Oak Tree 6",
            theater_id="amc-oak-tree-6",
        ),
        _row(
            WEEK_START + timedelta(days=1),
            film="Corroborated Film",
            theater="AMC Oak Tree 6",
            theater_id="amc-oak-tree-6",
        ),
        # Mature theater also shows the film → upgrade to high.
        _row(WEEK_START + timedelta(days=1), film="Corroborated Film"),
    ]
    artifact = _build(history, registry=registry)
    assert "corroborated-film" in _keys(artifact)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "corroborated-film")
    assert entry["confidence"] == "high"


def test_17_override_force_include(registry):
    history = [_mature_filler()]
    overrides = [
        OpeningOverride(
            id="force-include-ghost",
            action="include",
            reason="curated opening",
            showtime_film_key="ghost-include",
            forced_opening_date=WEEK_START + timedelta(days=2),
        )
    ]
    artifact = _build(history, overrides=overrides, registry=registry)
    assert "ghost-include" in _keys(artifact)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "ghost-include")
    assert entry["override"]["id"] == "force-include-ghost"
    assert entry["override"]["action"] == "include"


def test_18_override_force_exclude(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="Exclude Me"),
    ]
    overrides = [
        OpeningOverride(
            id="force-exclude",
            action="exclude",
            reason="false positive",
            showtime_film_key="exclude-me",
        )
    ]
    artifact = _build(history, overrides=overrides, registry=registry)
    assert "exclude-me" not in _keys(artifact)
    assert artifact["stats"]["override_applied_count"] >= 1


def test_19_forced_opening_date_override_drives_membership(registry):
    history = [
        _mature_filler(),
        # Historical earliest is last week; forced date puts it in this week.
        _row(WEEK_START - timedelta(days=3), film="Force Date Film"),
    ]
    overrides = [
        OpeningOverride(
            id="force-date",
            action="include",
            reason="corrected opening",
            showtime_film_key="force-date-film",
            forced_opening_date=WEEK_START + timedelta(days=1),
        )
    ]
    artifact = _build(history, overrides=overrides, registry=registry)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "force-date-film")
    assert entry["opening_date"] == (WEEK_START + timedelta(days=1)).isoformat()
    assert entry["override"]["forced_opening_date"] == entry["opening_date"]


def test_20_canceled_historical_row_ignored(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="Canceled Open", canceled=True),
        # Real earliest after week → should not include from canceled alone.
        _row(WEEK_END + timedelta(days=2), film="Canceled Open"),
    ]
    artifact = _build(history, registry=registry)
    assert "canceled-open" not in _keys(artifact)


def test_visible_count_join_does_not_affect_membership(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="No Current Shows"),
    ]
    current = {"showtimes": []}
    artifact = _build(history, registry=registry, current=current)
    entry = next(e for e in artifact["entries"] if e["showtime_film_key"] == "no-current-shows")
    assert entry["visible_showtime_count"] == 0
    assert "no-current-shows" in _keys(artifact)


def test_classify_opening_type_event_patterns():
    assert classify_opening_type("Screen Unseen", distinct_scheduled_dates=1) == "event"
    assert classify_opening_type("Met Opera: Carmen", distinct_scheduled_dates=2) == "event"
    assert classify_opening_type("Ordinary Film", distinct_scheduled_dates=1) == "limited"
    assert classify_opening_type("Ordinary Film", distinct_scheduled_dates=5) == "theatrical"
    assert (
        classify_opening_type(
            "Memento",
            distinct_scheduled_dates=5,
            sources=["central_cinema"],
        )
        == "repertory"
    )
    assert (
        classify_opening_type(
            "The Marching Band",
            distinct_scheduled_dates=7,
            sources=["siff"],
        )
        == "theatrical"
    )
    assert (
        classify_opening_type(
            "Cars",
            distinct_scheduled_dates=7,
            sources=["amc"],
            titles=["Cars 20th Anniversary"],
        )
        == "repertory"
    )


def test_load_opening_overrides_empty(tmp_path):
    path = tmp_path / "opening_overrides.json"
    path.write_text(
        json.dumps({"schema_version": "1.0.0", "overrides": []}),
        encoding="utf-8",
    )
    assert load_opening_overrides(path) == []


def test_load_opening_overrides_rejects_bad_action(tmp_path):
    path = tmp_path / "opening_overrides.json"
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0.0",
                "overrides": [
                    {
                        "id": "bad",
                        "action": "maybe",
                        "reason": "nope",
                        "showtime_film_key": "x",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="include|exclude"):
        load_opening_overrides(path)


def test_write_opening_this_week_current(tmp_path, registry, project_root):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="Write Target"),
    ]
    overrides_path = tmp_path / "overrides.json"
    overrides_path.write_text(
        json.dumps({"schema_version": "1.0.0", "overrides": []}),
        encoding="utf-8",
    )
    registry_path = tmp_path / "theaters.json"
    registry_path.write_text(json.dumps(registry), encoding="utf-8")
    output_path = tmp_path / "opening_this_week_current.json"

    artifact = write_opening_this_week_current(
        history_rows=history,
        output_path=output_path,
        registry_path=registry_path,
        overrides_path=overrides_path,
        showtimes_current_path=None,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    assert artifact["schema_version"] == OPENING_THIS_WEEK_SCHEMA_VERSION
    validate_opening_this_week_current(artifact)
    assert output_path.is_file()


def test_schema_rejects_bad_confidence(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="Schema Film"),
    ]
    artifact = _build(history, registry=registry)
    broken = copy.deepcopy(artifact)
    broken["entries"][0]["confidence"] = "medium"
    with pytest.raises(SchemaValidationError):
        validate_opening_this_week_current(broken)


def test_schema_rejects_non_monday_week(registry):
    history = [
        _mature_filler(),
        _row(WEEK_START + timedelta(days=1), film="Week Shape"),
    ]
    artifact = _build(history, registry=registry)
    broken = copy.deepcopy(artifact)
    broken["week"]["start_date"] = "2026-06-23"
    broken["week"]["end_date"] = "2026-06-29"
    with pytest.raises(ValueError, match="Monday"):
        validate_opening_this_week_current(broken)
