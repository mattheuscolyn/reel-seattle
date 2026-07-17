"""AMC API showtime metadata extraction (adapter layer)."""

from __future__ import annotations

from typing import Any, Mapping


def extract_showtime_metadata(showtime: Mapping[str, Any]) -> dict[str, object]:
    """Extract optional AMC metadata into a JSON-safe attributes dict."""
    payload: dict[str, object] = {}
    for api_key, attr_key in (
        ("movieId", "movie_id"),
        ("movieUrl", "movie_url"),
        ("sellUntilDateTimeUtc", "sell_until_utc"),
        ("genre", "genre"),
        ("rating", "mpaa_rating"),
    ):
        value = showtime.get(api_key)
        if value not in (None, ""):
            payload[attr_key] = value
    return payload


def _json_safe(value: Any) -> Any:
    """Return a JSON-serializable deep copy of *value*."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return str(value)


def _copy_present(
    showtime: Mapping[str, Any],
    api_key: str,
    payload: dict[str, object],
    attr_key: str,
) -> None:
    """Copy *api_key* into *payload* when the key exists (including null)."""
    if api_key not in showtime:
        return
    payload[attr_key] = _json_safe(showtime[api_key])


def extract_showtime_raw_extensions(showtime: Mapping[str, Any]) -> dict[str, object]:
    """Preserve high-value AMC Showtimes fields for raw daily logs (P-18A).

    Extends ``record.attributes`` only. Does not change public or history mapping.
    Distinguishes AMC source ``attributes[]`` as ``amc_attributes``.
    """
    payload: dict[str, object] = {}

    for api_key, attr_key in (
        ("performanceNumber", "performance_number"),
        ("theatreId", "theatre_id"),
        ("wwmReleaseNumber", "wwm_release_number"),
        ("internalReleaseNumber", "internal_release_number"),
        ("lastUpdatedDateUtc", "last_updated_utc"),
        ("showDateTimeUtc", "show_datetime_utc"),
    ):
        _copy_present(showtime, api_key, payload, attr_key)

    if "attributes" in showtime:
        # Source-native attributes[]; keep distinct from Reel Seattle's attributes object.
        payload["amc_attributes"] = _json_safe(showtime["attributes"])

    if "languages" in showtime:
        languages = showtime["languages"]
        if isinstance(languages, Mapping):
            lang_out: dict[str, object] = {}
            for api_key, out_key in (
                ("spoken", "spoken"),
                ("dubbedOver", "dubbed_over"),
                ("subtitle", "subtitle"),
            ):
                if api_key in languages:
                    lang_out[out_key] = _json_safe(languages[api_key])
            payload["languages"] = lang_out
        else:
            payload["languages"] = {"_malformed": _json_safe(languages)}

    for api_key, attr_key in (
        ("isSoldOut", "is_sold_out"),
        ("isEmbargoed", "is_embargoed"),
        ("embargoed", "embargoed"),
        ("visibilityDateTimeUtc", "visibility_datetime_utc"),
        ("isComingSoon", "is_coming_soon"),
        ("inTheatreTicketingOnly", "in_theatre_ticketing_only"),
    ):
        _copy_present(showtime, api_key, payload, attr_key)

    for api_key, attr_key in (
        ("auditorium", "auditorium"),
        ("virtualAuditoriumId", "virtual_auditorium_id"),
        ("layoutId", "layout_id"),
        ("layoutVersionNumber", "layout_version_number"),
    ):
        _copy_present(showtime, api_key, payload, attr_key)

    if "ticketPrices" in showtime:
        payload["ticket_prices"] = _json_safe(showtime["ticketPrices"])

    for api_key, attr_key in (
        ("isDiscountMatineePriced", "is_discount_matinee_priced"),
        ("discountMatineeMessage", "discount_matinee_message"),
        ("isDiscountDaysEligible", "is_discount_days_eligible"),
        ("estimatedFees", "estimated_fees"),
        ("purchaseUrl", "purchase_url"),
        ("mobilePurchaseUrl", "mobile_purchase_url"),
    ):
        _copy_present(showtime, api_key, payload, attr_key)

    return payload
