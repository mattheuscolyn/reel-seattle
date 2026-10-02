from datetime import date

from reel_seattle.analysis.leaving_soon_auditorium_commitment import (
    _mark_opening_weeks,
    build_score_calendar,
    is_premium_format,
    programming_strength,
    scores_from_totals,
    tmdb_snapshot_row,
    unique_played,
    within_theater_percentile,
)
from reel_seattle.analysis.tmdb_weekly_snapshot import build_snapshot


def _show(theater, auditorium, day, *, prime=False, evening=False, premium=False, title="Film"):
    return {
        "theater": theater,
        "auditorium": str(auditorium),
        "show_date": day,
        "log_date": day,
        "title": title,
        "minutes": 1200,
        "premium": premium,
        "prime": prime,
        "friday_saturday_evening": evening,
        "adult_price": 15.0,
        "layout_id": "1",
        "layout_version": "1",
        "premium_label": "",
        "sold_out": False,
        "almost_sold_out": False,
        "daypart": "prime" if prime else "afternoon",
    }


def test_percentile_is_within_theater_and_ignores_future_shows():
    past = []
    for offset in range(40):
        day = date(2026, 8, 1)
        past.append(_show("Alderwood", 1, day, prime=True, evening=True))
        past.append(_show("Alderwood", 2, day, prime=False))
        past.append(_show("Kent", 1, day, prime=False))
    future = [_show("Alderwood", 2, date(2026, 9, 1), prime=True, evening=True, premium=True) for _ in range(80)]
    calendar = build_score_calendar(past + future, [date(2026, 8, 15)])
    scores = calendar[date(2026, 8, 15)]
    assert scores[("Alderwood", "1")] > scores[("Alderwood", "2")]
    assert ("Kent", "1") not in scores
    assert programming_strength({"n": 10, "prime": 10, "friday_saturday_evening": 10, "opening": 10, "wide": 0}) is None
    ranked = within_theater_percentile({"1": 0.1, "2": 0.9})
    assert ranked["2"] == 1
    assert ranked["1"] == 0
    # Premium format is not an input to the strength score.
    plain = {"n": 40, "prime": 10, "friday_saturday_evening": 10, "opening": 10, "wide": 0, "premium": 0}
    premium = {**plain, "premium": 40}
    assert programming_strength(plain) == programming_strength(premium)
    assert scores_from_totals({}) == {}


def test_unique_played_keeps_the_show_date_listing():
    early = _show("Oak Tree", 3, date(2026, 8, 2))
    early["log_date"] = date(2026, 8, 1)
    early["auditorium"] = "3"
    late = _show("Oak Tree", 9, date(2026, 8, 2))
    late["log_date"] = date(2026, 8, 2)
    chosen, changes = unique_played([early, late])
    assert len(chosen) == 1
    assert chosen[0]["auditorium"] == "9"
    assert changes["auditorium_changed_across_logs"] == 1


def test_opening_label_does_not_use_a_later_week():
    shows = []
    monday = date(2026, 8, 3)
    next_monday = date(2026, 8, 10)
    shows.append(_show("Alderwood", 1, monday, title="Wide"))
    for theater in ("Kent", "Southcenter", "Woodinville", "Factoria"):
        shows.append(_show(theater, 1, next_monday, title="Wide"))
    _mark_opening_weeks(shows)
    first = next(show for show in shows if show["show_date"] == monday)
    assert first["opening_week"] is True
    assert first["wide_opening"] is False


def test_closed_caption_is_not_premium():
    assert is_premium_format("Closed Caption", None) is False
    assert is_premium_format("IMAX at AMC", None) is True


def test_tmdb_snapshot_extracts_popularity_without_a_network_call():
    class FakeClient:
        def movie_details(self, tmdb_id: int):
            assert tmdb_id == 11
            return {"id": 11, "popularity": 42.5, "vote_count": 9, "vote_average": 7.1, "revenue": 999}

    rows = build_snapshot(FakeClient(), [{"film_id": "amc-1", "tmdb_id": 11}], "2026-10-02T00:00:00+00:00")
    assert rows == [
        {
            "observed_at": "2026-10-02T00:00:00+00:00",
            "film_id": "amc-1",
            "tmdb_id": 11,
            "popularity": 42.5,
            "vote_count": 9,
            "vote_average": 7.1,
        }
    ]
    row = tmdb_snapshot_row({"id": 3, "popularity": 1}, film_id="x", observed_at="t")
    assert "revenue" not in row
