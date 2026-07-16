# Northwest Film Forum — Production Integration Design

**Status:** Design complete (P-16E) — **not implemented**  
**Track:** Data Foundation · Independent-theater ingestion  
**Depends on:** P-16C (contract v1.0.0), P-16D (NWFF prototype)  
**Last updated:** 2026-07-15  
**Prototype:** [nwff-ingestion-prototype.md](./nwff-ingestion-prototype.md)  
**Contract:** [independent-source-observation-contract.md](./independent-source-observation-contract.md)

## Executive recommendation

Integrate NWFF by keeping extraction behind the shared contract, then mapping **accepted** observations into the existing indie scrape-log → `daily_processor` → history → public emit path.

```text
NWFF-specific extraction (prototype → production adapter)
    ↓
IndependentSourceResult v1.0.0   ← sole source-specific boundary
    ↓
contract validation
    ↓
daily scrape log (contract + legacy RawShowtime records)
    ↓
conditional source-wide restatement (restate_safe only)
    ↓
history / public / pipeline_report
```

**Do not** bypass the contract and write legacy rows directly from HTML parsers.

**Initial venue model:** one canonical theater (`northwest-film-forum`).  
**Initial location policy:** accept only main-venue NWFF; reject off-site/unknown/online.  
**Initial identity:** `/films/` slug → `source_film_id`; showtime composite fallback; no history-schema change.  
**Initial window:** 14 forward days in `America/Los_Angeles` (match public emit; do not copy the unused indie 365-day echo).  
**First implementation task:** **P-16F** — registry entry + contract→indie mapping with fixtures; no daily workflow yet.

---

## 1. Theater registry design

### Recommendation

Add **one** theater entry. No screen-level IDs. No second venue until an off-site location is explicitly product-approved.

### Proposed entry

```json
{
  "id": "northwest-film-forum",
  "name": "Northwest Film Forum",
  "aliases": ["NWFF", "Northwest Film Forum"],
  "source": "nwff",
  "enabled": true,
  "type": "indie",
  "city": "Seattle",
  "neighborhood": "Capitol Hill",
  "timezone": "America/Los_Angeles"
}
```

Notes:

* Omit `source_external_id` (required only for `source: "amc"`).
* Do **not** invent an `address` field — unsupported by `schema/theaters/v1.0.0.json`.
* `aliases` must include the exact source location string observed in live HTML (`Northwest Film Forum`) so registry resolution is deterministic.
* Duplicate of canonical `name` in `aliases` is acceptable for scrape-label matching (Beacon already uses a short alias).

### Schema prerequisite (implementation PR, not this task)

Current theater schema `source` enum is only `amc | siff | beacon`. Production NWFF **requires** extending that enum (and any code that hardcodes the three sources) to include `nwff`.

### Venue model vs live evidence

Live P-16D windows mapped all accepted showtimes to location label `Northwest Film Forum`. That supports a single registry entry. Unnamed multiple screens, if they appear later without distinct labels, still map to this one ID.

---

## 2. Off-site and unknown location policy

### Recommendation: Option A

**Accept only** occurrences whose source location resolves confidently to the canonical NWFF venue (name/alias match after trim + casefold).

**Reject** with structured rejection + warning:

* named partner venues,
* festivals at another address,
* ambiguous / empty locations when the site normally supplies a location,
* **virtual / online** events (treat as out of scope for Reel Seattle’s physical showtime product).

### Completeness impact

| Case | Completeness-affecting? |
|------|-------------------------|
| Clearly classified workshop / non-screening | No |
| Off-site / unknown / online occurrence that looks like a public screening | **Yes** → `restate_safe=false` |
| Malformed film link claiming to be a film | **Yes** |

Rationale: silently dropping a Seattle-relevant screening would leave stale/wrong futures; treating uncertain screening-like rows as safe-empty would also be wrong. Workshops are accounted rejections and do not block valid empty.

### Future expansion

New venues require **explicit** registry work (new `id` + product decision). Do not auto-create theater records from calendar text (reject Option B). Do not emit null `theater_id` (reject Option C — contract forbids it).

---

## 3. Program identity persistence

| Fact | Survive how? |
|------|----------------|
| `source = nwff` | History `source`; public `source` (enum extension required) |
| `source_program_id` (slug) | Map into history **`source_film_id`** via RawShowtime `attributes` (see below) |
| Exact calendar title | Showtime `source_title` / legacy `Film` / `source_title` |
| Exact program-page title | Contract/raw log; optional `attributes.program_page_title` |
| Source program URL | RawShowtime `source_film_url` + contract log (history has **no** URL column today) |
| Classification / series / mismatch diagnostics | Contract/raw log only initially |

### History-schema decision

**No history-schema change for initial integration.**

Populate existing `source_film_id` by setting RawShowtime attributes such as:

```text
attributes["source_film_id"] = "<films-slug>"
attributes["source_program_id"] = "<films-slug>"  # explicit parallel
```

Extend `source_film_id_from_raw` (implementation) to recognize `source_program_id` if needed. A normalized title must never be the primary identity.

### New internal observation artifact?

**Not required to start.** The durable daily scrape log should carry the full `IndependentSourceResult` (see §6). A separate long-lived observation catalog can wait until multi-source contract alignment justifies it.

---

## 4. Showtime identity persistence

### Declared production key

```text
source_showtime_id = null
logical_key = source_program_id + "|" + theater_id + "|" + local_date + "|" + local_time
```

Timezone is always `America/Los_Angeles` for NWFF.

### Collision / discriminator

If two accepted occurrences share the logical key:

1. Prefer canonical **occurrence ticket URL** as discriminator (live coverage was complete).
2. Else stable start ISO / occurrence metadata already in contract `raw`.
3. Persist discriminator under `attributes` / contract `raw`; emit warning.
4. **Do not** drop one occurrence silently.
5. **Do not** use normalized title.

Overlapping calendar pages and exact HTML duplicates must be **deduped** before identity assignment (prototype already does this).

Restatement is wipe-and-replace for future NWFF rows, so cross-day identity stability matters mainly for QC and duplicate prevention within a single scrape, not for matching prior history row IDs.

---

## 5. Contract-to-legacy mapping

| Contract field | Initial production destination | Preserved? | Notes |
| -------------- | ------------------------------ | ---------: | ----- |
| `source` | history/public `source`; scrape log | Yes | Requires schema enum `nwff` |
| `source_program_id` | history `source_film_id` via attributes | Yes | No new history column |
| `source_showtime_id` | public field (null); log | Yes (null) | Composite in raw only |
| showtime `source_title` | history `source_title` + `Film` | Yes | Calendar title; exact |
| program `source_title` | contract log; attributes | Raw + partial | Page title |
| `source_program_url` | `source_film_url` in log/RawShowtime | Log yes / history no | Acceptable loss in history CSV |
| `source_occurrence_url` | usually same as program URL | Log | |
| `ticket_url` | `ticket_url_raw` in log | Log yes / **public no today** | Emit hardcodes `ticket_url: null` — acceptable initially; later emit task |
| `theater_id` | history `theater_id` via registry | Yes | Must match registry |
| `local_date` / `local_time` | history Date/Time / `time_24h` | Yes | |
| `timezone` | implied LA; registry timezone | Yes | |
| `program_kind` | contract log | Raw | |
| program `raw` metadata | contract log | Raw | runtime/year optional map if confident |
| showtime `raw` | contract log | Raw | authority, discriminator, tickets |
| `warnings` / rejects | scrape log stats + warnings | Yes | |
| requested/inspected windows | scrape log stats | Yes | |
| `restate_safe` / `status` | scrape log stats | Yes | Gates processor |

### Loss classification

| Loss | Class |
|------|--------|
| History lacks program URL | Must remain in raw logs — acceptable for v1 |
| Public `ticket_url` always null today | Acceptable initially; track as follow-up |
| Rich description/directors/series not in public film records | Acceptable initially — raw only |
| No `source_program_id` public field name | Acceptable — reuse `source_film_id` |
| Destroying slug identity | **Blocks integration** — must map into `source_film_id` |
| Silent off-site→NWFF mapping | **Blocks integration** |

---

## 6. Raw log strategy

### Recommendation: Option C (smallest safe)

Daily log for `nwff` should contain:

1. **Full serialized `IndependentSourceResult`** (contract v1.0.0) under an explicit key, e.g. `independent_source_result`.
2. **Legacy-compatible `records[]`** of `RawShowtime` derived from **accepted** showtimes only, for `daily_processor` / existing indie helpers.

Also retain envelope fields already used by indie logs: `schema_version`, `generated_at`, `source`, `stats` (including `restate_safe`, `scrape_status`, windows), `warnings`, `errors`.

### Avoid

* Storing full HTML
* Option B alone (flattened rows drop completeness proof)
* Option A alone without a RawShowtime projection (forces a larger processor rewrite in the first PR)

Path convention: `data/daily_logs/YYYY-MM-DD_nwff.json` (same pattern as SIFF/Beacon).

---

## 7. Restatement scope

### Recommendation

**Source-wide restatement for `nwff`**, gated by `restate_safe=true`.

With one canonical venue this is equivalent to theater-window restatement and matches SIFF/Beacon’s `INDIE_RESTATE_SOURCES` pattern. Program-slice restatement is deferred.

### Exact behavior

When allowed:

1. Delete all history rows with `source=nwff` and show date ≥ run “today” (Pacific).
2. Insert accepted NWFF rows for dates ≥ today from the day’s scrape.
3. Never delete past rows.

When `restate_safe=false`:

* Skip NWFF restatement.
* Retain prior future NWFF rows (stale retention).
* Still may write the day’s scrape log for diagnostics.

---

## 8. Requested window

### Recommendation

| Parameter | Value |
|-----------|--------|
| Timezone for “today” | `America/Los_Angeles` |
| `start` | run date (today) |
| `end` | today + **13 days** (inclusive **14-day** window) |
| Over-fetch | Allowed (calendar weeks) |
| Filter | Accept showtimes only inside requested window |
| Record | Both `requested_window` and `inspected_window` on contract + scrape stats |

Do **not** adopt the current indie `+365` FetchContext echo as a real fetch window. Public emit already uses 14 days (`WINDOW_DAYS` in `reel_seattle/emit/current.py`). Aligning NWFF to 14 days keeps scrape cost and restatement scope coherent.

---

## 9. Valid empty behavior

A zero accepted-showtime NWFF result may clear future NWFF rows **only when**:

* every required calendar week loaded,
* expected calendar structure present,
* requested window coverage complete,
* material program-page policy satisfied (none required if zero film occurrences),
* rejections accounted for,
* no completeness-affecting off-site/unknown remains,
* `valid_empty_evidence.proven=true`,
* `restate_safe=true`.

**Workshops-only window:** if the calendar is structurally valid, fully covered, and every non-film entry is a reliably classified rejection, treat as **valid empty** for Reel Seattle (no in-scope screenings). That correctly clears stale film showtimes.

---

## 10. Partial failure and related cases

| Case | Production behavior |
|------|---------------------|
| Required calendar page failure | Unsafe; retain stale futures; no last-success advance for NWFF |
| Incomplete traversal / stall | Unsafe; retain stale |
| Material program-page fetch/structure failure | Unsafe; retain stale (P-16B-aligned conservatism) |
| Title mismatch (calendar vs page) | Warning only; remains safe if otherwise complete |
| Detail schedule mismatch | Warning only; calendar authoritative; remains safe |
| Unknown/off-site/online screening-like | Reject observation; **unsafe** if any such reject |
| Malformed `/films/` claim | Reject; **unsafe** |
| Missing ticket URL | Warning/acceptable; remains safe |
| Rejected workshop | Reject; does **not** alone make unsafe |
| Contract validation failure | Soft-fail NWFF; retain stale; do not restate |
| Normalization / unknown theater_id | Soft-fail NWFF; retain stale; visible error |

`last_successful_run` for NWFF should advance only on restatement-eligible success/valid_empty (same freshness spirit as existing indie sources).

---

## 11. Schedule mismatch policy

* Calendar remains sole showtime authority.
* Never union calendar + detail schedules.
* Never invent showtimes from detail prose.
* Store structured warnings (`detail_schedule_has_additional`, `calendar_schedule_has_additional`, missing/unparseable).
* **Do not** flip `restate_safe` for mismatches alone when calendar coverage and structure are sound.
* Escalate to partial failure only if calendar parsing itself is uncertain (missing structure, unparseable occurrence times, or mismatches accompanied by structural failures).

Monitor mismatch rate in logs/cockpit later; no arbitrary numeric threshold in v1.

---

## 12. Metadata strategy

| Field | Initial production |
|-------|--------------------|
| Exact titles | **Required** in history/public source_title path |
| Runtime | Map to history `Runtime` when confidently parsed; else Unknown |
| Year / directors / country / series / description / image | **Raw contract log only** |
| Detail schedule text | Diagnostics in contract raw only |

Do not aggressively canonicalize shorts programs or “Staff Selects - …” titles into parent films in v1. Preserve exact source wording first.

---

## 13. Duplicate handling

1. Deduplicate exact calendar overlaps (same program URL + start identity) deterministically before accept.
2. Preserve distinct times and distinct collision discriminators.
3. Conflicting duplicates (same logical key, incompatible ticket/meta) → warn + keep both with discriminators; do not invent a silent merge.
4. Title changes across days do not change `source_program_id`.

---

## 14. Pipeline reporting

### Gap

`schema/pipeline_report/v1.0.0.json` requires sources `amc`, `siff`, `beacon` with `additionalProperties: false`. **NWFF cannot appear without a schema + builder update** in an implementation PR.

### Recommended NWFF source_report fields (reuse existing shape)

* `status`: `success` | `stale` | `empty` | `failed` (existing enum)
* `showtime_count`, `film_count`, `theater_count`
* `last_successful_run`
* `warnings`, `errors`

### Mapping from contract

| Contract / run outcome | Pipeline appearance |
|------------------------|---------------------|
| Fresh success with showtimes in window | `success` |
| Proven valid empty | `empty` (or success-with-zero per existing indie empty handling — match SIFF/Beacon empty semantics when implemented) |
| Unsafe + retained futures still in public window | `stale` + warnings |
| Request/structural failure, no usable public rows | `failed` or `stale` if prior futures remain |

Do not invent new pipeline-report enums in the first NWFF PR set beyond adding the `nwff` source key.

Distinguish scrape-log `scrape_status` / `restate_safe` (internal) from public pipeline `status` (existing vocabulary).

---

## 15. Daily workflow placement

Recommended insertion (minimal change to current SIFF/Beacon ordering):

```text
collect indie showtimes (SIFF, Beacon, NWFF)
    ↓
write per-source daily scrape logs
    ↓
write combined legacy indie CSV (compatibility)
    ↓
daily_processor:
    process AMC…
    process_indie_csv_data for INDIE_RESTATE_SOURCES including nwff
    ↓
emit public artifacts + pipeline_report
    ↓
generated-data commit
```

NWFF adapter should produce contract → validate → log → RawShowtime projection before the processor runs. Prefer calling NWFF beside SIFF/Beacon in `collect_indie_showtimes` / equivalent, not inside AMC.

---

## 16. Failure isolation

| Failure | Behavior |
|---------|----------|
| NWFF request/structural/partial | Soft-fail NWFF only; SIFF/Beacon/AMC continue; retain NWFF stale futures |
| NWFF contract validation fail | Soft-fail NWFF; no restate |
| NWFF normalization / unknown theater | Soft-fail NWFF; no restate |
| Processor error isolated to NWFF loop | Soft-fail NWFF if catchable; do not abort other sources |
| History/public schema corruption / write failure | Fail workflow visibly (not source-local) |

Ordinary source failures must never erase SIFF, Beacon, or AMC rows.

---

## 17. Validation and tests (implementation requirements)

### Registry

* NWFF entry validates against theaters schema (after enum extend).
* Alias resolves `Northwest Film Forum` / `NWFF`.
* Off-site label does not resolve to NWFF.
* No implicit default theater.

### Adapter / mapping

* Fixture contract → RawShowtime preserves slug, exact titles, separate occurrences.
* Program pages fetched once.
* Calendar authority; workshops rejected; mismatch warnings retained.
* Offline fixture mode.

### Identity

* Composite key stable across repeat scrapes.
* Overlap dedupe; same-time collision surfaced.
* Title change does not change `source_film_id`.

### Completeness / restatement

* Safe complete window restates only `source=nwff` futures.
* Calendar/program failure retains stale NWFF futures.
* Valid empty clears NWFF futures only with proof.
* SIFF/Beacon untouched.
* Past NWFF rows preserved.

### Reporting / artifacts

* Pipeline report includes `nwff` after schema update.
* Public/history schemas validate.
* Contract-only fields do not leak unsupported keys into public JSON.
* Raw log retains contract identity + completeness.

---

## 18. Manual QC plan

1. Fixture CLI / mapping unit tests.
2. Live read-only scrape (14-day) before daily wiring; compare ≥10 showtimes to website.
3. Verify ticket URLs in raw log (even if public emit still null).
4. Verify exact titles and workshop rejection.
5. Verify mismatch warnings present when expected.
6. First production-path run (manual workflow): log + optional local history dry-run.
7. Second run: confirm restatement replace of futures only.
8. Confirm generated-data commit contents for NWFF rows.
9. Confirm Pages deploy shows NWFF theater after enablement.
10. Confirm SIFF/Beacon counts unchanged.
11. Offline failure fixtures: calendar fail, program fail, off-site reject → stale retention.

---

## 19. Rollout strategy

Keep phases small; do not overbuild deployment for one venue.

| Phase | Work | Ship? |
|-------|------|-------|
| **1 / P-16F** | Registry + schema enum + contract→indie mapping + fixtures | No daily |
| **2 / P-16G** | Production adapter + raw log + **manual** workflow_dispatch validation | No scheduled daily |
| **3 / P-16H** | Daily workflow + restatement + pipeline_report/showtimes source enum | Yes, after QC |
| **4 / P-16I** | Cockpit / richer diagnostics if operationally needed | Optional |

**Enablement default:** after one successful manual production-path run **and** one successful restatement verification, enable daily. A long parallel shadow period is optional, not required, if soft-fail + stale retention are wired.

---

## 20. Implementation sequence

| ID | Task | Scope boundary |
|----|------|----------------|
| **P-16F** | Add `northwest-film-forum` registry entry; extend theaters `source` enum; contract→`RawShowtime`/legacy mapping + fixture tests | **No** daily workflow, **no** live scheduler |
| **P-16G** | Production NWFF adapter (promote/wrap prototype), daily log writer (Option C), manual workflow_dispatch audit | **No** scheduled daily restatement |
| **P-16H** | Wire into `collect_indie` + `INDIE_RESTATE_SOURCES`; pipeline_report + showtimes_current `source` enums; end-to-end daily | Monitor 1–2 weeks |
| **P-16I** | Cockpit inspection / ops follow-up if needed | Optional |
| **Next indie** | Central Cinema prototype (after NWFF daily is stable) | Separate |
| **Parallel** | Beacon/SIFF contract alignment remains planned, not blocking NWFF v1 if gaps are documented |

---

## Open product decisions

Only decisions that need the product owner. Recommended defaults in parentheses.

1. **Off-site NWFF screenings initially excluded?**  
   **Recommend: Yes (Option A).** Add venues later explicitly.

2. **Rich NWFF metadata (description, directors, series) into current public film records immediately?**  
   **Recommend: No.** Preserve in contract/raw logs; promote later via film-identity work.

3. **Enable daily NWFF after one successful manual production-path run + restatement check, or require a longer shadow period?**  
   **Recommend: Enable after manual + restatement verification**, relying on soft-fail and stale retention; extend shadow only if first live production week is noisy.

---

## Production impact of this document

**None.** This task changes documentation only. No registry, adapter, workflow, history, public JSON, pipeline report, cockpit, frontend, or Pages behavior is modified here.
