"""Grand Illusion prototype parsing and discovery tests."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reel_seattle.history_keys import load_theater_index
from reel_seattle.prototypes.grand_illusion import (
    FIXTURE_WP_ID_TO_SLUG,
    build_grand_illusion_result,
    composite_showtime_id,
    fixture_fetch_map,
    history_format_from_raw,
    parse_calendar_html,
    parse_film_page_html,
    resolve_screening_venue,
)

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "prototypes" / "grand_illusion"


def test_calendar_exposes_data_filmid_not_film_hrefs():
    html = (FIXTURE_DIR / "calendar_2026-09.html").read_text(encoding="utf-8")
    assert "/film/" not in html or 'href="/film/' not in html
    assert "data-filmid" in html
    label, occs = parse_calendar_html(html)
    assert label and "September" in label
    assert any(o.wp_film_id == "6945" for o in occs)
    hole = [o for o in occs if o.wp_film_id == "6945" and o.local_date == date(2026, 9, 20)]
    assert hole and set(hole[0].local_times) == {"13:30", "18:30"}


def test_film_page_parse_hole_venue_format_and_identity():
    idx = load_theater_index()
    html = (FIXTURE_DIR / "film_the-hole-in-35mm.html").read_text(encoding="utf-8")
    parsed = parse_film_page_html(html, theater_index=idx)
    assert parsed.source_program_id == "the-hole-in-35mm"
    assert parsed.theater_id == "siff-film-center"
    assert parsed.format_raw == "35mm"
    assert history_format_from_raw(parsed.format_raw) == "35mm"
    assert parsed.director and "Tsai" in parsed.director
    assert parsed.runtime_min == 89
    assert (date(2026, 9, 20), "13:30") in parsed.showtimes


def test_unknown_venue_rejected():
    idx = load_theater_index()
    theater_id, name, unknown, reason = resolve_screening_venue(
        "Mystery Barn – 1 Nowhere St", idx
    )
    assert theater_id is None and unknown and reason


def test_mailing_address_not_venue():
    idx = load_theater_index()
    theater_id, _, unknown, reason = resolve_screening_venue(
        "4730 University Way NE #1330", idx
    )
    assert theater_id is None and unknown
    assert reason == "mailing_address_not_venue"


def test_ordinary_dcp_not_premium():
    assert history_format_from_raw("DCP") == ""
    assert history_format_from_raw("digital") == ""
    assert history_format_from_raw("4K DCP") == ""
    assert history_format_from_raw("16mm") == "16mm"


def test_composite_occurrence_id_stable():
    assert (
        composite_showtime_id(
            "the-hole-in-35mm", "siff-film-center", date(2026, 9, 20), "13:30"
        )
        == "the-hole-in-35mm|siff-film-center|2026-09-20|13:30"
    )


def test_build_result_from_fixtures_discovers_via_wp_id():
    idx = load_theater_index()
    fetch = fixture_fetch_map(FIXTURE_DIR, wp_id_to_slug=FIXTURE_WP_ID_TO_SLUG)
    result = build_grand_illusion_result(
        start_date=date(2026, 9, 20),
        end_date=date(2026, 10, 31),
        fetch=fetch,
        scraped_at="2026-09-20T12:00:00-07:00",
        theater_index=idx,
    )
    assert result["status"] == "success"
    assert result["restate_safe"] is True
    assert result["identity"]["program_strategy"] == "canonical_url_slug"
    programs = {p["source_program_id"] for p in result["programs"]}
    assert "the-hole-in-35mm" in programs
    assert "shu-lea-cheang-double-feature" in programs
    assert "television-terror-triple-feature-pizza-party-2" in programs
    theaters = {s["theater_id"] for s in result["showtimes"]}
    assert "siff-film-center" in theaters
    assert "central-cinema" in theaters
    assert "northwest-film-forum" in theaters
