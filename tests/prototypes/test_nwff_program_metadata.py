"""NWFF program-page metadata extraction (itemprop + Local Sightings credits)."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.prototypes.nwff import parse_program_page

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "prototypes" / "nwff"


def test_local_sightings_dad_genes_credit_line():
    html = (FIXTURES / "local_sightings_dad_genes.html").read_text(encoding="utf-8")
    page = parse_program_page(
        html, url="https://nwfilmforum.org/films/local-sightings-2026-dad-genes/"
    )
    assert page.directors == ["Craig Downing"]
    assert page.release_year == 2025
    assert page.runtime_min == 62
    assert page.raw.get("feature_credit_provenance") == "about_feature_credit_line"


def test_local_sightings_life_in_the_sound_credit_line():
    html = (FIXTURES / "local_sightings_life_in_the_sound.html").read_text(encoding="utf-8")
    page = parse_program_page(
        html, url="https://nwfilmforum.org/films/local-sightings-2026-life-in-the-sound/"
    )
    assert page.directors == ["August Detering"]
    assert page.release_year == 2026
    assert page.runtime_min == 87


def test_local_sightings_into_the_unknown_credit_line():
    html = (FIXTURES / "local_sightings_into_the_unknown.html").read_text(encoding="utf-8")
    page = parse_program_page(
        html,
        url="https://nwfilmforum.org/films/local-sightings-2026-unknown-cancer-story/",
    )
    assert page.directors == ["Matthew Thomas Ross"]
    assert page.release_year == 2025
    assert page.runtime_min == 73


def test_neptune_frost_prefers_itemprop_over_credit_line():
    html = (FIXTURES / "neptune_frost.html").read_text(encoding="utf-8")
    page = parse_program_page(
        html, url="https://nwfilmforum.org/films/wtf-with-stuff-neptune-frost/"
    )
    assert page.directors == ["Saul Williams, Anisia Uzeyman"]
    assert page.release_year == 2021
    assert page.runtime_min == 105
    assert page.raw.get("feature_credit_line") is None


def test_shorts_program_title_skips_credit_promotion():
    html = (FIXTURES / "local_sightings_dad_genes.html").read_text(encoding="utf-8")
    # Same page body, but pretend the listing is a shorts program title.
    html = html.replace(
        "Local Sightings 2026 – Dad Genes",
        "Local Sightings 2026 – Dad Genes (Shorts)",
    )
    page = parse_program_page(
        html, url="https://nwfilmforum.org/films/local-sightings-2026-dad-genes-shorts/"
    )
    assert page.source_title and "shorts" in page.source_title.casefold()
    assert page.directors == []
    assert page.release_year is None
