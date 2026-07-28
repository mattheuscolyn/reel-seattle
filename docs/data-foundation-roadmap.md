# Reel Seattle — Data Foundation Roadmap

**Status:** Living backlog  
**Track:** Data Foundation (+ related Film Identity / Developer Tooling)  
**Last updated:** 2026-07-27 (T-FILMID-01 film identity foundation; Stage 1 mockup coverage accepted)  
**Audience:** Product owner, ChatGPT (architect), Cursor (implementation)

This is the durable backlog for data-foundation and developer-tooling work. Use it to answer “what is complete?”, “what is next?”, and “what is intentionally deferred?”

Do **not** turn this into a ticket system. Keep statuses updated after meaningful tasks. Link out to detailed design docs instead of duplicating them.

**Related:** [development-operating-model.md](./development-operating-model.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [product-roadmap.md](./product-roadmap.md) · [film-identity-normalization.md](./film-identity-normalization.md) · [amc-source-catalog.md](./amc-source-catalog.md) · [amc-showtimes-field-audit.md](./amc-showtimes-field-audit.md) · **[v2 Stage 2 data & backend needs audit](./v2/v2-data-and-backend-needs-audit.md)** · **[v2 Stage 3 product decisions (approved)](./v2/v2-stage-3-product-decisions.md)** · **[v2 Stage 3 front–back integration roadmap](./v2/v2-front-back-integration-roadmap.md)** (fixture→real sequencing; not DF Ready ticket list)

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
5. Advance **v2 product design** in parallel under [docs/v2/](./v2/README.md) (spec-first; not production UI).

Public UI must not change merely because new source fields are captured. v2 design does not replace data-foundation evidence gates.

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
| AMC expanded-log field/taxonomy audit (P-18B) | `Research in progress` | Provisional only — 1 expanded date (`2026-07-17`); need 3–5 |
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
| P-19A | Align Beacon only where necessary | `Complete` | P-16C | Production accepted 2026-07-17; exact titles/IDs; Astro recovery |
| P-20A | Design minimal SIFF alignment | `Complete` | P-19A | [siff-minimal-alignment-design.md](./siff-minimal-alignment-design.md) |
| P-20B | Implement SIFF minimal alignment | `Complete` | P-20A | [siff-minimal-alignment.md](./siff-minimal-alignment.md); live 198/198 IDs |
| P-20C | SIFF production rollout + acceptance | `Complete` | P-20B | Accepted 2026-07-17; runs `54b29c2` / `1216fef`; see evidence below |
| P-21A | Cockpit AMC source-product / release inspection | `Complete` | P-14D | Local allowlist + Cockpit tabs; diagnostics; no public/schema changes |
| P-21B | AMC catalog health in pipeline report | `Complete` | P-21A / P-14D | Additive `amc_source_catalog`; stale retention; production `c5ca543` |
| P-21C | AMC catalog refresh cadence + inactive growth evaluation | `Complete` | P-21B | Keep all-active daily; healthy inactive accumulation; [amc-catalog-cadence-evaluation.md](./amc-catalog-cadence-evaluation.md) |
| — | NWFF / Central production monitoring | `Observation` | P-16H / P-17E | Passive — NWFF 2 Option C days, Central 1; no unsafe runs; stable NWFF `rejected_records=1` |
| — | Observe catalog runtime + failure rates | `Observation` | P-14D / P-21C | Passive — **3** catalog calendar dates so far; re-audit only at ≥14 dates or threshold trip |
| — | Expand AMC scrape-log capture for attributes/languages/identity fallbacks | `Complete` (P-18A) | P-15A | [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) |
| P-18B | Rerun AMC field/taxonomy audit on expanded production logs | `Research in progress` | P-18A | **Blocked** — only 1 distinct expanded date (`2026-07-17`) |
| — | Accumulate ≥3 distinct expanded AMC calendar dates | `Research needed` | P-18B | Passive wait gate — not an implementation task |
| — | Define versioned `presentation_attributes[]` contract | `Deferred` | P-18B evidence | Blocked on multi-day observations |
| — | **No Ready Cursor implementation task** | `Blocked by product-owner decision` | — | After P-21C: only passive gates + PO-directed choices remain |

---

## Planned AMC source-catalog work

| Item | Status | Notes |
|------|--------|-------|
| Daily workflow integration (P-14D) | `Complete` | Soft-fail; retain prior on all-failed / validation errors |
| Safe / atomic catalog writes | `Complete` | Paired `.tmp` + `.bak` promotion in `amc_daily.py` |
| Catalog diagnostics (stdout) | `Complete` | Retained; structured report section added in P-21B |
| Structured pipeline-report catalog section (P-21B) | `Complete` | Additive optional `amc_source_catalog` on schema `1.0.0` (no bump); daily patch after catalog stage; Cockpit Pipeline Health summary |
| Cockpit source-product / release inspection (P-21A) | `Complete` | Local-only Cockpit tabs over `data/source_catalog/amc_*.json`; cross-catalog diagnostics; smoke + frontend tests |
| Refresh cadence evaluation (`all-active` → optional `stale`) (P-21C) | `Complete` | Keep all-active daily; 3 catalog calendar dates / 16 snapshots; overnight metadata churn real; stale-N not justified yet |
| Inactive-product growth monitoring (P-21C) | `Complete` | Healthy durable accumulation (0→11 inactive); provisional revisit thresholds; no retention/deletion design |
| Re-run cadence audit after evidence gate | `Planned` | ≥14 distinct catalog calendar dates **or** monitoring threshold trip; tooling: `scripts/audit_amc_catalog_cadence.py` |
| Design stale-N refresh policy | `Deferred` | Only if evidence gate / thresholds justify; design-only follow-up — not implementation |

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
| Production `attributes[]` / `languages` measurement | `Observation` | 35 codes on 2026-07-17; languages present but empty |
| Showtime identity (`id` vs `performanceNumber`) | `Observation` | Both populated on expanded day; cross-day stability pending |
| Pricing / auditorium / embargo depth | `Observation` | Prices + auditorium retained; embargo keys absent in sample |
| P-18B multi-day audit | `Research in progress` | Need 3–5 distinct expanded dates |

### Showtime field-population audit — `Complete` (log-based)

P-15A measured documented API fields against committed scrape logs and recorded the capture gap. High-value retained fields include `id`→`source_showtime_id`, `movieId`, `premiumFormat`, cancel/almost-sold-out, sell-until, genre/runtime/poster.

### P-18A raw-capture expansion — `Complete`

Expanded `api_showtime_to_raw` preserves `amc_attributes`, languages, `performanceNumber`/`theatreId`, ticket prices, auditorium/layout, and availability flags inside `record.attributes`. Schema version remains `1.0.0`. History/public output unchanged.

### P-18B expanded-log audit — `Research in progress` (provisional)

Provisional audit over 19 committed logs (18 legacy + 1 expanded date `2026-07-17`):

* **35** unique attribute codes (7 format / 4 accessibility / 4 language / 18 unknown / …)
* Languages: objects retained, **0** nonempty spoken/dubbed/subtitle values
* Identity: `performance_number` available; multi-day stability not yet measurable
* Pricing: full ticket-price arrays; ~12.6 MB/day expanded vs ~3 MB legacy
* Readiness: **more_observation_required**
* Next: accumulate ≥3 distinct expanded calendar dates, then rerun

### Showtime identity audit — `Observation`

`source_showtime_id` remains primary. `performanceNumber` / `theatreId` are retained as supplementary evidence on expanded days.

### Attribute-code taxonomy audit — `Observation`

Classifier + production inventory started (35 codes). Finalize only after 3–5 expanded dates; many high-frequency seating codes remain `unknown`.

### Language / pricing / auditorium audits — `Observation`

Languages empty in the first expanded day. Pricing and auditorium/layout populated; no auditorium entity decision yet.

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
| 4 | Align Beacon only where necessary | `Complete` (P-19A) |
| 5 | Prototype Central Cinema | `Complete` (P-17A) |
| 5b | Central production integration design | `Complete` (P-17B) |
| 5c | Central registry + offline mapping | `Complete` (P-17C) |
| 5d | Central adapter / manual workflow | `Complete` (P-17D) |
| 5e | Central daily + restatement | `Complete` (P-17E) |
| 6 | Design minimal SIFF alignment | `Complete` (P-20A) |
| 6b | Implement SIFF minimal alignment | `Complete` (P-20B) |
| 6c | SIFF production rollout | `Complete` (P-20C) |
| 7 | Integrate one new source at a time | `Planned` — **blocked by product-owner theater selection** (not Ready) |
| — | Theater-/program-slice restatement | `Planned` — no concrete integrity defect yet; keep source-wide P-16B until a scaling/integrity problem appears |

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
**P-18A:** AMC showtime raw-log capture expanded.  
**P-18B:** Provisional audit only (1 expanded date). Next: accumulate ≥3 distinct expanded calendar dates, then rerun.  
**P-19A:** Beacon minimal alignment — [beacon-minimal-alignment.md](./beacon-minimal-alignment.md). Exact titles; window-aware years; slug → `source_film_id`; `data-inventory-id` → `source_showtime_id`; Astro discovery/parser; P-16B restatement unchanged. **Production accepted** 2026-07-17 (`00dba32` + `dc02ce2`; safe runs `e622867` / `f82ac24`).
**P-20A:** SIFF minimal alignment design — [siff-minimal-alignment-design.md](./siff-minimal-alignment-design.md).
**P-20B:** SIFF minimal alignment implementation — [siff-minimal-alignment.md](./siff-minimal-alignment.md). Exact `<h1>`; path → `source_film_id`; Elevent ShowtimeId → `source_showtime_id`; window-aware years (no page-wide `\d{4}`); venue allowlist; affirmative valid-empty; source-wide restatement unchanged.
**P-20C:** SIFF production rollout accepted 2026-07-17. Implementation `74c5dc1` (merged to `origin/main` as `3f721d6`). Production runs:
* Run 1 — workflow [`29598147832`](https://github.com/mattheuscolyn/reel-seattle/actions/runs/29598147832) → generated-data `54b29c2` (2026-07-17T16:56:54Z UTC / scrape ~09:58 PDT).
* Run 2 — workflow [`29598557952`](https://github.com/mattheuscolyn/reel-seattle/actions/runs/29598557952) → generated-data `1216fef` (2026-07-17T17:03:15Z UTC / scrape ~10:04 PDT; deterministic restatement, timestamps only).
* Both runs: `scrape_status=success`, `restate_safe=true`, 198 log records, 198/198 Elevent ShowtimeIds, 0 duplicate ShowtimeIds, 0 grain dups, three venues (Downtown 66 / Uptown 103 / Film Center 29), 9 parent-event pages excluded, multi-venue **Wild Inside** (`cinema/in-theaters/wild-inside`) at Uptown+Film Center with 7 distinct ShowtimeIds, live `<h1>` matched stored titles for ordinary/nested/punctuated/multi-venue samples, cross-run ShowtimeId→program/venue/date/time stable (198/198), past SIFF history preserved (208 pre-ID rows), non-SIFF history counts unchanged, history+public validators OK, CI on implementation merge OK, Pages deploy OK (`29598553950`, `29599183547`).
* Stale retention: both production runs were safe; proven via focused completeness tests (`test_partial_siff_json_does_not_wipe_future_rows`, unsafe `restate_safe=false` cases) without sabotaging production.
* Deferred SIFF risks unchanged: longer-term ShowtimeId stability across future scheduled days; broad ~365-day window; possible future venue-label aliases; Option C migration; narrower restatement scopes.

### Confirmed SIFF/Beacon drift (P-16A)

* Shared legacy indie path, but **no explicit ingestion contract** (Beacon still legacy envelope after P-19A; SIFF still legacy envelope after P-20B/C — Option C deferred).
* ~~Neither source stores `source_program_id` / `source_showtime_id`~~ — **Beacon (P-19A)** and **SIFF (P-20B/C):** IDs on new/future rows; legacy past SIFF rows may lack IDs.
* ~~Beacon mutates titles via `.title()`~~ — **fixed in P-19A**; ~~SIFF title drift~~ — **fixed in P-20B** (exact `<h1>`).
* ~~Year handling unsafe~~ — **Beacon P-19A** and **SIFF P-20B** use window inference (no page-wide first-year scan).
* Forward `FetchContext` window is used for year inference; production window remains ~365 days via `build_default_indie_fetch_context`.
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

**Monitoring (post-launch):** calendar/detail mismatch rate, unsafe-run frequency, off-site rejects, identity collisions, source growth. **Status after P-20C reconciliation:** Observation only — 2 Option C log days (`2026-07-16`, `2026-07-17`), both `restate_safe=true` / `success`; stable `rejected_records=1` with empty warning lists. Do not start a monitoring implementation task until more days accumulate or a concrete defect appears.

### Central Cinema (P-17E complete — live scheduled source)

Prototype (P-17A) through daily enablement (P-17E) shipped. Design decisions retained:

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
* Monitoring: SPA zero-link failures, page failures, showing-ID conflicts, unsafe-run frequency. **Status after P-20C reconciliation:** Observation only — 1 Option C log day (`2026-07-17`), `restate_safe=true` / `success`, `rejected_records=0`. Too thin for an implementation monitoring task.
* Preferred next: **product-owner direction required** — no Ready data-foundation implementation task after P-21C
* Parallel wait gate: accumulate ≥3 distinct expanded AMC calendar dates, then finish P-18B (**still 1 date**: `2026-07-17`)
* Parallel wait gate: re-run P-21C audit after ≥14 distinct catalog calendar dates or threshold trip (**currently 3**)
* P-19A Beacon alignment complete — see [beacon-minimal-alignment.md](./beacon-minimal-alignment.md)
* P-20A SIFF design complete — see [siff-minimal-alignment-design.md](./siff-minimal-alignment-design.md)
* P-20B SIFF implementation complete — see [siff-minimal-alignment.md](./siff-minimal-alignment.md)
* P-20C SIFF production rollout accepted 2026-07-17 (`74c5dc1` / `54b29c2` / `1216fef`)
* P-21A Cockpit AMC catalog inspection complete 2026-07-17 — allowlisted local reads of `data/source_catalog/amc_movie_products.json` + `amc_release_observations.json`; product/release search; multi-product grouping badges; cross-catalog missing-member/duplicate diagnostics; remains local-only (not Pages)
* P-21B pipeline-report AMC catalog health complete 2026-07-17 — section `amc_source_catalog`; impl `621d8d4`; production run [29602960982](https://github.com/mattheuscolyn/reel-seattle/actions/runs/29602960982); generated-data `c5ca543` (`status=success`, `outcome=promoted`, 50 products / 39 active / 11 inactive, 46 releases / 44 singleton / 2 multi); schema version unchanged (`1.0.0`); P-18B still blocked (1 expanded date)
* P-21C cadence/inactive evaluation complete 2026-07-17 — [amc-catalog-cadence-evaluation.md](./amc-catalog-cadence-evaluation.md); classifications **Keep all-active daily** / **Healthy durable accumulation**; evidence window 2026-07-15…17 (16 snapshots); no policy change; P-18B still 1 expanded date

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
| Reel Seattle-owned canonical `film_id` | `In progress` | **`T-FILMID-01` (2026-07-27):** namespaced `tmdb:` / `source:` / `source-key:` contract, decisions artifact, matcher, review queue, cockpit review — [film-identity-contract.md](./v2/film-identity-contract.md). Public emission deferred (`T-FILMID-02`). |
| Confidence-based product→film matching | `In progress` | Conservative TMDB scorer + manual override in `reel_seattle/film_identity/` (`T-FILMID-01`); live Actions workflow `T-FILMID-01D` |
| TMDB search (title/year/runtime + evidence) | `In progress` | Server-side client + gitignored cache (`data/cache/tmdb/`); live via `scripts/match_tmdb_films.py` or Actions **Film Identity — Live TMDB Match** |
| External identifiers with provenance | `Planned` | TMDB external IDs used when present on details; AMC catalog still does not persist IMDb |
| Optional Letterboxd via TMDB ID | `Planned` | Never primary identity; **D05 approved:** defer cultural ranks; schedule-safe evidence first; Stage 5 gate in integration roadmap — do not treat difficulty alone as cut |
| Public enrichment artifact (year/genres/director/synopsis/backdrop) | `Planned` | **D04 approved** — hide unsupported; partial OK; **`T-ENR-AMC-R` complete 2026-07-25**; identity matching (`T-FILMID-01`) precedes broad enrichment activation (`T-ENR-01`) — [v2-front-back-integration-roadmap.md](./v2/v2-front-back-integration-roadmap.md) |
| Opening This Week derived artifact (distinct from `newly_added_current`) | `Planned` | **D02 approved** — earliest scheduled Seattle showtime from history + curated overrides; calendar-week membership; Stage 3 T-OPEN-*; still not auto-Ready until sequenced |
| Match solely on title | `Deferred` / forbidden as sole key | — |
| Match solely on `wwmReleaseNumber` | `Deferred` / forbidden as sole key | Grouping evidence only |

### Public showtimes emit completeness (Stage 2 audit)

Schema fields exist on `showtimes_current` but `reel_seattle/emit/current.py` currently hardcodes:

| Field | Emit today | Status | Notes |
|-------|------------|--------|-------|
| `ticket_url` | populated when history has absolute http(s) URL | `Complete` (T-EMIT-02, 2026-07-24) | History column + `ticket_url_from_history_row` → emit. AMC: `purchase_url` then `mobile_purchase_url`; Central/NWFF: `ticket_url_raw`; SIFF/Beacon: null (source captures none). Local regen (ref 2026-07-20): 2939/3075 non-null (95.6%). Schema remains `1.0.0`. Consumer wiring: Stage 3 **T-EMIT-03** (Complete) — v2 HomeData `ticketUrl`; no producer change. |
| `source_showtime_id` | populated when history has ID | `Complete` (T-EMIT-01, 2026-07-24) | Emitter uses `source_showtime_id_from_history_row`; no schema bump. Local regen coverage (history window 2026-07-20…08-03): AMC/SIFF/Beacon/Central 100% of their rows; **NWFF 0%** (adapter leaves null — no native source-owned showtime ID; composite used only for internal dedupe). Schema remains `1.0.0` nullable string. |
| `attributes` | always `{}` | `Deferred` | Tied to `presentation_attributes[]` + P-18B evidence; do not invent a parallel public shape |

* [Canonical Theater](./v2/specs/theater.md) — venue identity, programming character, notable opportunities (D-20); depends on [theater expansion](#planned-theater-model-expansion); does **not** implement registry/UI
* [Canonical Home](./v2/specs/home.md) — D-17; reconciled with Design Review v3 (D-22: full-width one-at-a-time Top Opportunities); does **not** implement Home UI, ranking, or landscape-art ingestion
* [Canonical Explore / Search](./v2/specs/explore-search.md) — D-23; opportunity-aware browse/search, comprehensive filtering, Seen vs Not interested; does **not** implement search index, ranking, status persistence, maps, or personalization
* [Canonical Opportunity expression](./v2/specs/opportunity-expression.md) — D-24; cross-surface compact/summary/featured/focused expression; **no** standalone Opportunity Detail page; does **not** define Opportunity schema, durable identity, ranking, or availability ingestion
* [Canonical Profile / Settings](./v2/specs/profile-settings.md) — D-25; Profile as personal moviegoing hub; Settings nested secondary; does **not** implement accounts, status persistence, memberships, preferences, notifications, sync, or Profile UI
* [Canonical Global navigation](./v2/specs/global-navigation.md) — D-26; v2 chrome **Home · Explore · Planner · Profile** (I-04C); Film Detail is contextual, not Explore-owned
* [First v2 implementation slice](./v2/17-first-implementation-slice.md) — D-27 / I-05E2 Explore correction; I-04C Home; Opening This Week lacks classifier; Leaving Soon gated
* **Data dependency (v2 Home):** approved **Opening This Week** classification artifact or documented derivation — currently missing; do not equate `newly_added_current` to theatrical openings
* **Data dependency (v2 Home):** Leaving Soon remains review-only / not Pages — v2 must not allowlist until product + data gate
* **Data dependency (v2 Explore I-05E/E2):** public artifacts support **title + theater** search only — **no** cast/crew/person fields for person search (UI placeholder may say “person”; results must not fabricate matches)
* **Data dependency (v2 Explore):** **35mm** format tags absent from current showtimes sample — Quick Start retained with honest unavailable scaffold
* **Data dependency (v2 Explore):** **IMAX** partially supported via `format_tags` values such as `imax-at-amc` / `imax` — not a venue capability catalog
* **Data dependency (v2 Explore):** **Coming Soon**, **Special Events**, and curated **Collections** lack approved public artifacts — Explore shows honest unavailable scaffolds
* **Data dependency (v2 Explore I-05S):** Search Results omit year/genre/synopsis/rating/language/director — fields absent from public showtimes artifacts; person/cast/crew search remains unsupported
* **Data dependency (v2 Film Detail I-06FD):** public HomeData still lacks year, rating, genres, director, synopsis, true backdrop, cast, and cultural ranks (e.g. Letterboxd) — Film Detail omits these honestly; hero may soft-wash with poster only when no backdrop exists
* **Product gap (v2 Explore / Film Detail):** no approved **Save / favorites** store — Save controls remain unavailable/disabled until a Save model is decided
* **Data dependency (v2 Explore / Film Detail):** **Seen** and **Not interested** are device-local contracts only; Film Detail writes both stores; Home “Not interested” write path not yet wired; neither is Profile-synced; Not interested does not yet filter Home ranking
* **Product question (v2 Explore):** “This Week” UI label currently means a **rolling 7-day Pacific window**, not a calendar week — confirm with product owner before changing behavior
* **Stage 3 integration roadmap (2026-07-24):** [v2-front-back-integration-roadmap.md](./v2/v2-front-back-integration-roadmap.md) sequences fixture→real work under approved D01–D17. DF items above remain Planned/Deferred/Research — Stage 3 does **not** invent Ready DF Cursor tasks; emit/opening/theater/leaving stay aligned with existing statuses.
* **Stage 2 audit (2026-07-24, validation pass):** [v2-data-and-backend-needs-audit.md](./v2/v2-data-and-backend-needs-audit.md) §14 reconciliation.
* **Out of Data-Foundation Ready scope (product / Stage 4 v2 track):** scheduled-plan persistence (G12), favorite-theater store (G11b), calendar ICS vs one-way sync (G15), notifications (G20), memberships (G19), collections/editorial (G18), multi-theater planner beyond travel research (G13). Travel aids remain `Research needed` (G09).
* Do **not** treat Stage 2/3 docs as an implementation ticket list that auto-starts DF work.
* See also [unified-planner-design.md](./unified-planner-design.md) (current engine) and [planner-ux-roadmap.md](./planner-ux-roadmap.md)

---

## Planned theater model expansion

| Field / capability | Status |
|--------------------|--------|
| Address | `Planned` |
| Coordinates | `Planned` |
| Neighborhood / city | `Partial` | In registry today (`city`, `neighborhood` on many entries); roadmap item retained for completeness |
| Number of screens | `Planned` |
| Individual auditoriums (if audits justify) | `Research needed` |
| Accessibility / format capabilities | `Planned` |
| External source IDs / aliases | `Planned` |
| Website / directions URL | `Planned` | Stage 2 audit — Theater Detail mockup |
| Short description (curated) | `Planned` | Manual editorial; not scraper-invented |
| Amenities / hours / pricing categories | `Planned` | Curated; higher churn than address — validation + ownership required; **D06 defers pricing/hours from first dynamic release** |
| Theater imagery (hero/thumb) | `Planned` | Rights/attribution required |
| Theater-to-theater travel aids | `Research needed` | Stage 2 audit G09 — curated walk matrix vs routing API; blocks multi-theater planner miles |

Registry remains canonical authored data (`data/theaters.json`). Expand only with validation and inventory updates.

**Stage 4 note (2026-07-26):** Full inventory in [v2/research/theater-data-audit.md](./v2/research/theater-data-audit.md). Public/registry today = identity only (no address/geo/website/amenities/imagery). Next implementation: Stage 4 **`T-THEA-01`** (schema), then **`T-THEA-10`** (curate enabled venues). Do not treat scrapers as SoT for visit meta (D06).

**Stage 1 note (2026-07-27):** v2 mockup coverage for all 17 canonical pages (including Theater list/detail shells) is **complete and accepted** — [v2-stage-1-acceptance-report.md](./v2/v2-stage-1-acceptance-report.md). Fixture Theater Detail does **not** replace `T-THEA-01`; execute schema next.

**Stage 2 note:** Approved Theater list/detail mockups assume Grand Illusion and other venues not in the current registry — venue coverage remains a product-owner theater-selection decision (existing “new source” Planned item), not an automatic scrape task.

---

## Deferred public-site work

| Item | Status | Notes |
|------|--------|-------|
| Public UI redesign to show new source fields | `Deferred` | Requires separate product decision |
| Pages exposure of source catalogs | `Deferred` / not planned | Catalogs are internal |
| Leaving Soon UI expansion | `Deferred` | Gated in [product-roadmap.md](./product-roadmap.md) |
| Next public site build | `Deferred` | Design-first; separate track |
| v2 design specification (D-1+) | `In progress` | Philosophy under [docs/v2/](./v2/README.md); canonical specs complete through Global navigation (D-26); first implementation slice defined (D-27: isolated Home); parallel to data foundation; production UI unchanged |

---

## Suggested sequencing (near term)

```text
P-15A  AMC Showtimes field audit (capture gap)     ← Complete
P-18A  Expand AMC scrape-log raw capture           ← Complete
P-18B  Rerun audit on expanded multi-day logs      ← Research in progress (1 date)
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
P-19A  Align Beacon only where necessary ← Complete
P-20A  Design minimal SIFF alignment ← Complete
   ↓
P-20B  Implement SIFF minimal alignment ← Complete
   ↓
P-20C  SIFF production rollout ← Complete (2026-07-17)
   ↓
P-21A  Cockpit AMC catalog inspection ← Complete (2026-07-17)
   ↓
P-21B  Pipeline-report AMC catalog health ← Complete (2026-07-17)
   ↓
P-21C  Catalog cadence + inactive growth evaluation ← Complete (2026-07-17)
   ↓
**No Ready Cursor implementation task** on the data-foundation track — product-owner direction or passive evidence gates
   ↓
Parallel: **v2 design specification** ([docs/v2/](./v2/README.md)) — Product Owner + ChatGPT; canonical screen specs ([docs/v2/specs/](./v2/specs/)); Cursor implements only agreed specs later
   ↓
Parallel wait: ≥3 distinct expanded AMC dates → finish P-18B (still 1 date: 2026-07-17)
   ↓
Parallel wait: ≥14 catalog calendar dates (or threshold) → re-run cadence audit (currently 3)
   ↓
Parallel observation: NWFF/Central health (passive until more Option C days or a defect)
   ↓
Later: stale-N design only if evidence gate trips (Deferred)
   ↓
Later: new source / theater-slice restatement / identity / redesign (needs PO pick)
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
