"""Deterministic performance identity helpers."""

from __future__ import annotations

import hashlib
import re

from reel_seattle.performance_identity.constants import PREFIX_HOST, PREFIX_XSRC_GI

_PERF_ID_RE = re.compile(
    r"^(?:id:[a-f0-9]{8,64}|xsrc:grand-illusion:[a-f0-9]{16})$"
)


def host_compatible_performance_id(public_showtime_id: str) -> str:
    """Identity compatible with today's HomeData opportunity key ``id:<hash>``."""
    cleaned = str(public_showtime_id or "").strip()
    if not cleaned:
        raise ValueError("public_showtime_id is required for host-compatible identity")
    return f"{PREFIX_HOST}{cleaned}"


def gi_performance_id(source_occurrence_id: str) -> str:
    """Deterministic GI-first cross-source identity from durable occurrence id.

    Seeds from ``{program_slug}|{theater_id}|{date}|{time}`` (or equivalent),
    never from display title.
    """
    cleaned = str(source_occurrence_id or "").strip()
    if not cleaned:
        raise ValueError("source_occurrence_id is required for GI performance identity")
    digest = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:16]
    return f"{PREFIX_XSRC_GI}{digest}"


def is_valid_performance_id(value: object) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text:
        return False
    return bool(_PERF_ID_RE.fullmatch(text))


def gi_alias(source_occurrence_id: str) -> str:
    cleaned = str(source_occurrence_id or "").strip()
    if not cleaned:
        raise ValueError("source_occurrence_id required")
    return f"grand_illusion:{cleaned}"


def public_alias(public_showtime_id: str) -> str:
    cleaned = str(public_showtime_id or "").strip()
    if not cleaned:
        raise ValueError("public_showtime_id required")
    return f"public_showtime:{cleaned}"
