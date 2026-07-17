# Reel Seattle — Data Foundation Roadmap

**Status:** Living backlog  
**Track:** Data Foundation (+ related Film Identity / Developer Tooling)  
**Last updated:** 2026-07-16 (P-17B)  
**Audience:** Product owner, ChatGPT (architect), Cursor (implementation)

This is the durable backlog for data-foundation and developer-tooling work. Use it to answer “what is complete?”, “what is next?”, and “what is intentionally deferred?”

Do **not** turn this into a ticket system. Keep statuses updated after meaningful tasks. Link out to detailed design docs instead of duplicating them.

**Related:** [development-operating-model.md](./development-operating-model.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [product-roadmap.md](./product-roadmap.md) · [film-identity-normalization.md](./film-identity-normalization.md) · [amc-source-catalog.md](./amc-source-catalog.md) · [amc-showtimes-field-audit.md](./amc-showtimes-field-audit.md)

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
| AMC catalog refresh stage (offline/live CLI) | `Complete` | [amc-source-catalog.md](./amc-source-catalog.md) |
| Daily catalog integration design | `Complete` | [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md) |
| Daily catalog workflow wiring (P-14D) | `Complete` | Non-blocking late stage; `all-active`; atomic promotion; same generated-data commit |
| AMC Showtimes field audit (P-15A) | `Complete` | [amc-showtimes-field-audit.md](./amc-showtimes-field-audit.md) — log capture gap + fixture taxonomy |
| AMC Showtimes raw-capture expansion (P-18A) | `Complete` | [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) — expand daily-log attributes |
| SIFF/Beacon ingestion audit (P-16A) | `Complete` | [independent-theater-ingestion-audit.md](./independent-theater-ingestion-audit.md) |
| Indie restatement completeness guard (P-16B) | `Complete` | Partial/structural-empty scrapes cannot wipe future rows |
| Independent source observation contract (P-16C) | `Complete` | [independent-source-observation-contract.md](./independent-source-observation-contract.md) · v1.0.0 |
| NWFF ingestion prototype (P-16D) | `Complete` | [nwff-ingestion-prototype.md](./nwff-ingestion-prototype.md) · contract emitter only |
| NWFF production integration design (P-16E) | `Complete` | [nwff-production-integration-design.md](./nwff-production-integration-design.md) |
| NWFF registry + contract mapping (P-16F) | `Complete` | [nwff-contract-mapping.md](./nwff-contract-mapping.md) · no daily |
| NWFF manual production adapter (P-16G) | `Complete` | [nwff-production-adapter.md](./nwff-production-adapter.md) · workflow_dispatch |
| NWFF daily production integration (P-16H) | `Complete` | Scheduled Option C logs; conditional restate; report enums |
| Central Cinema ingestion prototype (P-17A) | `Complete` | [central-cinema-ingestion-prototype.md](./central-cinema-ingestion-prototype.md) |
| Central Cinema production integration design (P-17B) | `Complete` | [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md) |
| Central Cinema registry + offline mapping (P-17C) | `Complete` | [central-cinema-contract-mapping.md](./central-cinema-contract-mapping.md) |
| Central Cinema production adapter (P-17D) | `Complete` | [central-cinema-production-adapter.md](./central-cinema-production-adapter.md) |
| Central Cinema daily enablement (P-17E) | `Complete` | [central-cinema-production-adapter.md](./central-cinema-production-adapter.md) |

---

## Active / next

| ID | Item | Status | Dependency | Notes |
|----|------|--------|------------|-------|
| P-15A | AMC Showtimes field + attribute taxonomy audit | `Complete` | P-14D optional | Primary finding = capture gap |
| P-16A | SIFF/Beacon ingestion behavior audit | `Complete` | — | Drift documented |
| P-16B | Guard indie restatement on incomplete scrapes | `Complete` | P-16A | Source-wide conservative retention |
| P-16C | Shared independent-source observation contract | `Complete` | P-16B | Internal v1.0.0; fixtures for four sources |
| P-16D | Prototype Northwest Film Forum against observation contract | `Complete` | P-16C | Non-production calendar→contract emitter |
| P-16E | Design Northwest Film Forum production integration | `Complete` | P-16D | Registry, mapping, restatement, rollout design |
| P-16F | NWFF registry entry + contract→indie mapping | `Complete` | P-16E | `northwest-film-forum`; `nwff_mapping.py` |
| P-16G | NWFF adapter + raw log + manual workflow | `Complete` | P-16F | `adapters/nwff.py`; no daily schedule |
| P-16H | NWFF daily workflow + restatement + reporting | `Complete` | P-16G | Tracked logs; conditional restate; enums |
| — | Prototype Central Cinema | `Complete` | P-16H | Contract prototype only; no production |
| — | Central production integration design | `Complete` | P-17A | Source key `central_cinema`; Option C path |
| P-17C | Central registry + offline contract→indie mapping | `Complete` | P-17B | Theater `central-cinema`; mapper; no live/scheduled ingestion |
| P-17D | Central adapter + manual workflow | `Complete` | P-17C | Manual CLI + workflow; no schedule |
| P-17E | Central daily workflow + restatement | `Complete` | P-17D | Tracked logs; history `source_showtime_id`; enums; QC |
| — | Align Beacon only where necessary | `Planned` | P-16C | Minimal contract alignment |
| — | NWFF production monitoring | `Planned` | P-16H | Mismatch rate, unsafe frequency, off-site rejects |
| — | Observe catalog runtime + failure rates | `Planned` | P-14D | Continue in parallel |
| — | Expand AMC scrape-log capture for attributes/languages/identity fallbacks | `Complete` (P-18A) | P-15A | [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) |
| — | Rerun AMC field/taxonomy audit on expanded production logs | `Next` | P-18A | ≥2 expanded daily logs before taxonomy conclusions |
| — | Define versioned `presentation_attributes[]` contract | `Deferred` | audit evidence | After real attribute/language inventory |

---

## Planned AMC source-catalog work

| Item | Status | Notes |
|------|--------|-------|
| Daily workflow integration (P-14D) | `Complete` | Soft-fail; retain prior on all-failed / validation errors |
| Safe / atomic catalog writes | `Complete` | Paired `.tmp` + `.bak` promotion in `amc_daily.py` |
| Catalog diagnostics (stdout) | `Complete` | No pipeline-report schema bump |
| Structured pipeline-report catalog section | `Planned` | After stable runtime |
| Cockpit source-product / release inspection | `Planned` | After catalogs exist in `data/source_catalog/` |
| Refresh cadence evaluation (`all-active` → optional `stale`) | `Planned` | Measure wall time + metadata churn first |
| Inactive-product growth monitoring | `Planned` | Catalog retains inactive products by design |

**Decision notes**

* Product grain = `(amc, source_film_id)`; release grain = nullable `wwmReleaseNumber` evidence only.
* Never merge products from shared release IDs.
* Catalog is internal — not public, not Pages, not SPA.

---

## Planned AMC Showtimes field audits

Measurement-only audits. Do not change production scrape fields until an explicit capture-expansion task ships.

| Item | Status | Notes |
|------|--------|-------|
| P-15A field population + taxonomy tooling | `Complete` | [amc-showtimes-field-audit.md](./amc-showtimes-field-audit.md) |
| P-18A expand scrape-log capture | `Complete` | [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) |
| Production `attributes[]` / `languages` measurement | `Ready` / `Observation` | Mapped in logs; accumulate ≥2 expanded days |
| Showtime identity (`id` vs `performanceNumber`) | `Ready` / `Observation` | Both retained; confirm stability across days |
| Pricing / auditorium / embargo depth | `Ready` / `Observation` | Retained under `attributes.*`; no public exposure |

### Showtime field-population audit — `Complete` (log-based)

P-15A measured documented API fields against committed scrape logs and recorded the capture gap. High-value retained fields include `id`→`source_showtime_id`, `movieId`, `premiumFormat`, cancel/almost-sold-out, sell-until, genre/runtime/poster.

### P-18A raw-capture expansion — `Complete`

Expanded `api_showtime_to_raw` preserves `amc_attributes`, languages, `performanceNumber`/`theatreId`, ticket prices, auditorium/layout, and availability flags inside `record.attributes`. Schema version remains `1.0.0`. History/public output unchanged.

### Showtime identity audit — `Observation`

`source_showtime_id` remains primary. `performanceNumber` / `theatreId` are now retained as supplementary evidence.

### Attribute-code taxonomy audit — `Observation`

Classifier + fixture inventory shipped. Production attribute codes can be inventoried once expanded logs accumulate (≥2 days).

### Language / pricing / auditorium audits — `Observation`

Same: fields retained by P-18A; measure on real production logs before designing presentation attributes.

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

**Depends on:** expanded scrape-log capture of `attributes[]` / `languages` (P-18A complete; observe ≥2 production days) + product acceptance
**Related product grain work:** AMC source catalog presentation classifier (product-level only today)
**P-15A / P-18A note:** Architecture direction confirmed; production implementation waits for real expanded-log evidence.

---

## Planned independent-theater ingestion track

**Guiding principle:** Different extraction strategies, one explicit ingestion contract.

| Step | Item | Status |
|------|------|--------|
| 1 | Audit SIFF and Beacon ingestion behavior (read-only) | `Complete` (P-16A) |
| 1b | Guard indie restatement on incomplete scrapes | `Complete` (P-16B) |
| 2 | Define smallest shared source-observation contract | `Complete` (P-16C) |
| 3 | Prototype Northwest Film Forum | `Complete` (P-16D) |
| 3b | NWFF production integration design | `Complete` (P-16E) |
| 3c | NWFF registry + contract→indie mapping | `Complete` (P-16F) |
| 3d | NWFF adapter/raw log (manual) | `Complete` (P-16G) |
| 3e | NWFF daily workflow + restatement | `Complete` (P-16H) |
| 4 | Align Beacon only where necessary | `Planned` |
| 5 | Prototype Central Cinema | `Complete` (P-17A) |
| 5b | Central production integration design | `Complete` (P-17B) |
| 5c | Central registry + offline mapping | `Complete` (P-17C) |
| 5d | Central adapter / manual workflow | `Complete` (P-17D) |
| 5e | Central daily + restatement | `Complete` (P-17E) |
| 6 | Align SIFF carefully | `Planned` |
| 7 | Integrate one new source at a time | `Planned` |

**P-16C contract:** [independent-source-observation-contract.md](./independent-source-observation-contract.md) (`reel_seattle.ingestion.independent_contract`, version `1.0.0`).

**P-16D prototype:** [nwff-ingestion-prototype.md](./nwff-ingestion-prototype.md) (`reel_seattle.prototypes.nwff`) — emits contract results only; no production integration.

**P-16E design:** [nwff-production-integration-design.md](./nwff-production-integration-design.md).  
**P-16F mapping:** [nwff-contract-mapping.md](./nwff-contract-mapping.md).  
**P-16G adapter:** [nwff-production-adapter.md](./nwff-production-adapter.md).  
**P-16H daily:** scheduled Option C logs, conditional restatement, source enums.  
**P-17A prototype:** [central-cinema-ingestion-prototype.md](./central-cinema-ingestion-prototype.md).  
**P-17B design:** [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md) — source key `central_cinema`; mandatory showing IDs; Option C logs.  
**P-17C mapping:** [central-cinema-contract-mapping.md](./central-cinema-contract-mapping.md) — registry `central-cinema`; offline contract→indie mapper; site-scoped venue proof.  
**P-17D adapter:** [central-cinema-production-adapter.md](./central-cinema-production-adapter.md) — production adapter + manual/scheduled paths.  
**P-17E:** Central live in daily pipeline; history `source_showtime_id`; public/pipeline enums.  
**P-18A:** AMC showtime raw-log capture expanded. Next: rerun field/taxonomy audit on ≥2 expanded production logs.

### Confirmed SIFF/Beacon drift (P-16A)

* Shared legacy indie path, but **no explicit ingestion contract**.
* Neither source stores `source_program_id` / `source_showtime_id` (URLs only in scrape logs; dropped before history).
* Beacon mutates titles via `.title()`; SIFF preserves document title.
* Year handling unsafe (Beacon = run year; SIFF may use first page year).
* Forward `FetchContext` window unused; public emit truncates separately (14 days).
* Empty vs structural failure vs valid empty were not distinguished (P-16A); **P-16B** adds completeness metadata + restatement eligibility.
* Restatement remains **source-wide** (not theater-scoped); P-16B therefore uses conservative retention on any SIFF program-page failure.

### P-16B safety behavior (current)

* Adapters set `stats.restate_safe` / `scrape_status` (internal; not a public schema enum).
* Processor skips future-window restatement when `restate_safe` is false; partial rows may still be logged.
* Beacon zero-row without valid-empty proof retains prior futures.
* Proven Beacon valid empty (all discovered movie pages OK, zero showtimes) may clear futures.
* Theater-/program-slice restatement remains **Planned**.

### Shared independent-source contract (P-16C v1.0.0)

Defined in [independent-source-observation-contract.md](./independent-source-observation-contract.md) and `reel_seattle.ingestion.independent_contract`.

Future adapters should preserve (and validate against the contract):

* stable source identifier,
* source-owned film/event/program ID when available (else durable URL/slug as program ID),
* source-owned showtime/performance ID when available,
* exact source title (unmutated),
* canonical theater ID (resolved before production accept),
* local date/time in `America/Los_Angeles`,
* source page URL,
* showtime-specific ticket URL when available,
* raw source-native metadata,
* scrape status,
* warnings,
* structural validation results,
* `requested_window` / `inspected_window` coverage proof,
* `restate_safe` aligned with P-16B statuses.

Shared policy requirements:

* forward date windows,
* year rollover,
* duplicate handling,
* partial failures,
* structurally broken pages,
* valid empty schedules,
* stale-data preservation,
* future-window restatement (prefer slice/theater granularity for multi-venue orgs),
* pipeline reporting (scrape status separate from publish freshness).

**Empty-result rule:** an empty parser result must not automatically erase future data unless the expected page structure and requested range were successfully inspected.

### Northwest Film Forum (P-16H complete — live source)

Production daily path enabled:

* Calendar pages are week views; `?start=` accepts mid-week dates and shows the containing week.
* Adjacent weeks can overlap when traversing; occurrences are deduplicated.
* Calendar `ScreeningEvent` / `data-calendar-item` rows are the showtime authority.
* `/films/{slug}/` is stable enough for `source_program_id` / history `source_film_id`.
* Workshops are distinguishable via `calendar__item--workshop` / education paths.
* No source-owned showtime/performance ID observed → composite fallback.
* Theater ID `northwest-film-forum` is in `data/theaters.json`.
* Off-site location labels must not silently map to NWFF.
* Detail-page `<time datetime>` schedules are useful for mismatch warnings only.
* Daily window: Pacific today through today+13 (14 inclusive days).
* Raw log: `data/daily_logs/YYYY-MM-DD_nwff.json` (Option C).
* Restatement only when final `restate_safe=true`.

**Monitoring (post-launch):** calendar/detail mismatch rate, unsafe-run frequency, off-site rejects, identity collisions, source growth.

### Central Cinema (P-17B design complete — not production-enabled)

Prototype (P-17A) and production-integration design (P-17B) shipped. Decisions:

* Production source key: `central_cinema`
* Theater ID: `central-cinema` (one venue; no screens)
* Calendar SPA discovery requires affirmative structural checks; zero-link without empty proof is unsafe
* Site/page-type venue proof allowed when no label; off-site/virtual/ambiguous reject
* Slug → `source_film_id`; numeric checkout ID mandatory (`source_showing_id`)
* Option C raw log; mapping module `central_cinema_mapping`
* Window: Pacific today…today+13; fetch all discovered movie pages
* Rich metadata raw-only initially; `dateCreated` never release year
* P-17C–E complete: Central Cinema is a live scheduled source
* History includes nullable `source_showtime_id` (Central populated)
* Monitoring: SPA zero-link failures, page failures, showing-ID conflicts, unsafe-run frequency
* Preferred next: rerun AMC Showtimes field/taxonomy audit on expanded production logs (≥2 days)

Live prototype findings retained:

* Calendar SPA (`#q-app`) exposes Explore Movies `/movie/` links for discovery.
* Movie pages embed schema.org Movie microdata; `itemprop` parsing works.
* Checkout URLs provide numeric source-owned showing IDs.
* `dateCreated` reflects site-record dates (e.g. 2026), not film year.
* Descriptions may include screening-specific prose (e.g. Hecklevision) — kept in `raw`.
* Contract v1.0.0 was sufficient; no revision required for the prototype.

### Central Cinema plan (historical checklist)

* Calendar discovers canonical `/movie/` pages.
* Movie page authoritative for metadata and showtimes.
* schema.org parsing by `itemprop`.
* Safe description sanitization.
* `dateCreated` not treated as film year.
* Movie slug as program ID.
* Checkout numeric segment as showing ID.
* Explicit year-rollover handling.
* Screening-specific prose retained without broad presentation extraction initially.

---

## Planned film identity and enrichment

| Item | Status | Notes |
|------|--------|-------|
| Source products + release observations (AMC) | `Complete` | Durable catalogs + daily soft-fail wiring (P-14D) |
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
P-15A  AMC Showtimes field audit (capture gap)     ← Complete
P-18A  Expand AMC scrape-log raw capture           ← Complete
P-16A  SIFF/Beacon ingestion audit                 ← Complete
P-16B  Indie restatement completeness guard        ← Complete
P-16C  Independent source observation contract     ← Complete (v1.0.0)
P-16D  NWFF ingestion prototype                    ← Complete (non-production)
P-16E  NWFF production integration design          ← Complete
P-16F  NWFF registry + contract→indie mapping      ← Complete
P-16G  NWFF manual production adapter              ← Complete
P-16H  NWFF daily workflow + restatement           ← Complete
P-17A  Central Cinema ingestion prototype          ← Complete (non-production)
P-17B  Central Cinema production integration design ← Complete
P-17C  Central registry + offline contract→indie mapping ← Complete
P-17D  Central adapter + manual workflow ← Complete
P-17E  Central daily + restatement ← Complete (live source)
   ↓
Preferred next: Rerun AMC field/taxonomy audit on ≥2 expanded production logs
   ↓
Parallel: Beacon align (planned) · NWFF/Central monitoring
   ↓
SIFF align → integrate one-by-one
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
