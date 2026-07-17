# AMC Showtimes Raw Capture (P-18A)

**Status:** Complete  
**Track:** Data Foundation  
**Last updated:** 2026-07-17  
**Related:** [amc-showtimes-field-audit.md](./amc-showtimes-field-audit.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md)

## Purpose

Expand `api_showtime_to_raw` so daily AMC scrape logs retain high-value Showtimes API fields needed for identity, presentation-attribute, language, pricing, auditorium, and availability audits.

This is raw source preservation only. History schema, public JSON, pipeline report, cockpit, frontend, and AMC source catalog are unchanged.

## Log contract

Envelope remains:

```json
{
  "schema_version": "1.0.0",
  "generated_at": "...",
  "source": "amc",
  "records": []
}
```

Optional fields are added inside each record’s Reel Seattle `attributes` object. No schema version bump.

## Naming: Reel Seattle attributes vs AMC attributes

| Concept | Path |
|---------|------|
| Reel Seattle flattened attribute container | `record.attributes` |
| AMC source-native `attributes[]` array | `record.attributes.amc_attributes` |

Do not call both simply `attributes`.

## Fields already captured before P-18A

* `source_showtime_id` ← AMC `id`
* `attributes.movie_id`, `movie_url`, `sell_until_utc`, `genre`, `mpaa_rating`
* `format_raw` / `premium_format_raw`
* `canceled`, `almost_sold_out`
* `has_trailers`, `maximum_intended_attendance`
* title / theater / date / time / runtime / poster

## Fields added by P-18A

| API path | Log path |
|----------|----------|
| `performanceNumber` | `attributes.performance_number` |
| `theatreId` | `attributes.theatre_id` |
| `wwmReleaseNumber` | `attributes.wwm_release_number` |
| `internalReleaseNumber` | `attributes.internal_release_number` |
| `lastUpdatedDateUtc` | `attributes.last_updated_utc` |
| `showDateTimeUtc` | `attributes.show_datetime_utc` |
| `attributes[]` | `attributes.amc_attributes` |
| `languages.spoken` | `attributes.languages.spoken` |
| `languages.dubbedOver` | `attributes.languages.dubbed_over` |
| `languages.subtitle` | `attributes.languages.subtitle` |
| `isSoldOut` | `attributes.is_sold_out` |
| `isEmbargoed` | `attributes.is_embargoed` |
| `embargoed` | `attributes.embargoed` |
| `visibilityDateTimeUtc` | `attributes.visibility_datetime_utc` |
| `isComingSoon` | `attributes.is_coming_soon` |
| `inTheatreTicketingOnly` | `attributes.in_theatre_ticketing_only` |
| `auditorium` | `attributes.auditorium` |
| `virtualAuditoriumId` | `attributes.virtual_auditorium_id` |
| `layoutId` | `attributes.layout_id` |
| `layoutVersionNumber` | `attributes.layout_version_number` |
| `ticketPrices[]` | `attributes.ticket_prices` |
| `isDiscountMatineePriced` | `attributes.is_discount_matinee_priced` |
| `discountMatineeMessage` | `attributes.discount_matinee_message` |
| `isDiscountDaysEligible` | `attributes.is_discount_days_eligible` |
| `estimatedFees` | `attributes.estimated_fees` |
| `purchaseUrl` | `attributes.purchase_url` |
| `mobilePurchaseUrl` | `attributes.mobile_purchase_url` |

Keys are copied when present on the API object (including null). Missing keys stay absent so null vs missing remains distinguishable.

## Intentionally deferred

| Field | Why |
|-------|-----|
| Extra `media.*` variants (hero, trailers, alternate posters) | Product-grain; prefer source catalog |
| `sortableMovieName` | Catalog already has sortable title |
| `utcOffset` | Low value vs local + UTC timestamps |
| `_links` | Unbounded / low audit value |
| Public emission of `source_showtime_id` / ticket URLs / prices | Out of scope |

## Product-grain duplication

* `wwmReleaseNumber` / `movieId` / genre / poster remain per showtime for join audits.
* Large media variants stay deferred to the catalog.
* Showtime-varying attributes, languages, prices, and auditorium fields stay on the showtime log.

## Compatibility

* Pre-P-18A logs remain readable.
* Processor / history / public paths ignore unknown attribute keys.
* No historical log migration.

## Size impact

On a fully populated synthetic showtime (fixture), one serialized record grew from ~627 bytes to ~1921 bytes (~206% increase). Largest new contributors: `ticket_prices`, `amc_attributes`, purchase URLs, `languages`.

Projected against the 2026-07-17 committed log (~2.85 MB / 3502 records), a fully populated day could approach ~8–9 MB if every record carries rich prices and attributes. Real population will vary; revisit if growth is disproportionate.

## Audit readiness

P-15A (`reel_seattle.analysis.amc_showtimes_field_audit`) reads:

* `attributes.amc_attributes`
* `attributes.languages.*`
* identity / pricing / auditorium / availability paths above

Old logs still load; population counts stay zero until expanded logs accumulate. Prefer multiple production days before taxonomy conclusions.

## Observation period

Accumulate **at least two** expanded scheduled daily logs before drawing presentation-attribute taxonomy conclusions.
