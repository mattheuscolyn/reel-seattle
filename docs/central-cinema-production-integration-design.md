# Central Cinema — Production Integration Design

**Status:** Design complete (P-17B) — **not production-enabled**  
**Track:** Data Foundation · Independent-theater ingestion  
**Depends on:** P-16C, P-17A  
**Last updated:** 2026-07-16  
**Prototype:** [central-cinema-ingestion-prototype.md](./central-cinema-ingestion-prototype.md)  
**Contract:** [independent-source-observation-contract.md](./independent-source-observation-contract.md)  
**Parallel pattern:** [nwff-production-integration-design.md](./nwff-production-integration-design.md)

## Executive recommendation

Integrate Central Cinema the same way NWFF was enabled: keep extraction behind the shared contract, then map **accepted** observations into the existing indie scrape-log → `daily_processor` → history → public emit path.

```text
Central calendar discovery and movie-page parsing
    ↓
IndependentSourceResult v1.0.0   ← sole source-specific boundary
    ↓
contract validation
    ↓
Central contract→indie mapping
    ↓
Option C production raw log
    ↓
existing indie normalization + conditional restatement
    ↓
history / public / pipeline_report
```

**Do not** bypass the contract and emit legacy rows directly from HTML parsers.

| Decision | Recommendation |
|----------|----------------|
| Production source key | `central_cinema` (match contract + prototype) |
| Theater ID | `central-cinema` |
| Venue model | One canonical venue; no screens |
| Venue proof | Canonical site/page type may prove main venue when labels absent |
| Showtime identity | Numeric checkout showing ID **required** |
| Program identity | `/movie/` slug → history `source_film_id` |
| History schema | No new columns required for slug; prefer adding `source_showtime_id` at enablement (already anticipated by `history_nulls`) |
| Window | Pacific today … today+13 (14 inclusive days) |
| Raw log | Option C — `YYYY-MM-DD_central_cinema.json` |
| Mapping module | `reel_seattle.ingestion.central_cinema_mapping` |
| Rich metadata | Raw-only initially (description, credits, language, etc.) |
| Shadow phase | Short: P-17D manual (≥2 live runs) then P-17E schedule |

---

## 1. Source-key decision

### Options

| | Option A `central_cinema` | Option B `central` |
|--|---------------------------|--------------------|
| Pros | Matches contract `KNOWN_SOURCES`, prototype, fixtures; unambiguous | Shorter; closer to `siff`/`beacon`/`nwff` brevity |
| Cons | Longer than other indie keys | Requires contract/fixture/source migration; ambiguous (“central” what?) |

### Recommendation: **Option A — `central_cinema`**

Use consistently across contract results, registry `source`, daily logs, history, public artifacts, pipeline reports, filenames, and schemas.

Rationale: IndependentSourceResult v1.0.0 and P-17A already use `central_cinema`. Renaming to `central` would be a contract migration for no operational gain. NWFF’s short key (`nwff`) was chosen before a longer form was locked; Central is already locked.

Do **not** persist dual aliases at the data level.

---

## 2. Theater registry design

### Recommendation

Add **one** theater entry. No auditorium/screen entities. No separate event-space record until product explicitly approves another venue.

### Proposed entry

```json
{
  "id": "central-cinema",
  "name": "Central Cinema",
  "aliases": ["Central Cinema"],
  "source": "central_cinema",
  "enabled": true,
  "type": "indie",
  "city": "Seattle",
  "neighborhood": "Central District",
  "timezone": "America/Los_Angeles"
}
```

Notes:

* Omit `source_external_id` (AMC-only).
* Do **not** invent unsupported fields (e.g. `address`).
* Place after existing indie/rep entries in registry order (following `northwest-film-forum`).
* Schema prerequisite (implementation): extend theaters / showtimes_current / pipeline_report source enums to include `central_cinema` (same pattern as NWFF P-16F/H).

### Schema enums to extend later

* `schema/theaters/v1.0.0.json` — `source`
* `schema/showtimes_current/v1.0.0.json` — `sources_included`, `sources`, showtime `source`, theater snapshot `source`
* `schema/pipeline_report/v1.0.0.json` — `sources`
* `KNOWN_SOURCES` in `source_freshness.py` / indie restatement allowlists

---

## 3. Venue and off-site policy

### Observation (P-17A)

Movie pages did not expose per-occurrence venue labels. Accepted showtimes are checkout links on canonical `central-cinema.com` `/movie/` pages.

### Recommendation: site-scoped main venue (not silent defaulting)

**Accept** showtimes when **all** of the following hold:

1. Calendar and movie URLs canonicalize to `central-cinema.com` / `www.central-cinema.com`.
2. Program path is canonical `/movie/{slug}/`.
3. Showing path is `/checkout/showing/{slug}/{id}`.
4. SPA/calendar structural validation passed.
5. No explicit off-site, partner, outdoor, or virtual venue signal is present on the page.

This is **affirmative site/page-type venue proof**, not “missing location ⇒ Central.”

**Reject** (completeness-affecting when screening-like) occurrences that:

* name a partner venue, outdoor site, or other address,
* are marked online/virtual/streaming,
* are ambiguous (“TBA venue”, conflicting venue text),
* leave the canonical Central host/path scope.

| Case | Completeness-affecting? |
|------|-------------------------|
| Canonical Central movie + checkout, no venue label | No — accepted via site proof |
| Explicit off-site / partner / outdoor / virtual | **Yes** |
| Ambiguous venue text | **Yes** |
| Non-screening / private rental clearly accounted | Policy: treat like NWFF workshops — reject without blocking valid empty when confidently non-public |

New venues require **explicit** registry work. Do not auto-create theater IDs from prose.

---

## 4. SPA-backed discovery safeguards

Calendar is SPA-backed (`#q-app`) but currently exposes server-rendered Explore Movies `/movie/` links.

### Required structural checks (production)

| Check | Severity |
|-------|----------|
| Calendar HTTP success | error |
| Expected shell (`#q-app` or documented equivalent) | error |
| Explore Movies / movie-directory region OR parseable `/movie/` links | error |
| Canonicalization of discovered links succeeds without material ambiguity | error |
| Page is not an empty hydration stub / challenge / interstitial | error |
| Meaningful text content present (not blank app shell) | error |

Store checks under contract `structural_validation` and surface summaries in pipeline warnings.

### Outcomes

| Situation | Status | Restate |
|-----------|--------|---------|
| Structure OK + movie links | Normal discovery | Per completeness |
| Structure OK + zero movie links + affirmative empty proof | `valid_empty` possible | Safe clear if proven |
| Shell present, discovery links absent, no empty proof | `structural_failure` | Unsafe, stale retain |
| Challenge / error interstitial | `structural_failure` or `request_failure` | Unsafe |
| Some malformed `/movie/` hrefs while others parse | Warning if no in-scope loss; else `partial_failure` | Unsafe if programs may be lost |

**Do not** treat “zero regex matches” as valid empty by default.

### Monitoring (post-enable)

* Discovery count swings day-over-day
* Zero-link structural failure rate
* Hydration/shell-only failures
* Page-failure and malformed-checkout rates

---

## 5. Program identity persistence

| Fact | Survive how? |
|------|----------------|
| `source = central_cinema` | History / public `source` |
| `/movie/` slug | History **`source_film_id`** |
| Exact schema.org name | `source_title` / `Film` |
| Calendar-displayed title | Contract/raw; warn on mismatch |
| Canonical movie URL | `source_film_url` in RawShowtime + Option C log (history has no URL column) |
| schema.org metadata | Full contract in Option C |
| Description paragraphs | Contract `raw` only initially |
| `dateCreated` | Contract `raw` only — **never** release year |
| Credible `copyrightYear` | Optional history/public year when valid |

### History-schema decision (program)

**No history-schema change for slug.** Map:

```text
attributes["source_film_id"] = slug
attributes["source_program_id"] = slug
```

Reuse existing `source_film_id_from_raw` / indie legacy path (already used by NWFF). Title must never be identity.

---

## 6. Showtime identity persistence

### Declared production key

```text
source_showtime_id = final numeric checkout segment
showtime_strategy = source_showing_id
preferred dedup key = (source, source_showtime_id)
```

Showing ID is **mandatory** for accepted production showtimes. Do **not** fall back to a composite when the ID is missing — reject as malformed (completeness-affecting).

### Where it survives today

| Layer | Status |
|-------|--------|
| Contract showtime | Yes |
| `RawShowtime.source_showtime_id` | Yes |
| Option C `records[]` | Yes |
| History CSV `HISTORY_FIELDNAMES` | **Not currently listed** (though `history_nulls` already anticipates `source_showtime_id`) |
| Public emit | Field exists; currently hardcoded `null` for all sources |

### Recommendation

1. **Required:** populate `RawShowtime.source_showtime_id` and Option C records.
2. **At P-17E enablement:** add `source_showtime_id` to history fieldnames (additive column already expected by null normalization) so IDs survive beyond daily logs.
3. **Public emit of showing IDs:** optional follow-up (AMC also maps IDs in raw but public currently nulls them). Not a blocker for restatement.
4. Ticket URLs remain raw-only / not public v1.

### Conflict rules

| Case | Behavior |
|------|----------|
| Identical duplicate checkout links | Deduplicate |
| Same showing ID, conflicting slug/date/time | Unsafe (`conflicting_showing_id`) |
| Different IDs, same theater/date/time | Retain both |
| Title changes, ID stable | Same identity |
| URL host/`www` changes, numeric ID stable | Same identity |
| Showing removed before performance | Safe restatement clears it when scrape succeeds |
| Missing showing ID on apparent checkout | Reject; completeness-affecting |

Restatement remains wipe-and-replace for future Central rows, so cross-day history matching is secondary to within-scrape identity + QC.

---

## 7. Contract-to-legacy mapping

| Contract field | Production destination | Preservation |
| -------------- | ---------------------- | ------------ |
| `source` | history/public source | required |
| `source_program_id` | `source_film_id` | required |
| `source_showtime_id` | RawShowtime + log (+ history column at enablement) | required |
| `source_title` | `Film` / `source_title` | exact |
| `source_program_url` | `source_film_url` + contract | durable in log |
| `source_occurrence_url` | attributes / contract | durable in log |
| `ticket_url` | `ticket_url_raw` | durable, not public |
| `theater_id` | `central-cinema` via registry | required |
| `local_date` / `local_time` | history Date/Time / `time_24h` | required |
| `timezone` | LA context | required |
| runtime | Runtime when unambiguous | optional |
| release year | only from credible `copyrightYear` (never `dateCreated`) | optional |
| description / credits / genre / rating / language / country | full contract/raw | raw-only initially |
| program kind | raw | optional |
| structural checks / windows / `restate_safe` | log + report diagnostics | required |

### Loss classification

| Loss | Class |
|------|--------|
| History lacks program URL | Must remain in raw log — acceptable |
| Public ticket URL null | Acceptable initially |
| Rich description/credits not public | Acceptable initially |
| Destroying slug or showing ID | **Blocks production** |
| Silent off-site→Central mapping | **Blocks production** |
| Composite fallback when ID missing | **Blocks production** (Central always had IDs live) |

### Mapping module

```text
reel_seattle.ingestion.central_cinema_mapping
```

Mirror NWFF’s Option C envelope shape; keep Central-specific rules (mandatory showing ID, site-scoped venue proof, year-inference evidence). Do **not** prematurely merge with `nwff_mapping` unless duplication becomes substantial and semantics match.

---

## 8. Raw log strategy (Option C)

Filename:

```text
data/daily_logs/YYYY-MM-DD_central_cinema.json
```

Envelope (same pattern as NWFF):

1. Full `independent_source_result` (contract v1.0.0)
2. `mapping` diagnostics (`status`, `restate_safe`, accepted/rejected, warnings)
3. Legacy-compatible `records[]` (`RawShowtime`) for processor loading
4. Standard scrape-log fields: `schema_version`, `generated_at`, `source`, `stats`, `warnings`, `errors`

Must preserve: contract version, status, final `restate_safe`, windows, calendar structural checks, canonical program links, schema.org metadata, showing IDs, ticket URLs, exact titles, year-inference evidence, warnings/rejections.

**No full HTML.**

Final restatement eligibility:

```text
independent_source_result.restate_safe
AND mapping.restate_safe
AND stats consistency
```

Reuse `reconcile_option_c_restate_safe` (or Central-equivalent AND).

---

## 9. Date and year inference (production)

| Input | Rule |
|-------|------|
| Explicit year in link text | Wins when calendar-valid |
| Missing year | Unique year placing date inside requested inclusive Pacific window |
| Zero or multiple candidates | Reject; completeness-affecting if in-scope |
| Outside-window (resolved) | Filter after parse; not completeness-affecting |
| Past performances on page | Filter; not completeness-affecting |
| Dec→Jan windows | Supported (proven in P-17A fixtures) |
| Multi-year future windows | Still unique-year-in-window rule |

Preserve raw visible date text + inference flags under showtime `raw`.

Scheduled window:

| Parameter | Value |
|-----------|--------|
| Timezone | `America/Los_Angeles` |
| Start | Pacific run date |
| End | run date + 13 days (14 inclusive) |

### Discovery vs window (important)

Central’s calendar Explore Movies list is **not** date-filtered. Production must:

1. Discover all canonical `/movie/` links from the calendar,
2. Fetch **every** discovered movie page once,
3. Parse all checkout links,
4. Accept only showtimes inside the requested window.

Pages with zero in-window showtimes still contribute program observations and help prove window completeness. Skipping pages because they “look” out of window is unsafe.

---

## 10. Restatement scope

```text
source = central_cinema
AND theater_id = central-cinema
AND show_date >= Pacific run date
```

(Use the processor’s current “today and future” convention.)

| Result | Behavior |
|--------|----------|
| Final `restate_safe=true` | Clear future Central rows; insert mapped rows; keep past |
| Unsafe | Preserve all future Central rows; **no partial insert**; retain raw log; warn |
| Later safe run | Recovers from stale retention |

No title- or program-based clearing. Source-local: does not affect AMC/SIFF/Beacon/NWFF.

---

## 11. Valid empty

Safe zero-showtime clear requires:

* calendar expected structure loaded,
* discovery scope inspected,
* all discovered `/movie/` pages fetched successfully,
* every apparent checkout link accounted for,
* zero accepted in-window showtimes,
* no malformed in-scope showing links,
* no failed pages,
* no unresolved venue issues,
* `valid_empty_evidence.proven=true`,
* final `restate_safe=true`.

**Movie pages exist but all showtimes outside the requested window:** yes — this may be **valid empty for the window** when every page was successfully inspected.

Suspicious zero (shell without links / failed hydration) must **not** clear futures.

---

## 12. Failure semantics

| Failure | Status | Restate |
|---------|--------|---------|
| Calendar request failure | `request_failure` | Unsafe, stale retain |
| SPA shell without discoverable links / no empty proof | `structural_failure` | Unsafe |
| One movie-page request failure | `partial_failure` | Unsafe (page is showtime authority) |
| Movie page missing Movie microdata **but** checkout structure confidently present | Metadata warning; showtimes may remain accepted if checkout parse is complete | Prefer **safe** only when showtime structure is affirmatively present and complete |
| Missing both microdata and showtime structure | `structural_failure` | Unsafe |
| Malformed checkout (ID/date/time) that appears in-scope | Completeness-affecting | Unsafe |
| Missing `dateCreated` / optional metadata | Informational | Safe |
| Invalid `copyrightYear` | Warning; year null | Safe unless structure broken |
| Page with no ticket links + no expected showtime container | Structural / partial per selector evidence | Usually unsafe |
| Page with no in-window showtimes but container present | Valid program; contributes to valid empty / success | Safe when complete |
| Calendar vs schema title mismatch | Warning; retain both | Safe |

Parsed observations may appear in unsafe logs for diagnosis but must not partially restate.

---

## 13. Metadata mapping strategy

### Map initially when valid

* Exact title
* Runtime (unambiguous duration)
* Credible release year (`copyrightYear` only)
* Poster/image when current raw model supports it

### Raw-only initially

* Full description + paragraphs
* Cast, directors, writers, producers
* Country, language, genre, content rating (unless trivial one-field map proves safe)
* `dateCreated`
* Special presentation prose (Hecklevision, sing-alongs, hosted notes)
* Full schema.org source values

Aggressive enrichment is inappropriate for sing-alongs, hosted presentations, repertory events, Hecklevision, and unusual programs — free text must not invent `presentation_attributes[]` or attach notes to every showing without structured evidence.

---

## 14. Screening-specific prose

Initial production policy:

* Preserve prose in the full contract,
* Do **not** derive presentation attributes from free text,
* Do **not** attach Hecklevision-like notes to all showtimes from page description alone,
* If prose names a specific date/time, keep that evidence under `raw` for a later presentation-attribute task.

---

## 15. Duplicate and conflict handling

### Programs

Dedup key: `(source, source_program_id)`  
Conflicting page metadata → warning / validation issue; do not invent a second program ID from title.

### Showtimes

Dedup key: `(source, source_showtime_id)`  

* Identical duplicates → dedupe  
* Conflicting same ID → unsafe  
* Different IDs same slot → retain  
* Missing ID → reject (no composite)

---

## 16. Pipeline reporting

Add `central_cinema` as a recognized source (enum + generation), parallel to NWFF.

Report at minimum:

* status,
* accepted showtime/program counts,
* discovered / succeeded / failed movie pages,
* malformed showing count,
* warnings,
* stale retention messaging,
* last successful run (advance only on safe success or valid empty).

Distinguish fresh success, valid empty, partial/structural/request failure with stale retention. Retained published rows must not masquerade as a fresh scrape success (same limitation/documentation as NWFF: use warnings + do not advance freshness on unsafe runs).

Prefer schema-compatible warning text unless new optional diagnostics prove necessary.

---

## 17. Workflow placement

```text
Central collection (adapter/CLI)
    ↓
contract validation + mapping
    ↓
Option C tracked raw log
    ↓
existing indie JSON loading (records[])
    ↓
conditional source-local restatement
    ↓
history / public validation / pipeline report
```

Place beside SIFF, Beacon, and NWFF in `webscrapetheaters` / daily collection. **Do not** fetch Central inside `daily_processor.py`. Soft-fail represented source failures; fail visibly on programming/schema/serialization corruption.

---

## 18. Source-local failure isolation

Central failures must not affect AMC, SIFF, Beacon, or NWFF.

| Class | Behavior |
|-------|----------|
| Ordinary request/partial/structural | Valid unsafe Option C log; retain Central futures; continue others |
| Programming / schema corruption / unserializable log | Fail visibly; do not invent empty success |

---

## 19. Public artifact behavior

Eventually extend enums only (no schema shape change):

* showtime `source`
* `sources_included`
* `sources.central_cinema`
* theater snapshot `source`
* pipeline-report `sources.central_cinema`

Initial public Central showtimes: title, theater, date/time, runtime/year when mapped. Ticket URLs and rich descriptions unexposed.

**Grouping risk:** programs such as `80s Sing Along`, `Cartoon Happy Hour`, Hecklevision Face/Off, and special events must remain distinct via slug/`source_film_id` — never merge on normalized title alone. Add tests for that.

---

## 20. Implementation sequence

### P-17C — Registry + offline contract→indie mapping — **Complete**

* Theater entry + schema source enum `central_cinema`
* `central_cinema_mapping` Option C envelope
* Main-venue site proof; slug → `source_film_id`; mandatory showing ID
* Fixtures + tests
* Doc: [central-cinema-contract-mapping.md](./central-cinema-contract-mapping.md)
* **No** live adapter, schedule, or restatement

### P-17D — Production-compatible adapter + manual workflow — **Complete**

* Live collection adapter/CLI (`reel_seattle.adapters.central_cinema`, `scripts/scrape_central_cinema.py`)
* Option C writer + validation
* Manual workflow_dispatch (≥2 live runs)
* Parser compatibility proof
* Doc: [central-cinema-production-adapter.md](./central-cinema-production-adapter.md)
* **No** scheduled ingestion / restatement

### P-17E — Scheduled production enablement — **Next**

* Daily collection + tracked logs
* Conditional restatement + history `source_showtime_id` column (recommended)
* Public/pipeline enums
* First/second production QC

### Optional follow-ups

* Central cockpit inspection
* Metadata enrichment
* Structured screening-note / presentation-attribute research
* Public emit of `source_showtime_id`

---

## 21. Tests and QC design

### Registry

* Entry validates; enum accepts `central_cinema`; aliases resolve; unknown source invalid; no screens

### Mapping

* Slug → `source_film_id`; showing ID stable; title≠identity; conflicting IDs unsafe; no composite fallback; exact titles; `dateCreated` raw-only; credible year maps; tickets raw; malformed affecting safety

### Venue

* Canonical pages resolve; off-site/virtual/ambiguous reject; no arbitrary missing-location default; site-level proof tested

### Date/time

* Same-year; explicit year; Dec→Jan; ambiguous reject; outside-window filter; noon/midnight

### Restatement

* First safe insert; second safe no dupes; unsafe preserve; valid empty clear; past preserved; other sources isolated

### Reporting

* Fresh success; valid empty; partial stale; SPA structural failure; last-successful semantics

### Public

* Enums; theater snapshot; grouping; schema shape unchanged

### Manual QC (P-17D/E)

Compare ≥10 live showtimes (title, date, time, showing ID, ticket URL, page URL) and ≥5 metadata pages (`dateCreated` not year; readable descriptions).

---

## 22. Rollout

Factors favoring a **short** manual phase (not a long shadow):

* SPA discovery dependency (needs two live confirmations),
* strong showing IDs (37/37 live),
* complete page coverage in P-17A,
* no live parse failures in the validated window.

### Plan

1. P-17C offline mapping — **Complete**
2. P-17D ≥2 manual production-shaped live runs — **Complete**
3. P-17E schedule + first/second production QC — **Next**
4. Monitor zero-link structural failures, page failures, malformed checkouts, showing-ID conflicts, discovery swings 

---

## 23. Product decisions (defaults)

1. **Source key:** `central_cinema`  
2. **Venue without label:** yes — canonical Central site/page type may prove main venue under structural validation  
3. **Description/credits:** raw-only initially  
4. **Shadow:** short P-17D manual validation before schedule  
5. **Showing ID:** mandatory for accepted production showtimes  

---

## Open product decisions

None blocking P-17E. Deferred:

* Whether/when to emit `source_showtime_id` in public showtimes  
* Presentation-attribute extraction from screening prose  
* Additional Central venues if off-site labels appear  

---

## Production boundaries (this task)

P-17B changes **documentation only**. No registry, schemas, adapters, workflows, history, public artifacts, SIFF, Beacon, NWFF, cockpit, frontend, or Pages changes.
