"""Tests for durable screening observation lifecycle backfill (P0C)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.history import (
    CONFIDENCE_HIGH,
    CONFIDENCE_LOW,
    CONFIDENCE_MEDIUM,
    SNAPSHOT_COMPLETE,
    SNAPSHOT_PARTIAL,
    STATUS_EXPLICITLY_CANCELLED,
    STATUS_NO_LONGER_OBSERVED,
    STATUS_PAST,
)
from reel_seattle.history.screening_observation_ledger import (
    build_ledger_from_logs,
    classify_snapshot_completeness,
    explain_screening_observation,
    resolve_screening_identity,
    rebuild_screening_observation_ledger,
    write_ledger_artifacts,
)


def _write_log(
    logs_dir: Path,
    *,
    snapshot_date: str,
    source: str,
    records: list[dict],
    restate_safe: bool = True,
    errors: list | None = None,
    extra_stats: dict | None = None,
) -> Path:
    path = logs_dir / f"{snapshot_date}_{source}.json"
    stats = {
        "record_count": len(records),
        "warning_count": 0,
        "error_count": len(errors or []),
        "restate_safe": restate_safe,
        "scrape_status": "success" if restate_safe else "partial_failure",
    }
    if extra_stats:
        stats.update(extra_stats)
    payload = {
        "schema_version": "1.0.0",
        "generated_at": f"{snapshot_date}T03:00:00-07:00",
        "source": source,
        "records": records,
        "stats": stats,
        "warnings": [],
        "errors": list(errors or []),
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def _record(
    *,
    title: str,
    date_raw: str,
    time_raw: str,
    theater: str = "AMC Pacific Place 11",
    source_showtime_id: str | None = "111",
    source_film_id: str | None = "999",
    ticket_url: str | None = "https://example.com/t/1",
    format_raw: str | None = None,
    canceled: bool | None = False,
    theater_id: str | None = "amc-pacific-place-11",
    extra_attrs: dict | None = None,
) -> dict:
    attrs = {
        "source_film_id": source_film_id,
        "theater_id": theater_id,
    }
    if extra_attrs:
        attrs.update(extra_attrs)
    return {
        "theater_name_raw": theater,
        "date_raw": date_raw,
        "time_raw": time_raw,
        "title_raw": title,
        "runtime_raw": "100",
        "poster_url_raw": None,
        "ticket_url_raw": ticket_url,
        "canceled": canceled,
        "almost_sold_out": False,
        "format_raw": format_raw,
        "source_showtime_id": source_showtime_id,
        "source_film_url": None,
        "attributes": attrs,
    }


@pytest.fixture
def theater_index():
    from reel_seattle.history_keys import load_theater_index

    return load_theater_index()


def test_resolve_identity_confidence_tiers():
    high = resolve_screening_identity(
        source="amc",
        source_showtime_id="145",
        source_film_id="1",
        theater_id="amc-pacific-place-11",
        local_date="2026-09-20",
        local_time="19:00",
        film_key="weight",
    )
    assert high[1] == CONFIDENCE_HIGH
    assert high[0] == "scr:amc:sid:145"

    medium = resolve_screening_identity(
        source="nwff",
        source_showtime_id=None,
        source_film_id="remake",
        theater_id="northwest-film-forum",
        local_date="2026-09-20",
        local_time="19:00",
        film_key="remake",
    )
    assert medium[1] == CONFIDENCE_MEDIUM

    low = resolve_screening_identity(
        source="nwff",
        source_showtime_id=None,
        source_film_id=None,
        theater_id=None,
        local_date="2026-09-20",
        local_time="19:00",
        film_key="remake",
    )
    assert low[1] == CONFIDENCE_LOW


def test_same_screening_across_snapshots_and_first_last(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-1",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[rec])

    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-11")
    assert len(ledger["lifecycles"]) == 1
    life = ledger["lifecycles"][0]
    assert life["screening_id"] == "scr:amc:sid:sid-1"
    assert life["observation_count"] == 2
    assert life["first_snapshot_date"] == "2026-09-10"
    assert life["last_snapshot_date"] == "2026-09-11"
    assert len(ledger["observations"]) == 2


def test_future_disappearance_becomes_no_longer_observed(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-gone",
    )
    other = _record(
        title="Other Film",
        date_raw="09/21/2026",
        time_raw="8:00PM",
        source_showtime_id="sid-other",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec, other])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[other])

    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-11")
    life = {row["screening_id"]: row for row in ledger["lifecycles"]}["scr:amc:sid:sid-gone"]
    assert life["current_status"] == STATUS_NO_LONGER_OBSERVED
    assert life["removed_at"] == "2026-09-11"
    assert life["cancelled_at"] is None


def test_past_screening_not_marked_removed(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="Old Film",
        date_raw="09/10/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-past",
    )
    other = _record(
        title="Other Film",
        date_raw="09/21/2026",
        time_raw="8:00PM",
        source_showtime_id="sid-other-past",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec, other])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[other])

    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-11")
    life = {row["screening_id"]: row for row in ledger["lifecycles"]}["scr:amc:sid:sid-past"]
    assert life["current_status"] == STATUS_PAST
    assert life["removed_at"] is None


def test_explicit_cancellation(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="Canceled Film",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-cancel",
        canceled=True,
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec])
    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-10")
    life = ledger["lifecycles"][0]
    assert life["current_status"] == STATUS_EXPLICITLY_CANCELLED
    assert life["cancelled_at"] == "2026-09-10"


def test_partial_snapshot_does_not_infer_removal(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-partial",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec])
    _write_log(
        logs,
        snapshot_date="2026-09-11",
        source="amc",
        records=[],
        restate_safe=False,
        errors=["theater fetch failed"],
        extra_stats={"theaters_failed": 1},
    )

    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-11")
    snaps = {s.snapshot_date: s for s in ledger["snapshots"]}
    assert snaps["2026-09-11"].completeness == SNAPSHOT_PARTIAL
    life = ledger["lifecycles"][0]
    assert life["removed_at"] is None
    assert life["current_status"] != STATUS_NO_LONGER_OBSERVED


def test_reappearance_preserves_history(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-reappear",
    )
    other = _record(
        title="Other Film",
        date_raw="09/21/2026",
        time_raw="8:00PM",
        source_showtime_id="sid-other-re",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec, other])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[other])
    _write_log(logs, snapshot_date="2026-09-12", source="amc", records=[rec, other])

    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-12")
    life = {row["screening_id"]: row for row in ledger["lifecycles"]}["scr:amc:sid:sid-reappear"]
    assert life["reappearance_count"] == 1
    assert life["observation_count"] == 2
    assert life["removal_events"]
    assert life["removed_at"] is None
    assert life["current_status"] != STATUS_NO_LONGER_OBSERVED


def test_attribute_change_same_source_id(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    day1 = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-attr",
        ticket_url="https://example.com/a",
        format_raw=None,
    )
    day2 = _record(
        title="The Weight Early Access",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-attr",
        ticket_url="https://example.com/b",
        format_raw="IMAX",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[day1])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[day2])

    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-11")
    assert len(ledger["lifecycles"]) == 1
    life = ledger["lifecycles"][0]
    assert life["attribute_change_count"] >= 1
    assert "ticket_url" in life["changed_fields"] or "format_raw" in life["changed_fields"]
    titles = {obs.source_title for obs in ledger["observations"]}
    assert "The Weight" in titles
    assert "The Weight Early Access" in titles


def test_no_source_showtime_id_provisional(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="Remake",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        theater="Northwest Film Forum",
        source_showtime_id=None,
        source_film_id="remake",
        theater_id="northwest-film-forum",
        ticket_url="https://nwfilmforum.eventive.org/films/abc",
        extra_attrs={
            "occurrence_discriminator": "https://nwfilmforum.eventive.org/films/abc",
            "local_date": "2026-09-20",
            "local_time": "19:00",
        },
    )
    _write_log(logs, snapshot_date="2026-09-10", source="nwff", records=[rec])
    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-10")
    life = ledger["lifecycles"][0]
    assert life["identity_confidence"] in {CONFIDENCE_MEDIUM, CONFIDENCE_LOW}
    assert life["source_showtime_id"] is None


def test_ambiguous_fallback_does_not_merge_distinct_slots(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    a = _record(
        title="Similar Film",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id=None,
        source_film_id=None,
        theater_id="northwest-film-forum",
        theater="Northwest Film Forum",
        extra_attrs={"local_date": "2026-09-20", "local_time": "19:00"},
    )
    b = _record(
        title="Similar Film",
        date_raw="09/20/2026",
        time_raw="9:00PM",
        source_showtime_id=None,
        source_film_id=None,
        theater_id="northwest-film-forum",
        theater="Northwest Film Forum",
        extra_attrs={"local_date": "2026-09-20", "local_time": "21:00"},
    )
    _write_log(logs, snapshot_date="2026-09-10", source="nwff", records=[a, b])
    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-10")
    assert len(ledger["lifecycles"]) == 2


def test_provider_normalization_amc_and_siff(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    amc = _record(
        title="AMC Title",
        date_raw="09/20/2026",
        time_raw="8:00PM",
        source_showtime_id="amc-1",
    )
    siff = _record(
        title="SIFF Title",
        date_raw="09/21/2026",
        time_raw="6:30 PM",
        theater="SIFF Cinema Uptown",
        source_showtime_id="WjGM06vCSt",
        theater_id="siff-cinema-uptown",
        canceled=None,
        extra_attrs={
            "elevent_showtime_id": "WjGM06vCSt",
            "source_film_id": "cinema/in-theaters/siff-title",
            "local_date": "2026-09-21",
            "local_time": "18:30",
        },
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[amc])
    _write_log(logs, snapshot_date="2026-09-10", source="siff", records=[siff])
    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-10")
    sources = {life["source"] for life in ledger["lifecycles"]}
    assert sources == {"amc", "siff"}
    assert all(life["identity_confidence"] == CONFIDENCE_HIGH for life in ledger["lifecycles"])


def test_idempotency_same_logical_output(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    out1 = tmp_path / "out1"
    out2 = tmp_path / "out2"
    out1.mkdir()
    out2.mkdir()
    rec = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-idem",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[rec])

    a = rebuild_screening_observation_ledger(
        logs,
        observations_path=out1 / "observations.jsonl",
        lifecycle_path=out1 / "lifecycle.json",
        snapshot_status_path=out1 / "snapshots.jsonl",
        metrics_path=out1 / "metrics.json",
        as_of_date="2026-09-11",
    )
    b = rebuild_screening_observation_ledger(
        logs,
        observations_path=out2 / "observations.jsonl",
        lifecycle_path=out2 / "lifecycle.json",
        snapshot_status_path=out2 / "snapshots.jsonl",
        metrics_path=out2 / "metrics.json",
        as_of_date="2026-09-11",
    )
    assert (out1 / "observations.jsonl").read_text(encoding="utf-8") == (
        out2 / "observations.jsonl"
    ).read_text(encoding="utf-8")
    assert (out1 / "lifecycle.json").read_text(encoding="utf-8") == (
        out2 / "lifecycle.json"
    ).read_text(encoding="utf-8")
    assert a["metrics"] == b["metrics"]


def test_explain_helper(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    rec = _record(
        title="The Weight",
        date_raw="09/20/2026",
        time_raw="7:00PM",
        source_showtime_id="sid-explain",
    )
    other = _record(
        title="Other Film",
        date_raw="09/21/2026",
        time_raw="8:00PM",
        source_showtime_id="sid-other-explain",
    )
    _write_log(logs, snapshot_date="2026-09-10", source="amc", records=[rec, other])
    _write_log(logs, snapshot_date="2026-09-11", source="amc", records=[other])
    lifecycle_path = tmp_path / "lifecycle.jsonl.gz"
    ledger = build_ledger_from_logs(logs, theater_index=theater_index, as_of_date="2026-09-11")
    write_ledger_artifacts(
        ledger,
        observations_path=tmp_path / "obs.jsonl.gz",
        lifecycle_path=lifecycle_path,
        snapshot_status_path=tmp_path / "snap.jsonl",
        metrics_path=tmp_path / "metrics.json",
    )
    explained = explain_screening_observation(lifecycle_path, "scr:amc:sid:sid-explain")
    assert explained is not None
    assert explained["first_seen_on"] == "2026-09-10"
    assert explained["last_seen_on"] == "2026-09-10"
    assert explained["absent_by"] == "2026-09-11"


def test_complete_snapshot_classification():
    completeness, reason, flag = classify_snapshot_completeness(
        "amc",
        {
            "stats": {"restate_safe": True, "record_count": 3, "error_count": 0},
            "records": [{}, {}, {}],
            "errors": [],
        },
    )
    assert completeness == SNAPSHOT_COMPLETE
    assert flag is True
    assert reason is None
