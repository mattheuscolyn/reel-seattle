"""Eligibility + title normalization tests."""

from __future__ import annotations

from reel_seattle.film_identity.eligibility import (
    AMBIGUOUS_PROGRAM,
    ELIGIBLE,
    NON_FILM,
    classify_eligibility,
    normalize_search_title,
)


def test_sensory_suffix_stripped_for_search_title():
    assert normalize_search_title("Supergirl: Sensory Friendly Screening") == "Supergirl"


def test_year_and_punctuation_normalization():
    assert normalize_search_title("SINNERS") == "Sinners"
    assert "2024" not in (normalize_search_title("Dune (2024 Event)") or "")


def test_eligibility_feature_vs_programs():
    assert classify_eligibility(source_title="Moana").status == ELIGIBLE
    assert (
        classify_eligibility(source_title="AMC Screen Unseen: July 20").status == NON_FILM
    )
    assert (
        classify_eligibility(source_title="Anniversary Double Feature").status == NON_FILM
    )
    assert classify_eligibility(source_title="NT Live: Hamlet").status == NON_FILM
    fest = classify_eligibility(source_title="Emerald City Short Film Festival")
    assert fest.status in {NON_FILM, AMBIGUOUS_PROGRAM}


def test_screening_qualifier_normalization():
    """Test that all screening qualifiers mentioned in T-IDENTITY-SCREENING-VARIANTS-01 are stripped."""
    # Spider-Man example from the issue
    assert normalize_search_title("Spider-Man: Brand New Day: Sensory Friendly Screening") == "Spider-Man: Brand New Day"
    
    # Sensory Friendly variations
    assert normalize_search_title("The Matrix Sensory Friendly") == "The Matrix"
    assert normalize_search_title("Inception: Sensory Friendly") == "Inception"
    
    # Open Caption
    assert normalize_search_title("Dune: Part Two Open Caption") == "Dune: Part Two"
    assert normalize_search_title("Oppenheimer: Open Caption (in English)") == "Oppenheimer"
    
    # Fan Event
    assert normalize_search_title("Avatar: The Way of Water Fan Event") == "Avatar: The Way of Water"
    assert normalize_search_title("Top Gun: Maverick: Fan Event") == "Top Gun: Maverick"
    
    # Sing-Along
    assert normalize_search_title("The Greatest Showman Sing-Along") == "The Greatest Showman"
    assert normalize_search_title("Mamma Mia! Singalong") == "Mamma Mia!"
    assert normalize_search_title("Frozen: Sing Along Screening") == "Frozen"
    
    # Dubbed / Subtitled
    assert normalize_search_title("Parasite Subtitled") == "Parasite"
    assert normalize_search_title("Your Name: Dubbed") == "Your Name"
    
    # Anniversary Event
    assert normalize_search_title("The Shawshank Redemption 30th Anniversary") == "The Shawshank Redemption"
    assert normalize_search_title("Jurassic Park: 25th Anniversary Event") == "Jurassic Park"
    assert normalize_search_title("Back to the Future 40th Anniversary Screening") == "Back to the Future"
    
    # Premium Format
    assert normalize_search_title("Interstellar IMAX") == "Interstellar"
    assert normalize_search_title("Avatar (IMAX)") == "Avatar"
    assert normalize_search_title("Tenet: Dolby Cinema") == "Tenet"
    assert normalize_search_title("Doctor Strange 3D") == "Doctor Strange"
    assert normalize_search_title("Gravity - IMAX") == "Gravity"
    
    # Closed Caption / Audio Description
    assert normalize_search_title("Barbie Closed Captioned") == "Barbie"
    assert normalize_search_title("Everything Everywhere All at Once: Audio Description") == "Everything Everywhere All at Once"
    
    # Community Screening
    assert normalize_search_title("Little Shop of Horrors: Community Screening") == "Little Shop of Horrors"
    
    # Early Access
    assert normalize_search_title("Wicked Early Access") == "Wicked"
    assert normalize_search_title("Gladiator II: Early Access") == "Gladiator II"
    
    # Opening Night
    assert normalize_search_title("Deadpool & Wolverine Opening Night Fan Event") == "Deadpool & Wolverine"
    assert normalize_search_title("Beetlejuice Beetlejuice: Opening Night") == "Beetlejuice Beetlejuice"
    
    # Encore
    assert normalize_search_title("La La Land Encore") == "La La Land"
    assert normalize_search_title("Moulin Rouge: Encore Screening") == "Moulin Rouge"
    
    # Multiple qualifiers
    assert normalize_search_title("The Lion King IMAX 3D") == "The Lion King"
    assert normalize_search_title("Star Wars: A New Hope: 45th Anniversary IMAX") == "Star Wars: A New Hope"


def test_normalization_preserves_real_titles():
    """Ensure we don't over-strip titles that legitimately contain these words."""
    # These should NOT be stripped because the words are part of the actual title
    assert normalize_search_title("Live Free or Die Hard") == "Live Free or Die Hard"
    # "The Anniversary Party" - "Anniversary" without a number or qualifier should be preserved
    # This is a known edge case, but numbered anniversaries (e.g., "25th Anniversary") will still be stripped
    assert normalize_search_title("The Anniversary Party") == "The Anniversary Party"
    # "Encore!" as a title should be preserved (exclamation makes it distinct from " Encore" suffix)
    assert normalize_search_title("Encore!") == "Encore!"
    # "Sing" as part of the title should be preserved
    assert normalize_search_title("Sing") == "Sing"
    assert normalize_search_title("Sing 2") == "Sing 2"

