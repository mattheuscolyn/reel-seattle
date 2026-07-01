"""Tests for source identity field helpers."""

from __future__ import annotations

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.source_identity import (
    source_film_id_from_history_row,
    source_film_id_from_raw,
    source_title_from_history_row,
    source_title_from_raw,
)


def test_source_film_id_from_raw_reads_movie_id_attribute():
    raw = RawShowtime(
        theater_name_raw="AMC Pacific Place 11",
        date_raw="06/28/2026",
        time_raw="8:00PM",
        title_raw="Supergirl: Sensory Friendly Screening",
        attributes={"movie_id": "movie-supergirl"},
    )
    assert source_film_id_from_raw(raw) == "movie-supergirl"


def test_source_title_from_raw_uses_exact_title():
    raw = RawShowtime(
        theater_name_raw="AMC Pacific Place 11",
        date_raw="06/28/2026",
        time_raw="8:00PM",
        title_raw="MOANA IMAX Opening Night Fan Event",
    )
    assert source_title_from_raw(raw) == "MOANA IMAX Opening Night Fan Event"


def test_history_row_source_identity_null_safe():
    row = {"Film": "Sinners", "source_film_id": "", "source_title": ""}
    assert source_film_id_from_history_row(row) is None
    assert source_title_from_history_row(row) == "Sinners"
