"""Tests for AMC theatrical-run lifecycle reconstruction and TTE labels."""

from __future__ import annotations

from datetime import date, timedelta

from reel_seattle.analysis.amc_run_lifecycle import (
    DEFAULT_GAP_THRESHOLD_DAYS,
    FEATURE_FIELDS,
    LABEL_FIELDS,
    LEAKAGE_RULES,
    QUALITY_HIGH_CONFIDENCE_PIT,
    QUALITY_USABLE_14DAY,
    QUALITY_USABLE_14DAY_TITLE,
    build_lifecycle_audit,
    calendar_dates_between,
    classify_observation_quality,
    gap_bucket,
    identity_change_cases,
    make_fact,
    observation_feature_dict,
    remaining_days,
    resolve_product_identity,
    segment_occurred_dates,
    sensitivity_analysis,
)


def _day(offset: int, start: date = date(2026, 1, 5)) -> date:
    return start + timedelta(days=offset)


def _continuous_facts(
    *,
    source_film_id: str,
    start: date,
    end: date,
    horizon: int = 13,
    theaters: tuple[str, ...] = ("amc-pacific-place-11",),
    title: str = "Normal Film",
    observation_end: date | None = None,
) -> list:
    last_obs = observation_end or end
    facts = []
    for obs in calendar_dates_between(start, last_obs):
        last_show = min(obs + timedelta(days=horizon), end)
        if last_show < obs:
            continue
        for show in calendar_dates_between(obs, last_show):
            for theater_id in theaters:
                facts.append(
                    make_fact(
                        obs,
                        show,
                        source_film_id=source_film_id,
                        title=title,
                        theater_id=theater_id,
                    )
                )
    return facts


def test_remaining_days_same_day_is_zero():
    assert remaining_days(date(2026, 1, 10), date(2026, 1, 10)) == 0
    assert remaining_days(date(2026, 1, 10), date(2026, 1, 17)) == 7


def test_source_film_id_is_preferred_over_title():
    identity = resolve_product_identity(
        source_film_id="79550",
        title="Mutiny",
        title_key="mutiny",
    )
    assert identity.product_id == "79550"
    assert identity.identity_kind == "source_film_id"
    assert identity.identity_confidence == "high"


def test_title_fallback_identity_does_not_invent_film_id():
    identity = resolve_product_identity(title="Toy Story 5", title_key="toy-story-5")
    assert identity.product_id == "title:toy-story-5"
    assert identity.identity_kind == "title_fallback"
    assert identity.source_film_id == ""


def test_distinct_products_are_not_merged_by_parent_title():
    sensory = resolve_product_identity(
        source_film_id="111",
        title="Normal Film Sensory Friendly",
        title_key="normal-film-sensory-friendly",
    )
    standard = resolve_product_identity(
        source_film_id="222",
        title="Normal Film",
        title_key="normal-film",
    )
    assert sensory.product_id != standard.product_id


def test_continuous_run_is_one_network_run():
    facts = _continuous_facts(
        source_film_id="100",
        start=_day(0),
        end=_day(9),
    )
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    runs = [run for run in result.runs if run.product_id == "100"]
    assert len(runs) == 1
    assert runs[0].run_id == "100#01"
    assert runs[0].start_date == _day(0)
    assert runs[0].end_date == _day(9)


def test_one_day_gap_stays_one_run_at_default_threshold():
    start = _day(0)
    facts = []
    for obs in (start, start + timedelta(days=2)):
        facts.append(make_fact(obs, obs, source_film_id="200"))
        if obs == start:
            facts.append(make_fact(obs, obs + timedelta(days=2), source_film_id="200"))
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    gaps = [gap for gap in result.gaps if gap.product_id == "200"]
    assert len(gaps) == 1
    assert gaps[0].dark_days == 1
    assert gap_bucket(1) == "1_day"
    assert len([run for run in result.runs if run.product_id == "200"]) == 1


def test_one_day_gap_splits_when_threshold_is_one():
    dates = [_day(0), _day(2)]
    facts = [make_fact(day, day, source_film_id="201") for day in dates]
    result = build_lifecycle_audit(facts, gap_threshold_days=1)
    runs = [run for run in result.runs if run.product_id == "201"]
    assert len(runs) == 2
    assert [run.run_sequence for run in runs] == [1, 2]


def test_seven_day_gap_splits_at_seven_not_fourteen():
    facts = [
        make_fact(_day(0), _day(0), source_film_id="300"),
        make_fact(_day(8), _day(8), source_film_id="300"),
    ]
    at_seven = build_lifecycle_audit(facts, gap_threshold_days=7)
    at_fourteen = build_lifecycle_audit(facts, gap_threshold_days=14)
    assert len([run for run in at_seven.runs if run.product_id == "300"]) == 2
    assert len([run for run in at_fourteen.runs if run.product_id == "300"]) == 1
    gap = at_fourteen.gaps[0]
    assert gap.dark_days == 7
    assert gap.bucket == "3_to_7_days"


def test_fourteen_day_gap_defines_a_new_run():
    facts = [
        make_fact(_day(0), _day(0), source_film_id="400", title="Classic Rerelease"),
        make_fact(_day(15), _day(15), source_film_id="400", title="Classic Rerelease"),
    ]
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    runs = [run for run in result.runs if run.product_id == "400"]
    assert len(runs) == 2
    assert result.gaps[0].dark_days == 14
    assert result.gaps[0].bucket == "8_to_14_days"


def test_product_returning_after_meaningful_absence_increments_sequence():
    facts = [
        make_fact(_day(0), _day(0), source_film_id="500"),
        make_fact(_day(1), _day(1), source_film_id="500"),
        make_fact(_day(22), _day(22), source_film_id="500"),
        make_fact(_day(23), _day(23), source_film_id="500"),
    ]
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    runs = [run for run in result.runs if run.product_id == "500"]
    assert [run.run_id for run in runs] == ["500#01", "500#02"]
    assert result.gaps[0].dark_days == 20


def test_right_censored_active_run_has_null_remaining_days():
    facts = _continuous_facts(
        source_film_id="600",
        start=_day(0),
        end=_day(20),
        observation_end=_day(10),
        horizon=13,
    )
    result = build_lifecycle_audit(facts, gap_threshold_days=14, as_of=_day(10))
    rows = [row for row in result.observations if row.product_id == "600"]
    assert rows
    last = rows[-1]
    assert last.observation_date == _day(10)
    assert last.right_censored is True
    assert last.event_observed is False
    assert last.remaining_days is None
    assert last.run_end_date is None
    assert last.true_run_length_days is None


def test_left_truncated_run_flagged_when_already_playing_at_dataset_start():
    facts = _continuous_facts(
        source_film_id="700",
        start=_day(0),
        end=_day(5),
    )
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    run = next(run for run in result.runs if run.product_id == "700")
    assert run.left_truncated is True
    assert all(row.left_truncated for row in result.observations if row.product_id == "700")


def test_special_event_one_night_run():
    facts = [
        make_fact(
            _day(3),
            _day(3),
            source_film_id="800",
            title="Met Opera Live in HD",
            minutes=19 * 60,
        )
    ]
    result = build_lifecycle_audit(
        facts,
        gap_threshold_days=14,
        as_of=_day(4),
        dataset_start=_day(3),
    )
    run = result.runs[0]
    assert run.one_day is True
    assert run.one_showtime is True
    assert run.run_type == "concert_live_event"
    row = result.observations[0]
    assert row.remaining_days == 0
    assert row.event_observed is True
    assert row.right_censored is False


def test_far_future_announced_showtime_is_not_horizon_truncated():
    facts = [
        make_fact(_day(0), _day(0), source_film_id="900"),
        make_fact(_day(0), _day(45), source_film_id="900"),
    ]
    result = build_lifecycle_audit(facts, gap_threshold_days=14, as_of=_day(0))
    row = result.observations[0]
    assert row.announced_horizon_days == 45
    assert row.announced_beyond_legacy_horizon is True
    assert row.observation_quality == QUALITY_HIGH_CONFIDENCE_PIT
    assert row.right_censored is True


def test_multiple_theaters_share_one_network_run():
    facts = _continuous_facts(
        source_film_id="1000",
        start=_day(0),
        end=_day(4),
        theaters=("amc-pacific-place-11", "amc-oak-tree-8"),
    )
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    runs = [run for run in result.runs if run.product_id == "1000"]
    assert len(runs) == 1
    assert set(runs[0].theater_ids) == {"amc-oak-tree-8", "amc-pacific-place-11"}
    row = next(row for row in result.observations if row.product_id == "1000")
    assert row.theater_count == 2


def test_run_end_follows_last_theater_standing():
    start = _day(0)
    facts = []
    dropped = "amc-pacific-place-11"
    remaining = "amc-oak-tree-8"
    for obs in calendar_dates_between(start, start + timedelta(days=6)):
        last_a = start + timedelta(days=2)
        last_b = start + timedelta(days=6)
        if obs <= last_a:
            facts.append(
                make_fact(obs, min(obs, last_a), source_film_id="1100", theater_id=dropped)
            )
        facts.append(
            make_fact(obs, min(obs + timedelta(days=1), last_b), source_film_id="1100", theater_id=remaining)
        )
        facts.append(make_fact(obs, obs, source_film_id="1100", theater_id=remaining))
    result = build_lifecycle_audit(
        facts,
        gap_threshold_days=14,
        as_of=start + timedelta(days=8),
    )
    run = next(run for run in result.runs if run.product_id == "1100")
    assert run.end_date == start + timedelta(days=6)
    early = next(row for row in result.observations if row.observation_date == start)
    assert early.remaining_days == 6
    assert early.event_observed is True


def test_missing_snapshot_is_not_a_theatrical_gap():
    start = _day(0)
    facts = []
    # Snapshots on day 0 and day 3 only. Day 0 already announced days 1 and 2.
    for show in calendar_dates_between(start, start + timedelta(days=4)):
        facts.append(make_fact(start, show, source_film_id="1200"))
    for show in calendar_dates_between(start + timedelta(days=3), start + timedelta(days=4)):
        facts.append(make_fact(start + timedelta(days=3), show, source_film_id="1200"))
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    assert result.missing_snapshot_dates == (
        start + timedelta(days=1),
        start + timedelta(days=2),
    )
    assert [gap.product_id for gap in result.gaps if gap.product_id == "1200"] == []
    runs = [run for run in result.runs if run.product_id == "1200"]
    assert len(runs) == 1


def test_features_do_not_leak_future_snapshots():
    target = _continuous_facts(
        source_film_id="1300",
        start=_day(0),
        end=_day(12),
        observation_end=_day(12),
    )
    filler = _continuous_facts(
        source_film_id="9999",
        start=_day(0),
        end=_day(20),
        title="Filler Film",
        observation_end=_day(20),
    )
    full = build_lifecycle_audit(target + filler, gap_threshold_days=14, as_of=_day(20))
    truncated_facts = [
        fact for fact in target + filler if fact.observation_date <= _day(5)
    ]
    truncated = build_lifecycle_audit(
        truncated_facts,
        gap_threshold_days=14,
        as_of=_day(5),
        dataset_start=_day(0),
    )
    full_row = next(
        row
        for row in full.observations
        if row.product_id == "1300" and row.observation_date == _day(0)
    )
    truncated_row = next(
        row
        for row in truncated.observations
        if row.product_id == "1300" and row.observation_date == _day(0)
    )
    assert observation_feature_dict(full_row) == observation_feature_dict(truncated_row)
    assert full_row.remaining_days == 12
    assert truncated_row.remaining_days is None
    assert truncated_row.right_censored is True
    assert "remaining_days" not in FEATURE_FIELDS
    assert "remaining_days" in LABEL_FIELDS
    assert "future snapshots after T" in LEAKAGE_RULES["unsafe_as_features"]


def test_segment_occurred_dates_threshold_contract():
    dates = [date(2026, 1, 1), date(2026, 1, 3), date(2026, 1, 18)]
    one = segment_occurred_dates(dates, gap_threshold_days=1)
    fourteen = segment_occurred_dates(dates, gap_threshold_days=14)
    assert len(one) == 3
    assert len(fourteen) == 2
    assert fourteen[0] == (date(2026, 1, 1), date(2026, 1, 3))


def test_observation_quality_flags_title_only_and_legacy_horizon():
    assert (
        classify_observation_quality(
            snapshot_format="json",
            has_source_film_id=True,
            announced_horizon_days=13,
        )
        == QUALITY_USABLE_14DAY
    )
    assert (
        classify_observation_quality(
            snapshot_format="json",
            has_source_film_id=False,
            announced_horizon_days=13,
        )
        == QUALITY_USABLE_14DAY_TITLE
    )


def test_sensitivity_counts_split_products():
    facts = [
        make_fact(_day(0), _day(0), source_film_id="1400"),
        make_fact(_day(15), _day(15), source_film_id="1400"),
    ]
    result = build_lifecycle_audit(facts, gap_threshold_days=14)
    occurred = []
    from reel_seattle.analysis.amc_run_lifecycle import occurred_from_facts

    occurred = occurred_from_facts(facts, as_of=_day(15))
    report = sensitivity_analysis(
        facts,
        occurred,
        result.identities,
        as_of=_day(15),
        dataset_start=_day(0),
        active_product_ids_at_as_of=set(),
        thresholds=(1, 14),
        baseline_threshold=DEFAULT_GAP_THRESHOLD_DAYS,
    )
    assert report["14"]["products_split_into_multiple_runs"] == 1
    assert report["1"]["run_count"] >= report["14"]["run_count"]


def test_identity_change_cases_when_title_gains_movie_id():
    facts = [
        make_fact(_day(0), _day(0), source_film_id="", title="Mutiny", title_key="mutiny"),
        make_fact(_day(1), _day(1), source_film_id="79550", title="Mutiny", title_key="mutiny"),
    ]
    cases = identity_change_cases(facts)
    assert cases
    assert cases[0]["title_key"] == "mutiny"
    assert "title:mutiny" in cases[0]["product_ids"]
    assert "79550" in cases[0]["product_ids"]


def test_facts_from_snapshots_keep_movie_id_and_both_theaters():
    import json
    from pathlib import Path

    from reel_seattle.analysis.amc_footprint import load_amc_snapshots
    from reel_seattle.analysis.amc_run_lifecycle import facts_from_snapshots
    from reel_seattle.normalize import build_theater_index

    logs_dir = Path(__file__).resolve().parent.parent / "fixtures" / "analysis" / "amc_run_lifecycle"
    registry = json.loads(
        (Path(__file__).resolve().parent.parent.parent / "data" / "theaters.json").read_text(
            encoding="utf-8"
        )
    )
    facts = facts_from_snapshots(
        load_amc_snapshots(logs_dir),
        theater_index=build_theater_index(registry),
    )
    assert {fact.source_film_id for fact in facts} == {"4242"}
    assert {fact.theater_id for fact in facts} == {"amc-pacific-place-11", "amc-oak-tree-6"}
    assert {fact.source_release_id for fact in facts} == {"99001"}
