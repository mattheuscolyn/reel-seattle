"""Program-series prefixes, exact aliases, and special-event title extraction."""

from __future__ import annotations

from reel_seattle.film_identity.presentation import extract_match_title, normalize_match_title
from reel_seattle.film_identity.title_rules import (
    apply_program_series_prefix,
    preview_prefix_impacts,
)


def test_seven_supplied_examples():
    cases = [
        (
            "Super Troopers 3: Special Broken Lizard Fan Event",
            "amc",
            "Super Troopers 3",
        ),
        ("Michael Mann's Manhunter: The Final Cut", "siff", "Manhunter"),
        ("Cabaret with Charlie's Queer Books", "nwff", "Cabaret"),
        (
            "Nimrods Early Access – Green Day Intro + Bonus Performance",
            "amc",
            "Nimrods",
        ),
        ("Animation Domination - The Wolf House", "nwff", "The Wolf House"),
        (
            "Cold War Summer: Austin Powers: International Man of Mystery",
            "siff",
            "Austin Powers: International Man of Mystery",
        ),
        ("Cold War Summer: The Ipcress File", "siff", "The Ipcress File"),
    ]
    for original, source, expected in cases:
        extracted = extract_match_title(original, source=source)
        assert extracted.base_title == expected, (original, extracted.base_title)
        assert "&" not in (extracted.base_title or "")
        assert not (extracted.base_title or "").endswith((":", "-", "–", "—"))


def test_cold_war_keeps_inner_subtitle():
    extracted = extract_match_title(
        "Cold War Summer: Austin Powers: International Man of Mystery (35mm)",
        source="siff",
    )
    assert extracted.base_title == "Austin Powers: International Man of Mystery"
    assert extracted.program_series == "Cold War Summer"
    assert "35mm" in extracted.format_tags


def test_genuine_with_and_possessive_and_final_cut_preserved():
    assert (
        normalize_match_title("Gone with the Wind", source="amc") == "Gone with the Wind"
    )
    assert (
        normalize_match_title("Singin' in the Rain", source="amc")
        == "Singin' in the Rain"
    )
    # Legitimate Final Cut title without reviewed alias stays intact.
    assert (
        normalize_match_title("Blade Runner: The Final Cut", source="amc")
        == "Blade Runner: The Final Cut"
    )


def test_genuine_colon_and_dash_subtitles_remain():
    assert (
        normalize_match_title("Spider-Man: Brand New Day", source="amc")
        == "Spider-Man: Brand New Day"
    )
    assert (
        normalize_match_title("Mission: Impossible - Dead Reckoning", source="amc")
        == "Mission: Impossible - Dead Reckoning"
    )


def test_unregistered_series_like_prefix_not_stripped():
    title = "Mystery Marathon: Some Obscure Film"
    assert normalize_match_title(title, source="siff") == title


def test_registered_series_punctuation_variants():
    for sep in (": ", " - ", " – ", " — "):
        title = f"Animation Domination{sep}The Wolf House"
        extracted = extract_match_title(title, source="nwff")
        assert extracted.base_title == "The Wolf House"
        assert extracted.program_series == "Animation Domination"


def test_source_scoped_series_rules():
    title = "Cold War Summer: The Ipcress File"
    # SIFF-scoped: applies for siff, not for amc/nwff.
    assert extract_match_title(title, source="siff").base_title == "The Ipcress File"
    assert extract_match_title(title, source="amc").base_title == title
    assert apply_program_series_prefix(title, source="nwff") is None


def test_source_scoped_alias_rules():
    title = "Michael Mann's Manhunter: The Final Cut"
    assert extract_match_title(title, source="siff").base_title == "Manhunter"
    assert extract_match_title(title, source="amc").base_title == title


def test_preview_prefix_impacts_lists_affected_titles():
    titles = [
        "Cold War Summer: The Ipcress File",
        "Cold War Summer: Austin Powers: International Man of Mystery",
        "Unrelated Film",
    ]
    impacts = preview_prefix_impacts(titles, source="siff")
    cold = next(row for row in impacts if row["prefix"] == "Cold War Summer")
    assert cold["affected_count"] == 2
    remainders = {row["remainder"] for row in cold["affected"]}
    assert "The Ipcress File" in remainders
    assert "Austin Powers: International Man of Mystery" in remainders


def test_truth_to_fiction_and_community_screening_prefixes():
    sherman = extract_match_title(
        "Truth To Fiction: Sherman's March (4K Restoration)",
        source="nwff",
    )
    assert sherman.base_title == "Sherman's March"
    assert sherman.program_series == "Truth To Fiction"
    assert "4K Restoration" in " ".join(sherman.format_tags) or any(
        "4K" in p or "4k" in p.lower() for p in sherman.removed_phrases
    )
    assert sherman.original_title.startswith("Truth To Fiction")

    little = extract_match_title(
        "Community Screening: Little Shop of Horrors",
        source="siff",
    )
    assert little.base_title == "Little Shop of Horrors"
    assert little.program_series == "Community Screening"
    assert little.original_title == "Community Screening: Little Shop of Horrors"

    # Inner subtitle after registered prefix remains intact.
    nested = extract_match_title(
        "Truth To Fiction: Some Film: Extended Cut",
        source="nwff",
    )
    assert nested.base_title == "Some Film: Extended Cut"
    assert nested.program_series == "Truth To Fiction"

    # Unregistered colon prefixes are not removed.
    assert (
        normalize_match_title("Mystery Marathon: Some Obscure Film", source="siff")
        == "Mystery Marathon: Some Obscure Film"
    )

    # Source scoping: Community Screening is SIFF-only.
    assert (
        extract_match_title(
            "Community Screening: Little Shop of Horrors",
            source="amc",
        ).base_title
        == "Community Screening: Little Shop of Horrors"
    )


def test_super_troopers_event_metadata_preserved():
    extracted = extract_match_title(
        "Super Troopers 3: Special Broken Lizard Fan Event",
        source="amc",
    )
    assert extracted.base_title == "Super Troopers 3"
    assert extracted.event_phrase == "Special Broken Lizard Fan Event"
    assert "event_suffix" in extracted.applied_rules


def test_urgh_co_presentation_alias():
    extracted = extract_match_title(
        "URGH! A MUSIC WAR W/ THE PROFESSORS OF URGH",
        source="beacon",
    )
    assert extracted.base_title == "Urgh! A Music War"
    assert extracted.original_title.upper().startswith("URGH!")


def test_program_series_preserved_in_diagnostics_transform():
    from reel_seattle.film_identity.review_diagnostics import title_transform_diff

    transform = title_transform_diff(
        "Community Screening: Little Shop of Horrors",
        "Little Shop of Horrors",
        source="siff",
    )
    assert transform["program_series"] == "Community Screening"
    assert transform["normalized_search_title"] == "Little Shop of Horrors"
    assert transform["original_title"] == "Community Screening: Little Shop of Horrors"
