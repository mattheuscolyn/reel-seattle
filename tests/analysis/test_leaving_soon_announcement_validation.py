"""Synthetic checks for announcement-rollout definitions.

These do not change the original exact-first reconstruction.
"""

from __future__ import annotations

from datetime import date, timedelta

from reel_seattle.analysis.leaving_soon_announcement_validation import (
    AnnouncedShow,
    classify_exact_extension,
    cutoff_observable,
    days_until_final_known,
    days_until_share,
    extended_beyond,
    final_date_known,
    format_show_dates,
    late_extension,
    listed_on_snapshot,
    post_opening_extension,
    removals_on_snapshot,
    share_of_dates,
    share_of_screenings,
)


def _show(show_id: str, show_date: date, first_snapshot: date, **overrides) -> AnnouncedShow:
    return AnnouncedShow(show_id=show_id, show_date=show_date, first_snapshot=first_snapshot, **overrides)


def test_one_date_on_day_one_and_the_rest_on_day_two():
    opening = date(2026, 9, 3)
    day0 = date(2026, 8, 25)
    day1 = day0 + timedelta(days=1)
    shows = [_show("a", opening, day0)]
    shows.extend(_show(f"b{offset}", opening + timedelta(days=offset), day1) for offset in range(1, 8))
    assert share_of_screenings(shows, day0) == 1 / 8
    assert share_of_dates(shows, day0) == 1 / 8
    assert format_show_dates([opening]) == "Sep 3"
    assert final_date_known(shows, day0) is False
    assert share_of_screenings(shows, day1) == 1
    assert final_date_known(shows, day1) is True
    assert extended_beyond(shows, day0) is True
    assert extended_beyond(shows, day1) is False
    assert extended_beyond(shows, day0 + timedelta(days=2)) is False
    assert post_opening_extension(shows, opening) is False
    assert late_extension(shows, opening) is False
    assert days_until_share(shows, day0, 1.0) == 1
    assert days_until_final_known(shows, day0) == 1
    assert classify_exact_extension(
        {
            "extended_exact_first": True,
            "extended_within_48h": False,
            "extended_post_opening": False,
            "extended_late": False,
        }
    ) == "immediate_rollout_within_48h"


def test_full_schedule_appears_on_day_one():
    opening = date(2026, 9, 3)
    day0 = date(2026, 8, 25)
    shows = [_show(f"s{offset}", opening + timedelta(days=offset), day0) for offset in range(8)]
    assert share_of_screenings(shows, day0) == 1
    assert share_of_dates(shows, day0) == 1
    assert final_date_known(shows, day0) is True
    assert extended_beyond(shows, day0) is False
    assert days_until_share(shows, day0, 0.9) == 0
    assert post_opening_extension(shows, opening) is False
    assert late_extension(shows, opening) is False


def test_schedule_grows_before_opening():
    opening = date(2026, 9, 3)
    day0 = date(2026, 8, 1)
    later = date(2026, 8, 20)
    shows = [_show("a", opening, day0)]
    shows.extend(_show(f"b{offset}", opening + timedelta(days=offset), later) for offset in range(1, 8))
    assert extended_beyond(shows, day0) is True
    assert extended_beyond(shows, day0 + timedelta(days=2)) is True
    assert final_date_known(shows, later) is True
    assert post_opening_extension(shows, opening) is False
    assert late_extension(shows, opening) is False
    assert days_until_final_known(shows, day0) == (later - day0).days
    assert classify_exact_extension(
        {
            "extended_exact_first": True,
            "extended_within_48h": True,
            "extended_post_opening": False,
            "extended_late": False,
        }
    ) == "pre_opening_rollout_after_48h"


def test_schedule_extends_after_opening():
    opening = date(2026, 9, 3)
    day0 = date(2026, 8, 25)
    discovered = date(2026, 9, 4)
    shows = [_show(f"s{offset}", opening + timedelta(days=offset), day0) for offset in range(3)]
    shows.append(_show("late", opening + timedelta(days=7), discovered))
    assert extended_beyond(shows, day0 + timedelta(days=2)) is True
    assert post_opening_extension(shows, opening) is True
    assert late_extension(shows, opening) is False
    assert classify_exact_extension(
        {
            "extended_exact_first": True,
            "extended_within_48h": True,
            "extended_post_opening": True,
            "extended_late": False,
        }
    ) == "post_opening_before_two_play_days"


def test_schedule_extends_after_two_days_of_play():
    opening = date(2026, 9, 3)
    day0 = date(2026, 8, 25)
    discovered = opening + timedelta(days=2)
    shows = [_show("a", opening, day0), _show("b", opening + timedelta(days=10), discovered)]
    assert post_opening_extension(shows, opening) is True
    assert late_extension(shows, opening) is True
    assert days_until_final_known(shows, day0) == (discovered - day0).days
    assert classify_exact_extension(
        {
            "extended_exact_first": True,
            "extended_within_48h": True,
            "extended_post_opening": True,
            "extended_late": True,
        }
    ) == "late_in_run_extension"


def test_removed_screening_is_out_of_the_eventual_share_and_counted_only_on_a_complete_snapshot():
    day0 = date(2026, 8, 25)
    removal_day = date(2026, 8, 27)
    kept = _show("kept", date(2026, 9, 3), day0)
    dropped = _show(
        "dropped",
        date(2026, 9, 4),
        day0,
        removed=True,
        removed_at=removal_day,
    )
    shows = [kept, dropped]
    assert share_of_screenings(shows, day0) == 1
    assert share_of_dates(shows, day0) == 1
    assert listed_on_snapshot(dropped, day0) is True
    assert listed_on_snapshot(dropped, removal_day) is False
    assert [item.show_id for item in removals_on_snapshot(shows, removal_day, "complete")] == ["dropped"]
    assert removals_on_snapshot(shows, removal_day, "unknown") == []
    assert extended_beyond(shows, day0) is False


def test_missing_snapshot_is_not_a_removal_and_is_not_a_valid_lag():
    day0 = date(2026, 8, 25)
    missing = day0 + timedelta(days=1)
    later = day0 + timedelta(days=2)
    show = _show("a", date(2026, 9, 3), day0)
    snapshots = [day0, later]
    assert cutoff_observable(day0, missing, snapshots, date(2026, 10, 1)) is False
    assert cutoff_observable(day0, later, snapshots, date(2026, 10, 1)) is True
    assert cutoff_observable(day0, later, snapshots, day0) is False
    assert listed_on_snapshot(show, missing) is True
    assert removals_on_snapshot([show], missing, "unknown") == []
    assert format_show_dates([date(2026, 9, 3), date(2026, 9, 10)]) == "Sep 3, Sep 10"
    assert format_show_dates([date(2026, 9, 3), date(2026, 9, 4), date(2026, 9, 10)]) == "Sep 3–4, Sep 10"
