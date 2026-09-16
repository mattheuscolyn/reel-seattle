"""Focused regression tests for product Special Events classification."""

from __future__ import annotations

from reel_seattle.analysis.film_identity import (
    derive_parent_identity,
    infer_parent_display_title,
)
from reel_seattle.analysis.special_event import (
    TYPE_EARLY_ACCESS,
    TYPE_FAN_EVENT,
    TYPE_MYSTERY_SCREENING,
    TYPE_OPENING_NIGHT,
    TYPE_OTHER_EVENT,
    TYPE_Q_AND_A,
    TYPE_SNEAK_PREVIEW,
    TYPE_SPECIAL_PRESENTATION,
    classify_special_event,
)


def _types(payload):
    return payload["types"]


def test_true_qa_and_guest_appearance():
    payload = classify_special_event(
        title="The Invite - Q&A with Filmmaker/Actor Olivia Wilde"
    )
    assert payload["is_special_event"] is True
    assert TYPE_Q_AND_A in _types(payload)
    assert payload["confidence"] == "high"
    assert any("Q&A" in label or "Olivia" in label for label in payload["labels"])


def test_true_director_cast_appearance_without_qa_token():
    payload = classify_special_event(
        title="Sunny Dancer with Director George Jaques and Neil Patrick Harris"
    )
    assert payload["is_special_event"] is True
    assert TYPE_Q_AND_A in _types(payload)


def test_true_early_access():
    payload = classify_special_event(title="The Weight Early Access")
    assert payload["is_special_event"] is True
    assert _types(payload) == [TYPE_EARLY_ACCESS]


def test_true_sneak_preview():
    payload = classify_special_event(
        title="Crunchyroll Anime Nights Sneak Peek - September '26"
    )
    assert payload["is_special_event"] is True
    assert TYPE_SNEAK_PREVIEW in _types(payload)


def test_true_opening_night_event():
    payload = classify_special_event(
        title="Forgotten Island - Friendship Opening Night Event"
    )
    assert payload["is_special_event"] is True
    assert TYPE_OPENING_NIGHT in _types(payload)


def test_true_fan_event():
    payload = classify_special_event(title="Other Mommy Fan Event Screening")
    assert payload["is_special_event"] is True
    assert TYPE_FAN_EVENT in _types(payload)


def test_true_mystery_screening():
    payload = classify_special_event(title="AMC Screen Unseen: September 21")
    assert payload["is_special_event"] is True
    assert TYPE_MYSTERY_SCREENING in _types(payload)


def test_format_plus_event_remain_orthogonal():
    payload = classify_special_event(
        title="Forgotten Island - Early Access Screening with Cast Member Q&A",
        format_tags=["dolby-cinema-at-amc", "closed-caption"],
    )
    assert payload["is_special_event"] is True
    assert TYPE_EARLY_ACCESS in _types(payload)
    assert TYPE_Q_AND_A in _types(payload)
    assert any(e.get("kind") == "orthogonal_format_tags" for e in payload["evidence"])


def test_false_plain_formats_and_accessibility():
    for title, formats in (
        ("Sinners", ["35mm"]),
        ("Dune: Part Two", ["imax"]),
        ("Wicked", ["dolby-cinema-at-amc"]),
        ("Superman: Open Caption", ["open-caption"]),
        ("Moana: Sensory Friendly Screening", []),
        ("Parasite Subtitled", []),
        ("Godzilla Dubbed", []),
    ):
        payload = classify_special_event(title=title, format_tags=formats)
        assert payload["is_special_event"] is False, title


def test_false_anniversary_rerelease_without_event_component():
    payload = classify_special_event(title="Cars: 20th Anniversary")
    assert payload["is_special_event"] is False
    assert "anniversary_only" in payload.get("audit_signals", [])


def test_false_yyyy_event_product_label():
    payload = classify_special_event(title="The Passion of the Christ (2026 Event)")
    assert payload["is_special_event"] is False


def test_false_coyote_vs_acme_legacy_special_event_flag():
    """Analysis ``special_event_like`` matches ``vs.`` — product classifier must not."""
    payload = classify_special_event(title="Coyote vs. Acme")
    assert payload["is_special_event"] is False


def test_false_ordinary_repertory_and_limited():
    for title in ("Jules and Jim", "Hamnet", "The Brutalist"):
        payload = classify_special_event(title=title)
        assert payload["is_special_event"] is False, title


def test_amc_specific_attribute_code_is_high_confidence():
    payload = classify_special_event(
        title="Announced Film",
        attribute_codes=["INPERSNQA", "RESERVEDSEATING"],
    )
    assert payload["is_special_event"] is True
    assert TYPE_Q_AND_A in _types(payload)
    assert payload["confidence"] == "high"


def test_generic_event_attribute_alone_is_not_published():
    payload = classify_special_event(
        title="Juan Gabriel: Mi Primer Bellas Artes",
        attribute_codes=["EVENT", "ALTERNATIVECONTENT"],
    )
    assert payload["is_special_event"] is False
    assert "generic_event_attribute" in payload.get("audit_signals", [])


def test_concert_met_opera_is_audit_only_not_special_events_page():
    payload = classify_special_event(title="MET Opera: Carmen (2026)")
    assert payload["is_special_event"] is False
    assert "concert_or_event_cinema" in payload.get("audit_signals", [])


def test_double_feature_alone_is_audit_only():
    payload = classify_special_event(title="Alien Double Feature")
    assert payload["is_special_event"] is False
    assert "double_feature" in payload.get("audit_signals", [])


def test_sing_along_publishes_as_other_event():
    payload = classify_special_event(title="Wicked - Sing-Along")
    assert payload["is_special_event"] is True
    assert TYPE_OTHER_EVENT in _types(payload)


def test_siff_special_screening_plus_qa_preserves_label():
    payload = classify_special_event(
        title="Beware! The Devil’s Wrath - Special Screening + Q&A"
    )
    assert payload["is_special_event"] is True
    assert TYPE_Q_AND_A in _types(payload)
    assert TYPE_SPECIAL_PRESENTATION in _types(payload)
    assert any("Special Screening" in label or "Q&A" in label for label in payload["labels"])


def test_parent_normalization_survives_while_event_metadata_remains():
    title = "PAW Patrol: The Dino Movie - Early Access"
    parent = infer_parent_display_title(title)
    assert parent == "PAW Patrol: The Dino Movie"
    identity = derive_parent_identity(title, source_film_id="9001")
    assert identity.parent_display_title == "PAW Patrol: The Dino Movie"
    payload = classify_special_event(title=title)
    assert payload["is_special_event"] is True
    assert _types(payload) == [TYPE_EARLY_ACCESS]


def test_qa_suffix_strips_to_parent_film():
    title = "Forgotten Island - Early Access Screening with Cast Member Q&A"
    parent = infer_parent_display_title(title)
    assert parent == "Forgotten Island"
    payload = classify_special_event(title=title)
    assert payload["is_special_event"] is True
    assert TYPE_EARLY_ACCESS in _types(payload)
    assert TYPE_Q_AND_A in _types(payload)


def test_description_field_can_supply_event_copy():
    payload = classify_special_event(
        title="Local Feature",
        description="Q&A with director Jane Smith following the screening",
    )
    assert payload["is_special_event"] is True
    assert TYPE_Q_AND_A in _types(payload)
    assert any("Jane Smith" in label or "Q&A" in label for label in payload["labels"])
