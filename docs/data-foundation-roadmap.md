# Reel Seattle — Data Foundation Roadmap

**Status:** Living backlog  
**Track:** Data Foundation (+ related Film Identity / Developer Tooling)  
**Last updated:** 2026-07-15  
**Audience:** Product owner, ChatGPT (architect), Cursor (implementation)

This is the durable backlog for data-foundation and developer-tooling work. Use it to answer “what is complete?”, “what is next?”, and “what is intentionally deferred?”

Do **not** turn this into a ticket system. Keep statuses updated after meaningful tasks. Link out to detailed design docs instead of duplicating them.

**Related:** [development-operating-model.md](./development-operating-model.md) · [data-artifact-inventory.md](./data-artifact-inventory.md) · [product-roadmap.md](./product-roadmap.md) · [film-identity-normalization.md](./film-identity-normalization.md) · [amc-source-catalog.md](./amc-source-catalog.md)

---

## Status legend

| Status | Meaning |
|--------|---------|
| `Complete` | Shipped on `main`; docs/tests exist |
| `Next` | Immediate implementation candidate |
| `Planned` | Agreed direction; not started |
| `Deferred` | Explicitly postponed; do not start without approval |
| `Research needed` | Measurement/design required before implementation |

---

## Current strategy

1. Keep the **public site stable** (GitHub Pages legacy app).
2. Strengthen the **data foundation** (schemas, history, source evidence, validation).
3. Add **developer inspection tooling** (cockpit, audits, offline CLIs).
4. Build a **future public site** on the improved data model — separately scoped.

Public UI must not change merely because new source fields are captured.

---

## Completed foundations

| Item | Status | Docs / notes |
|------|--------|--------------|
| Public artifact validation | `Complete` | `scripts/validate_public_data_artifacts.py`, schemas under `schema/` |
| Strict history CSV validation | `Complete` | `scripts/validate_history_csv.py --strict` |
| Data artifact inventory | `Complete` | [data-artifact-inventory.md](./data-artifact-inventory.md) |
| Scrape diagnostics / pipeline report | `Complete` | `reel_seattle/pipeline_report.py`, `public/data/pipeline_report.json` |
| Developer Data Cockpit (inspection) | `Complete` | Internal tooling; not public product UI |
| AMC IMDb coverage audit | `Complete` | [amc-imdb-coverage-audit.md](./amc-imdb-coverage-audit.md) — sampled Movies path had **0** usable IMDb IDs |
| AMC `wwmReleaseNumber` relationship audit | `Complete` | [amc-wwm-release-audit.md](./amc-wwm-release-audit.md) — useful grouping evidence, not auto-merge |
| AMC source-observation prototype | `Complete` | [amc-source-observation-prototype.md](./amc-source-observation-prototype.md) — superseded for durable work |
| Durable AMC source-catalog contracts | `Complete` | [amc-source-catalog.md](./amc-source-catalog.md) — products + derived releases |
| AMC catalog refresh stage (offline/live CLI) | `Complete` | [amc-source-catalog.md](./amc-source-catalog.md) — not wired to daily workflow |
| Daily catalog integration **design** | `Complete` | [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md) |

---

## Active / next

| ID | Item | Status | Dependency | Notes |
|----|------|--------|------------|-------|
| P-14C | Daily integration design + this roadmap | `Complete` | P-14A/B | Docs only |
| **P-14D** | **Wire AMC source catalog into daily workflow** | `Next` | P-14C design | Non-blocking late stage; `all-active`; atomic promotion; same generated-data commit |

P-14D outline: see [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md) §9.

---

## Planned AMC source-catalog work

| Item | Status | Notes |
|------|--------|-------|
| Daily workflow integration (P-14D) | `Next` | Soft-fail; retain prior catalogs on error |
| Safe / atomic catalog writes | `Next` | Part of P-14D |
| Catalog diagnostics (stdout / optional messages) | `Next` | No pipeline-report schema bump required initially |
| Cockpit source-product / release inspection | `Planned` | After catalogs exist in `data/source_catalog/` |
| Refresh cadence evaluation (`all-active` → optional `stale`) | `Planned` | Measure wall time + metadata churn first |
| Inactive-product growth monitoring | `Planned` | Catalog retains inactive products by design |

**Decision notes**

* Product grain = `(amc, source_film_id)`; release grain = nullable `wwmReleaseNumber` evidence only.
* Never merge products from shared release IDs.
* Catalog is internal — not public, not Pages, not SPA.

---

## Planned AMC Showtimes field audits

Measurement-only audits against live or fixture Showtimes API payloads. Do not change production scrape fields until an audit recommends it.

### Showtime field-population audit — `Research needed`

Measure coverage and usefulness of:

* identity/time: source showtime `id`, `performanceNumber`, `internalReleaseNumber`, `showDateTimeUtc`, `showDateTimeLocal`, `sellUntilDateTimeUtc`, `lastUpdatedDateUtc`
* auditorium: `auditorium`, `layoutId`, `layoutVersionNumber`, `virtualAuditoriumId`, `maximumIntendedAttendance`
* status flags: `isSoldOut`, `isAlmostSoldOut`, `isCanceled`, `isEmbargoed`, `isComingSoon`, `visibilityDateTimeUtc`
* commerce/media: `hasTrailers`, `inTheatreTicketingOnly`, `purchaseUrl`, `mobilePurchaseUrl`, pricing/discount fields, media
* language: language fields (detail in Language audit)
* `attributes[]`

**Depends on:** stable AMC showtime scrape logs / API samples  
**Output:** coverage tables + keep/drop/defer recommendations

### Showtime identity audit — `Research needed`

Determine whether AMC showtime `id`, `performanceNumber`, theater, date/time, and movie ID form a stable source-showtime identity.

Must investigate current **duplicate internal showtime-ID pairs** observed in processing.

**Depends on:** field-population samples + history rows  
**Decision bar:** no production identity key change without explicit approval

### Attribute-code taxonomy audit — `Research needed`

Inventory actual AMC showtime `attributes[].code`, `name`, and `description`.

Classify into:

* premium format
* accessibility
* language
* event/presentation
* ticketing
* operational/internal
* unknown

Do **not** assume every AMC attribute should be public-facing.

**Feeds:** Unified presentation-attribute architecture (below)

### Language audit — `Research needed`

Measure `languages.spoken`, `languages.dubbedOver`, `languages.subtitle`.

Determine coverage, reliability, and how dubbed/subtitled screenings should be represented in the unified attribute model (not as a one-off boolean).

### Pricing audit — `Research needed`

Evaluate `ticketPrices[]`, taxes, ticket types, age policy, discount matinee, discount-day eligibility, estimated fees.

Keep pricing **separate** from presentation attributes.

### Auditorium / layout audit — `Research needed`

Evaluate whether auditorium and layout fields support future:

* screen-level theater entities,
* capacity,
* seating-layout inspection,
* auditorium format capabilities.

---

## Unified showtime presentation-attribute architecture

| Item | Status |
|------|--------|
| Architecture direction agreed | `Planned` |
| Implementation / schema migration | `Deferred` until audits + product acceptance |
| Public UI consumption | `Deferred` |

### Direction

Do **not** rely on only:

```text
premium_format
```

Prefer an extensible structured collection, for example:

```json
{
  "presentation_attributes": [
    {
      "code": "imax",
      "category": "format",
      "label": "IMAX",
      "source": "amc",
      "source_code": "IMAX"
    },
    {
      "code": "open_caption",
      "category": "accessibility",
      "label": "Open Caption",
      "source": "amc",
      "source_code": "OPENCAPTION"
    },
    {
      "code": "dubbed",
      "category": "language",
      "label": "Dubbed in English",
      "language": "English",
      "source": "amc"
    },
    {
      "code": "q_and_a",
      "category": "event",
      "label": "Q&A",
      "source": "amc",
      "source_code": "INPERSNQA"
    }
  ]
}
```

### Principles

* One showtime may have multiple presentation attributes.
* Premium formats, accessibility, language presentations, and event types share one extensible field.
* Categories remain distinguishable.
* Source codes and labels are preserved for provenance.
* Open captions and closed-caption-device availability remain **separate** codes.
* Raw AMC fields remain available.
* UI behavior is deferred.
* Attributes may originate at **movie-product** or **individual-showtime** grain.
* Final display collections may combine both grains without losing provenance.
* Pricing, ticket status, and auditorium data do **not** belong in this collection.

**Depends on:** attribute-code taxonomy + language audits  
**Related product grain work:** AMC source catalog presentation classifier (product-level only today)

---

## Planned film identity and enrichment

| Item | Status | Notes |
|------|--------|-------|
| Source products + release observations (AMC) | `Complete` / `Next` wiring | Catalog contracts complete; daily wiring next |
| Reel Seattle-owned canonical `film_id` | `Planned` | Authored/derived carefully; not AMC release ID |
| Confidence-based product→film matching | `Planned` | Explicit confidence; no silent merges |
| TMDB search (title/year/runtime + evidence) | `Planned` | After source catalog stability |
| External identifiers with provenance | `Planned` | Store source + method + observed_at |
| Optional Letterboxd via TMDB ID | `Planned` | Never primary identity |
| Match solely on title | `Deferred` / forbidden as sole key | — |
| Match solely on `wwmReleaseNumber` | `Deferred` / forbidden as sole key | Grouping evidence only |

See also [film-identity-normalization.md](./film-identity-normalization.md).

---

## Planned theater model expansion

| Field / capability | Status |
|--------------------|--------|
| Address | `Planned` |
| Coordinates | `Planned` |
| Neighborhood / city | `Planned` |
| Number of screens | `Planned` |
| Individual auditoriums (if audits justify) | `Research needed` |
| Accessibility / format capabilities | `Planned` |
| External source IDs / aliases | `Planned` |

Registry remains canonical authored data (`data/theaters.json`). Expand only with validation and inventory updates.

---

## Deferred public-site work

| Item | Status | Notes |
|------|--------|-------|
| Public UI redesign to show new source fields | `Deferred` | Requires separate product decision |
| Pages exposure of source catalogs | `Deferred` / not planned | Catalogs are internal |
| Leaving Soon UI expansion | `Deferred` | Gated in [product-roadmap.md](./product-roadmap.md) |
| Next public site build | `Deferred` | Design-first; separate track |

---

## Suggested sequencing (near term)

```text
P-14D  Wire AMC catalog into daily workflow (non-blocking)
   ↓
Observe catalog runtime + failure rates for ~1–2 weeks
   ↓
Cockpit: browse durable products/releases (optional)
   ↓
AMC Showtimes field-population + attribute taxonomy audits
   ↓
Language / pricing / auditorium audits as needed
   ↓
Presentation-attribute schema design (still no public UI)
   ↓
Film matching / TMDB enrichment design
```

---

## Maintenance rules

After each meaningful data-foundation task:

1. Update this file’s statuses and “Last updated”.
2. Mark completed work `Complete` with doc links.
3. Record newly discovered follow-ups as `Planned` or `Research needed`.
4. Do **not** silently drop `Deferred` items.
5. Use this roadmap as the source for “what should we do next?” discussions.

Operating-model reminder: [development-operating-model.md](./development-operating-model.md).
