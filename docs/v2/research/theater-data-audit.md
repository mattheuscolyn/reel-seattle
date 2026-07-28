# Theater Data Audit (pre–Theater Detail wiring)

**Status:** Complete (research / inventory only) · **Date:** 2026-07-26  
**Scope:** Inventory theater-related data already in the repository, what mockups expect, and what still needs curation or derivation — **before** implementing Theater list/detail production UI.  
**Non-goals (this packet):** No code changes · no schema changes · no mockup edits · no Theater Detail implementation · no scraping · no new venues.

**Authoritative inputs:**  
[v2-front-back-integration-roadmap.md](../v2-front-back-integration-roadmap.md) · [v2-data-and-backend-needs-audit.md](../v2-data-and-backend-needs-audit.md) · [v2-stage-3-product-decisions.md](../v2-stage-3-product-decisions.md) (esp. **D06**) · [data-foundation-roadmap.md](../../data-foundation-roadmap.md) · [specs/theater.md](../specs/theater.md)

**Follow-on (recommended):** **`T-THEA-01`** — Theater visit schema expansion for D06 first-release fields (still not Theater Detail UI). Then **`T-THEA-10`** curation + honest activation.

---

## 1. Executive summary

| Question | Answer (this snapshot) |
|----------|------------------------|
| What exists? | Authored registry identity (15 venues); public thin copy; showtimes embed 13 theater snapshots; adapters capture names/IDs (+ AMC auditorium attrs in **internal** logs); favorite store exists (no UI); program/format evidence on showtimes |
| What is public? | Registry fields + embedded snapshots + `theater_id` on showtimes + format/ticket/status schedule facts |
| Internal not public? | AMC `theatre_id` / `auditorium` / layout attrs in daily logs; indie venue-proof attrs; AMC API lat/lng used only for nearby scrape filter |
| Curated today? | Entire `data/theaters.json` (id, name, aliases, source, enabled, type, city, neighborhood, timezone; `source_external_id` always null) |
| Derived today? | Opportunity counts in Home/Explore; Now Showing joins; per-theater format_tag aggregates (computable, not stored) |
| Can power Theater Detail today? | **Identity + current program** only. Almost all visit meta (address, map, amenities, hours, pricing, imagery, screens as entities) is missing |
| Policy | **D06:** repo-curated visit meta; first release = address/geo/website/directions/description/screens/capabilities/amenities/imagery; **defer pricing & hours** |

**Verdict:** Theater Detail must not be wired as “full mockup” yet. Smallest next production task is **schema + validation for curated visit fields (`T-THEA-01`)**, then fill enabled theaters (`T-THEA-10`), keeping pricing/hours sections suppressed.

---

## 2. Roadmap alignment

| Item | Role |
|------|------|
| **G08** | Theater visit metadata gap |
| **G09 / G28** | Coords/travel; auditorium public model |
| **G11b** | Favorite theaters — **store done** (`T-FAV-01`); UI deferred |
| **G22** | Venue coverage (Grand Illusion etc. not in registry) |
| **WS-THEA / WS-TIMG** | Curation + imagery |
| **T-THEA-01** | Expand registry schema (D06 fields); validate; sync — **next** |
| **T-THEA-10** | Curate + activate list/detail sections with suppress-empty |
| **T-THEA-40 / 41** | Pricing / hours — later |
| **T-TRAV-01** | Curate coords after visit meta path exists |
| **D06** | Curated ownership; automation may verify but not silently overwrite |

This audit satisfies the inventory gate before Phase 3 theater work. It does **not** complete `T-THEA-01` or `T-THEA-10`.

---

## 3. Artifact map

| Artifact | Path | Public? | Theater role |
|----------|------|---------|--------------|
| Canonical registry | `data/theaters.json` | Via sync | **SoT** for venue identity (+ future visit meta) |
| Public registry | `public/data/theaters.json` | Yes | Byte-identical sync (`registry_sync.py` / daily processor) |
| Registry schema | `schema/theaters/v1.0.0.json` | — | `additionalProperties: false` — expansion requires schema task |
| Showtimes current | `public/data/showtimes_current.json` | Yes | Schedule + embedded theater **snapshot** subset |
| Showtimes schema | `schema/showtimes_current/v1.0.0.json` | — | `$defs.theater_snapshot` mirrors registry keys today |
| Daily logs | `data/daily_logs/*_{source}.json` | No | Raw theater name + source-specific attrs |
| History | `data/history/showtimes_history.csv` | No | Theater names/ids over time |
| Favorite store | `v2/stores/favoriteTheatersStore.js` | Device-local | User state keyed by registry `theaterId` |
| Spec | `docs/v2/specs/theater.md` | — | Product regions; not a data schema |
| Mockups | `Canonical Mockup Images/Theaters Page.png`, `Theater Detail Page.png` | — | Visual expectations |

**Registry snapshot (2026-07-15):** 15 theaters · 13 enabled · 2 disabled AMC (`amc-kitsap-8`, `amc-lakewood-mall-12`).  
**Showtimes embed:** 13 theaters (enabled ∪ appearing in showtimes).  
**Neighborhood:** 8/15 populated · **city/timezone:** 15/15 · **`source_external_id`:** 0/15 non-null.

---

## 4. Answers to the ten audit questions

### 1. What theater data already exists?

**Registry (authored):** `id`, `name`, `aliases`, `source`, `source_external_id` (null), `enabled`, `type` (`chain`|`indie`|`rep`), `city`, optional `neighborhood`, `timezone`.

**Showtimes (generated):** every showtime has `theater_id`; embedded `theaters[]` copies registry snapshot fields; `format_tags`, `status`, `ticket_url`, film identity, times.

**Adapters / logs (internal):**
- All sources: `theater_name_raw` → registry resolve
- AMC: `attributes.theatre_id`, `auditorium`, layout ids, ticketing flags
- SIFF: `raw_venue_text`, `theater_id`
- NWFF / Central: `theater_id`, location/venue proof fields
- Beacon: fixed name; no theater attrs

**App state:** favorite theaters store (optional cached `name` / `neighborhood` / `imageUrl`).

**Computable:** show counts; distinct `format_tags` per theater; Now Showing film sets; Home/Explore `opportunityCount`.

### 2. What is already emitted publicly?

- Full registry copy under `public/data/theaters.json`
- Thin theater snapshots inside `showtimes_current.theaters[]`
- `showtimes[].theater_id` (+ schedule/ticket/format fields)
- **Not** address, coordinates, website, phone, amenities, hours, pricing, imagery, screen entities, descriptions

### 3. What exists internally but is not emitted?

| Internal | Where | Why not public today |
|----------|-------|----------------------|
| AMC `theatre_id` | Daily logs | Registry `source_external_id` unused; emit strips attrs → `{}` |
| AMC auditorium / layout | Daily logs | G28 / no public auditorium model |
| Indie venue-proof / raw venue text | Logs | Diagnostics, not visit meta |
| AMC API lat/lng | Scrape filter only | Never persisted to registry |
| Disabled theaters | Registry only | Omitted from showtimes embed when no rows |

### 4. Which fields are manually curated?

All current registry fields. Future D06 visit fields are also **manual** (with optional verify-only automation). Editorial “why go here” / history blurbs = curated. Venue imagery = curated + rights.

### 5. Which fields are derived?

| Derived field | From | Store? |
|---------------|------|--------|
| Now Showing / program lists | showtimes × `theater_id` | No — join at read time |
| Opportunity / show counts | showtimes | HomeData compute |
| Premium format evidence | `format_tags` aggregation | Prefer derive; optional curated capability list for gaps |
| Directions deep link | address or lat/lng | Client URL build |
| Earliest/latest show | showtimes | HomeData |
| Favorite flag | local store | User state, not registry |

### 6. Which fields belong in `theaters.json`?

**Stable venue identity + curated visit meta (D06):**  
id, name, aliases, source, source_external_id, enabled, type, city, neighborhood, timezone,  
**plus first-release:** street address, state, postal code, lat, lng, website URL, directions URL (or derive), short description, screen_count, capabilities[], amenities[], imagery refs/attribution.

**Defer in registry (or sibling later):** pricing tables, operating hours / exceptions (D06).

**Do not put in registry:** live showtimes, sold-out flags, per-performance auditorium, user favorites.

### 7. Which fields belong in `showtimes_current`?

**Performance grain:** `theater_id` (FK), time/status/formats/ticket/source ids, film keys.  
**Embedded theater snapshot:** keep **thin identity** for offline join (current pattern) — may later include a **small** denorm subset (e.g. name, neighborhood) but **not** full amenities/hours blobs.  
**Optional later:** presentation/auditorium attrs when G07/G28 land — still showtime-grain, not registry-grain.

### 8. Which fields should never be duplicated as competing sources of truth?

| Fact | Single owner |
|------|----------------|
| Canonical `theater_id` / display name / enabled | `data/theaters.json` |
| Whether a venue is in product | registry `enabled` (+ showtimes presence) |
| Address / coords / website / amenities / description / imagery | registry (curated) |
| Showtime exists / sold out / ticket URL / format for a performance | showtimes |
| User favorited? | favorite store |
| “Has IMAX this week?” | derive from showtimes (unless curated capability asserts durable hardware) |

Embedded showtimes `theaters[]` may **mirror** registry identity for packaging; it must not diverge as a second edit surface.

### 9. Which Theater Detail fields can already be powered today?

| Region | Powerable now? |
|--------|----------------|
| Name, type, city, neighborhood (when set) | **Yes** |
| Complete current program (window) | **Yes** (showtimes join) |
| Format badges on showtimes | **Yes** (AMC tags; indie usually empty) |
| Ticket CTAs when URL present | **Yes** |
| Favorite star (store) | **Store yes / UI no** |
| Address, map, website, phone | **No** |
| Hero imagery | **No** |
| Screens / seats as entities | **No** (AMC auditorium internal only) |
| Amenities, parking, transit, concessions | **No** |
| Hours, pricing | **No** (also deferred by D06) |
| Distinctive editorial / history | **No** (omit; don’t invent) |
| Notable opportunities | **Partial** — schedule-derived only; no venue editorial engine |

### 10. Which fields require additional collection?

Almost all D06 visit fields; imagery rights; optional `source_external_id` population; neighborhood for 7 suburban AMCs; PO decision for missing venues (G22); auditorium model if screen tabs required; travel matrix after coords (G09).

---

## 5. Field inventory (repository × mockup)

Legend — **Owner:** registry | showtimes | logs | user | derived | none.  
**Class:** A available today · B small wiring · C registry curation · D derived artifact · E external provider · F probably not worth it (near term).

### 5.1 Identity & registry

| Field | Source today | Owner | Cadence | Confidence | Public | Manual/derived | Coverage | Storage | Class |
|-------|--------------|-------|---------|------------|--------|----------------|----------|---------|-------|
| theater id | Authored | registry | Rare | High | Yes | Manual | 15/15 | `theaters.json` | A |
| name | Authored | registry | Rare | High | Yes | Manual | 15/15 | registry | A |
| aliases | Authored | registry | Rare | High | Yes | Manual | sparse | registry | A |
| source | Authored | registry | Rare | High | Yes | Manual | 15/15 | registry | A |
| source_external_id | Schema only | registry | When known | Low (empty) | Yes (null) | Manual | 0/15 | registry | C |
| enabled | Authored | registry | Rare | High | Yes | Manual | 13 true / 2 false | registry | A |
| type | Authored | registry | Rare | Med | Yes | Manual | 15/15 | registry | A |
| city | Authored | registry | Rare | High | Yes | Manual | 15/15 | registry | A |
| neighborhood | Authored | registry | Rare | Med | Yes | Manual | 8/15 | registry | A/C |
| timezone | Authored | registry | Rare | High | Yes | Manual | 15/15 | registry | A |
| theater_name_raw | Adapters | logs | Daily | High | No | Observed | per row | logs only | — |
| AMC theatre_id | AMC API→logs | logs | Daily | High | No | Observed | AMC rows | populate registry `source_external_id` later | C |

### 5.2 Schedule / program (showtimes)

| Field | Source today | Owner | Cadence | Confidence | Public | Manual/derived | Coverage | Storage | Class |
|-------|--------------|-------|---------|------------|--------|----------------|----------|---------|-------|
| theater_id on showtime | Resolve | showtimes | Daily | High | Yes | Derived from name map | 3075/3075 | `showtimes_current` | A |
| Embedded theater snapshot | Emit from registry | showtimes package | Daily | High | Yes | Mirror | 13 | showtimes `theaters[]` | A |
| Now Showing / date groups | Join | derived | Daily | High | Yes | Derived | 13 venues | compute | A/B |
| format_tags | Adapters | showtimes | Daily | Med (AMC) | Yes | Observed | AMC rich; indie often empty | showtimes | A |
| status sold_out | Adapters | showtimes | Daily | Med | Yes | Observed | AMC some | showtimes | A |
| ticket_url | Emit | showtimes | Daily | High when present | Yes | Observed | ~95% shows | showtimes | A |
| opportunityCount | HomeData | derived | Runtime | High | App | Derived | — | compute | B |

### 5.3 Visit metadata (mockup / D06)

| Field | Source today | Owner | Cadence | Confidence | Public | Manual/derived | Coverage | Storage | Class |
|-------|--------------|-------|---------|------------|--------|----------------|----------|---------|-------|
| Description (short) | None | registry | Semi-annual | — | — | Manual | 0 | `theaters.json` | C |
| Street address | None | registry | Semi-annual | — | — | Manual | 0 | registry | C |
| State / ZIP | None | registry | Semi-annual | — | — | Manual | 0 | registry | C |
| Coordinates | None (API not stored) | registry | Semi-annual | — | — | Manual | 0 | registry | C |
| Website | None | registry | Semi-annual | — | — | Manual | 0 | registry | C |
| Directions URL | None | registry or derived | Semi-annual | — | — | Manual or maps URL from coords | 0 | registry (+ client) | C/B |
| Phone | None | registry | Semi-annual | — | — | Manual | 0 | registry | C |
| Parking | None | registry amenities | Annual | — | — | Manual | 0 | registry | C |
| Transit | None | registry amenities / notes | Annual | — | — | Manual | 0 | registry | C |
| Accessibility (venue) | None | registry amenities | Annual | — | — | Manual | 0 | registry | C |
| Amenities (beer, etc.) | None | registry | Annual | — | — | Manual | 0 | registry | C |
| Premium formats (durable) | Partial via tags | registry capabilities **and/or** derive | Mixed | Med | Partial | Prefer derive + optional curated | AMC evidence in tags | registry capabilities optional; evidence from showtimes | B/C |
| Concessions | None | registry | Annual | Low churn? | — | Manual | 0 | registry | C/F |
| Images (hero/thumb) | None | registry + assets | Rare | Rights-bound | — | Manual + rights | 0 | registry + `public/` or CDN | C |
| Favorite state | localStorage | user | Live | High | Device | User | store ready | favorite store | B |
| Opening hours | None | deferred | Monthly/holiday | Stale risk | — | Manual | 0 | later / suppress | F* |
| Auditorium count | None | registry | Rare | — | — | Manual | 0 | registry `screen_count` | C |
| Seating capacity | None | registry or auditorium | Rare | — | — | Manual | 0 | registry/optional | C/F |
| Memberships accepted | Partial A-List flag on **films** not venues | registry / prefs | Rare | Low | — | Manual + D10 prefs | 0 venue | registry light + user prefs | C |
| Nearby attractions | None | none | — | — | — | Editorial | 0 | omit | F |
| Historical information | None | editorial | Rare | — | — | Manual | 0 | optional later | F |
| Screen tabs / reserved seating | AMC auditorium in logs | showtimes/attrs | Daily | Med internal | No | Observed | AMC logs | G28 later | E/D |
| Pricing | None | deferred | Quarterly | Stale | — | Manual | 0 | suppress (T-THEA-40) | F* |
| Operator / chain | Implied by `source`/`type` | registry | Rare | Med | Partial | Manual | — | optional field later | B |

\*F* = not worth **first** Theater Detail release per D06; may return later as T-THEA-40/41.

### 5.4 Spec regions vs data

| Spec region | Data readiness |
|-------------|----------------|
| Venue identity | A (thin) |
| Distinctive / programming character | D/F — omit invented copy; weak derive from type + formats |
| Notable opportunities | B/D — schedule-only until evidence engine |
| Complete program | A |
| Practical visit | C (almost entirely) |
| Deeper reference | F near term |
| Actions (FD, Planner, tickets) | A/B |

---

## 6. Mockup field classification (A–F)

### Theaters list (`Theaters Page.png`)

| Mockup expectation | Class | Notes |
|--------------------|-------|-------|
| Active theater count / filters | A/B | Registry `enabled` + type filters |
| Card: name | A | |
| Card: neighborhood / city | A | Fill missing neighborhoods = C |
| Card: thumbnail | C | Imagery |
| Card: address | C | |
| Card: screens / capabilities | C (+ B derive formats) | |
| Short description | C | |
| Now Showing posters | B | Join showtimes |
| Favorite control | B | Store exists; wire UI |
| Grand Illusion / extra venues | C/E | G22 PO + new source — not silent scrape |

### Theater Detail (`Theater Detail Page.png` / Beacon-style)

| Mockup expectation | Class | Notes |
|--------------------|-------|-------|
| Hero image | C | Rights |
| Name / neighborhood | A | |
| Address + Website + Directions | C | Directions may be B once coords exist |
| Specs: screens, capabilities, seats | C | Seats optional/F |
| Amenities list | C | |
| Pricing section | F* | D06 defer |
| Hours section | F* | D06 defer |
| Now Showing / Today / 7-day | A/B | Window honesty |
| Screen tabs | E/D | Needs auditorium emit + model |
| Favorite / Share | B / C | Favorite store; share payload later (G27) |
| Program personality copy | F | Don’t invent; curated later |

---

## 7. Registry vs showtimes ownership (decision table)

| Concern | Put in `theaters.json` | Put in `showtimes_current` | Derive only |
|---------|------------------------|----------------------------|-------------|
| Identity | **Yes (SoT)** | Thin snapshot mirror | — |
| Visit address/geo/web/amenities/description/imagery | **Yes** | No | Directions URL optional |
| Hours / pricing | Later / sibling | No | — |
| What’s playing | No | **Yes** (rows) | List/UI joins |
| Premium format **this week** | Optional durable capabilities | `format_tags` on rows | Aggregate for “available formats” |
| Auditorium for a show | No | Future attrs | — |
| Favorite | No | No | User store |
| Walk miles | Coords in registry | No | Matrix artifact (G09) |

---

## 8. Adapter notes (by source)

| Source | Theater identity | Visit meta in adapter? | Public today |
|--------|------------------|------------------------|--------------|
| AMC | Registry name; log `theatre_id`, auditorium | Lat/lng filter only; not stored | Name/id via registry; formats on showtimes |
| SIFF | Venue→id map; multi-location | No | Three registry rows |
| Beacon | Constant name | No | One row |
| Central Cinema | Canonical id + venue proof | No | One row |
| NWFF | Canonical id + location_name gate | No | One row |

**Implication:** Scrapers will not fill Theater Detail visit sections. Curation is mandatory for D06 fields.

---

## 9. Favorites, Explore, Search, Planner

| Surface | Theater fields used today | Gap |
|---------|---------------------------|-----|
| Explore / Search | name, neighborhood, city, opportunityCount | address, thumb (mockup) |
| Film Detail place facts | theaterName, neighborhood | address/distance |
| Planner engine | `theater_id` / name filters | origin coords, walk |
| Favorites store | theaterId (+ optional name/neighborhood/imageUrl) | UI wiring; imageUrl empty without imagery |
| Theater destination UI | Spec only | No production surface yet |

---

## 10. Risks & honesty rules

1. **Do not** invent amenities, hours, or personality blurbs.
2. **Do not** treat AMC auditorium logs as public screen tabs without G28.
3. **Do not** silently overwrite curated registry from scrapers (D06).
4. **Suppress** empty visit sections; preserve layout slots (Phase 3 exit).
5. **Pricing/hours** stay suppressed until ownership + stale policy (T-THEA-40/41).
6. Embedded showtimes theaters must remain a **mirror**, not a second CMS.
7. Mockup venues absent from registry (e.g. Grand Illusion, Paramount) are **G22**, not audit failures.

---

## 11. Recommended next task (smallest production slice)

### Do next: `T-THEA-01` — Theater visit schema (D06 first-release)

**In scope**
- Expand `schema/theaters` (+ showtimes theater_snapshot if needed for optional denorm) for: address lines, city/state/ZIP (align with existing city), lat/lng, website, directions_url (optional), short_description, screen_count, capabilities[], amenities[], imagery fields with attribution
- Validation + registry sync unchanged in spirit
- Explicitly **exclude** pricing & hours from first schema slice (or mark optional unused)
- Document suppress-empty consumer rules; **no** Theater Detail page implementation required in this task

**Out of scope**
- Filling all venues (that’s `T-THEA-10`)
- Theater Detail / list UI polish
- Travel matrix (`T-TRAV-01`)
- Auditorium entity model
- New theater sources

**Then:** `T-THEA-10` — curate enabled theaters’ first-release fields; wire list/search cards only as far as data exists; keep Detail sections honest.

**Parallel (optional):** populate `source_external_id` for AMC from log `theatre_id` (curated verify) — small, not blocking visit schema.

---

## 12. What this audit did not do

- No code, schema, mockup, or Theater Detail implementation changes  
- No live AMC theater API harvest into the registry  
- No venue coverage expansion (G22)  
- No claim that favorites UI or imagery pipeline is done  

---

## 13. Traceability

| Gap / task | This audit |
|------------|------------|
| G08 | Inventory + storage recommendations |
| D06 | First-release vs deferred confirmed |
| T-THEA-01 | **Ready to start** (schema) |
| T-THEA-10 | Blocked on T-THEA-01 + curation labor |
| T-FAV-01 | Store available; classify favorite UI as B |
| G09 / T-TRAV-01 | Needs coords from THEA path |
| G28 | Auditorium remains research / later |
