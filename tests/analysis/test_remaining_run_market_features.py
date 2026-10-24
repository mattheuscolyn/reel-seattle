"""Market v3 features: one cutoff, market units, reviewed identity only."""
from datetime import date, timedelta
from types import SimpleNamespace
import pytest

from reel_seattle.analysis.remaining_run_market_features import (
    build_market_snapshot, build_historical_market_rows, THEATER_ONLY, VERSION,
)

def show(film, theater, day, first, *, segment="ordinary", title=None, minutes=1140):
    return SimpleNamespace(
        screening_id=f"{film}-{theater}-{day}", film_id=film,
        theater_id=theater, show_date=date.fromisoformat(day),
        first_snapshot=date.fromisoformat(first), canceled=False,
        removed_before_show=False, removed_at=None, premium=False,
        minutes=minutes, segment=segment, title=title or film,
    )

def build(shows, snapshot="2026-10-10", aliases=None):
    return build_market_snapshot(
        shows, snapshot=date.fromisoformat(snapshot),
        upcoming_friday=date(2026, 10, 16),
        dataset_start=date(2026, 9, 3),
        theater_ids=["amc-a", "amc-b"], approved_product_aliases=aliases,
    )

def test_aggregate_rates_share_and_theater_footprint_have_same_market_units():
    shows = [
        show("film", "amc-a", "2026-10-10", "2026-10-09"),
        show("film", "amc-a", "2026-10-12", "2026-10-09"),
        show("film", "amc-b", "2026-10-12", "2026-10-09"),
        show("film", "amc-b", "2026-10-13", "2026-10-09"),
        show("other", "amc-b", "2026-10-12", "2026-10-09"),
    ]
    result = build(shows)
    film = next(r for r in result if r["film_id"] == "film")
    assert film["feature_version"] == VERSION
    assert film["current_week_screenings"] == 4
    assert film["market_screenings"] == 4
    assert film["distinct_show_dates"] == 3
    assert film["screenings_per_show_date"] == pytest.approx(4/3)
    assert film["market_theater_count"] == 2
    assert film["share_of_market"] == pytest.approx(4/5)
    assert film["rank_in_market"] == 1
    assert film["strongest_theater_screenings"] == 2
    assert film["weakest_theater_screenings"] == 2
    assert film["theaters_in_market"] == ["amc-a", "amc-b"]
    assert all(name not in film for name in THEATER_ONLY)
    assert film["source_product_ids"] == ["film"]

def test_later_seen_theater_excluded_everywhere_until_cutoff():
    shows = [
        show("film", "amc-a", "2026-10-10", "2026-10-09"),
        show("film", "amc-b", "2026-10-12", "2026-10-13"),
    ]
    early = build(shows)[0]
    late = build(shows, snapshot="2026-10-14")[0]
    assert early["market_screenings"] == 1
    assert early["market_theater_count"] == 1
    assert early["screenings_per_show_date"] == 1
    assert late["market_screenings"] == 2
    assert late["market_theater_count"] == 2

def test_unreviewed_identical_titles_are_different_amc_products():
    shows = [
        show("product-a", "amc-a", "2026-10-10", "2026-10-09", title="Same Film"),
        show("product-b", "amc-b", "2026-10-10", "2026-10-09", title="Same Film"),
    ]
    distinct = build(shows)
    assert {r["film_id"] for r in distinct} == {"product-a", "product-b"}
    merged = build(shows, aliases={"product-a": "reviewed:film", "product-b": "reviewed:film"})
    assert len(merged) == 1
    assert merged[0]["identity_policy"] == "reviewed_alias"
    assert merged[0]["source_product_ids"] == ["product-a", "product-b"]
    assert merged[0]["market_screenings"] == 2

def test_non_eligible_theater_is_excluded_from_denominators():
    result = build([
        show("film", "amc-a", "2026-10-10", "2026-10-09"),
        show("film", "excluded", "2026-10-10", "2026-10-09"),
    ])
    assert result[0]["market_screenings"] == 1
    assert result[0]["market_theater_count"] == 1
    assert result[0]["share_of_market"] == 1.0

def test_historical_replay_uses_earliest_anchor_not_any_later_theater_snapshot():
    shows = [
        show("film", "amc-a", "2026-10-10", "2026-10-09"),
        show("film", "amc-b", "2026-10-11", "2026-10-11"),
    ]
    observations = [
        {"film_id": "film", "upcoming_friday": "2026-10-16", "observation_date": "2026-10-10"},
        {"film_id": "film", "upcoming_friday": "2026-10-16", "observation_date": "2026-10-12"},
    ]
    rows = build_historical_market_rows(
        shows, observations, dataset_start=date(2026, 9, 3),
        theater_ids=["amc-a", "amc-b"],
    )
    assert len(rows) == 1
    assert rows[0]["observation_date"] == "2026-10-10"
    assert rows[0]["market_screenings"] == 1
    assert rows[0]["market_theater_count"] == 1

def test_invalid_cutoffs_rejected():
    with pytest.raises(ValueError):
        build([], snapshot="2026-10-17")
    with pytest.raises(ValueError):
        build([], snapshot="2026-08-25")
