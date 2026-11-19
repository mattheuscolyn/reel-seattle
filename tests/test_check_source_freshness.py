"""Regression checks for detection of stale but published showtime sources."""
from datetime import date

from scripts.check_source_freshness import check_freshness


def test_central_old_success_detected_even_when_report_status_success():
    report = {
        "status": "success",
        "sources": {
            "central_cinema": {
                "status": "success",
                "showtime_count": 7,
                "last_successful_run": "2026-10-27",
                "warnings": ["Central Cinema scrape incomplete or unsafe; retained future rows."],
            }
        },
    }
    code, message = check_freshness(
        report, source="central_cinema", today=date(2026, 11, 19)
    )
    assert code == 1
    assert "23 days ago" in message


def test_recent_failure_warns_but_keeps_other_data_publishable():
    code, message = check_freshness(
        {"sources": {"central_cinema": {"last_successful_run": "2026-11-18"}}},
        source="central_cinema",
        today=date(2026, 11, 19),
    )
    assert code == 0
    assert "not successfully refreshed today" in message


def test_same_day_success_and_malformed_report():
    code, message = check_freshness(
        {"sources": {"central_cinema": {"last_successful_run": "2026-11-19"}}},
        source="central_cinema",
        today=date(2026, 11, 19),
    )
    assert code == 0
    assert "successfully ingested today" in message
    code, message = check_freshness(
        {"sources": {"central_cinema": {"last_successful_run": "bad-date"}}},
        source="central_cinema",
        today=date(2026, 11, 19),
    )
    assert code == 1
    assert "invalid" in message


def test_missing_and_future_success_fail_closed():
    for row in (None, {"last_successful_run": None}, {"last_successful_run": "2026-11-20"}):
        report = {"sources": {}} if row is None else {"sources": {"central_cinema": row}}
        code, _ = check_freshness(report, source="central_cinema", today=date(2026, 11, 19))
        assert code == 1
