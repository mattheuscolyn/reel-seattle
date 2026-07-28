# AMC enrichment research + republish terms gate (T-ENR-AMC-R)

**Status:** Complete (research / written gate) · **Date:** 2026-07-25  
**Roadmap task:** `T-ENR-AMC-R` — *AMC republish terms research* (deliverable: memo / written gate)  
**Follow-on:** `T-ENR-01` (enrichment artifact v0) — **not** started  
**Machine-readable coverage:** [`data/audits/amc_enrichment_coverage.json`](../../data/audits/amc_enrichment_coverage.json)  
**Repro command (no secrets):**

```bash
python scripts/audit_amc_enrichment.py --output-dir data/audits
```

---

## 0. Roadmap vs Stage 4 prompt reconciliation

| Source | Definition of `T-ENR-AMC-R` |
|--------|-----------------------------|
| Integration roadmap | **AMC republish terms research** · deliverable **memo** · Ext=Y · written gate · non-goal: pick vendor · unlocks `T-ENR-01` or skip-AMC path |
| D04 | Selective AMC catalog → public **only after terms review**; hide unsupported; partial-by-source OK; do not select external vendor here |
| Stage 4 cursor prompt | Full enrichment field/coverage/join audit + recommendation (technical research) |

**Material difference:** Roadmap title/deliverable is a **terms / republish gate memo**. The cursor prompt expands into a **technical enrichment audit**.

**Resolution (this packet):** Deliver both, without implementing enrichment activation:

1. **Written gate (roadmap-authoritative):** AMC catalog remains **internal** until PO/legal clears vendor-agreement republish rights for static public artifacts.
2. **Technical audit (prompt):** Measured coverage, joins, FD matrix, and a narrow `T-ENR-01` slice **conditional** on that gate (or an explicit skip-AMC path).

No production enrichment fields were activated. No vendor was selected.

---

## 1. Executive summary

- Durable AMC movie-product catalog already holds high-coverage synopsis, release date, MPAA, genre, directors, cast, distributor, and media URLs — **internal only** (`data/source_catalog/`, not Pages).
- Public `showtimes_current.json` stays thin: title / runtime / poster / identity / tickets. **0/96** public films have year, genres, director, synopsis, or MPAA.
- Current-window join is strong: **41/41** distinct AMC `source_film_id` values in the public window match catalog products (**100%** film-key join on this snapshot).
- Film Detail production already suppresses enrichment slots honestly; fixtures remain QC-only.
- **Terms gate: UNCLEARED.** Developer-portal “display showtimes and associated movie data” copy is a positive *intent* signal, not a substitute for the AMC vendor agreement. Consumer website ToS limits personal use of AMC Content. Repo policy already forbids public catalog exposure.
- **Recommendation:** Keep catalog internal. For `T-ENR-01`, either (a) wait for PO clearance then emit a **separate** public enrichment artifact (AMC-only, text-first slice), or (b) take the roadmap **skip-AMC** path (artifact scaffolding / continue suppress) without republishing AMC marketing copy or media.

---

## 2. Source inventory

### 2.1 Layers

| Layer | Path / module | Enrichment-relevant content | Public? |
|-------|---------------|-----------------------------|---------|
| AMC Movies API (live) | vendor API (not called by this audit) | Full movie product incl. optional `imdbId`, media, cast/crew links | N/A |
| Durable products | `data/source_catalog/amc_movie_products.json` | synopsis, genre, mpaa, directors/cast raw, release_date, media, distributor, presentation | **No** |
| Durable releases | `data/source_catalog/amc_release_observations.json` | `source_release_id` grouping; observed titles/runtimes/dates | **No** |
| Daily AMC logs | `data/daily_logs/*_amc.json` | Showtime attrs (genre/mpaa sometimes), purchase URLs, languages on performances | **No** |
| Public showtimes | `public/data/showtimes_current.json` | Thin film rows + showtimes + ticket/source ids | **Yes** |
| HomeData / FD composer | `v2/filmDetail/*` | Real schedule fields; **hard-null** year/rating/genres/director/synopsis/backdrop/Letterboxd | App |

### 2.2 Catalog field inventory (measured)

Snapshot: products `generated_at` **2026-07-20T01:46:18-07:00** · **54** products.

| Field | Artifact path | Type | Example | Catalog coverage | Grain | Expose now? |
|-------|---------------|------|---------|------------------|-------|-------------|
| Runtime | `runtime_min` | int | `120` | 54/54 | product | Already partial public |
| Release date | `release_date_utc` | ISO string | `2026-…` | 54/54 | product | After terms + year rules |
| Release year | derived | int | `2026` | 54/54 derive | derived | After terms; suppress rereleases |
| MPAA | `mpaa_rating` | string | `PG13` | 51/54 | product | After terms |
| Genre | `genre` | string | `ACTION` | 44/54 | product | After terms + normalize |
| Synopsis | `synopsis` | string | marketing copy | 54/54 | product | After terms (high sensitivity) |
| Director | `directors_raw` | string | unparsed | 40/54 | product | After terms; display only |
| Cast | `starring_actors_raw` | string | unparsed | 37/54 | product | After terms; **no** person search |
| Distributor | `distributor_code` / `_id` | string | codes | 54/54 | product | Optional later |
| Poster | `media.poster_url` | URL | Cloudinary | 54/54 | product | Public already has posters |
| Hero | `media.hero_*` | URL | Cloudinary | 35/54 | product | Higher media risk; defer |
| Trailer | `media.trailer_*` | URL | graph.amctheatres | 33/54 | product | Defer |
| AMC product id | `source_film_id` | string | `72474` | 54/54 | product | Join key (already public) |
| Release id | `source_release_id` | string\|null | wwm | 51/54 | grouping | Evidence only |
| Language | — | — | — | **0** in catalog | — | Unavailable as product field |
| IMDb | — | — | — | **Not in durable schema** | — | Needs separate capture; prior showtimes-path audit ≈0 usable |
| TMDB | — | — | — | None | — | New provider |

Presentation categories on this snapshot include **20** special presentations — metadata must not be blindly inherited across `source_release_id` members.

### 2.3 Public emit (thin)

Public film keys today: `showtime_film_key`, `title`, `runtime_min`, `poster_url`, parent/variant fields, `source_film_id`.  
**Not emitted:** year, genres, director, synopsis, MPAA, backdrop, attributes bag.

Showtimes emit schedule + `ticket_url` / `source_showtime_id` (post T-EMIT-*). Enrichment is intentionally absent.

### 2.4 Dropped / asymmetric paths

- Showtimes API may carry genre/mpaa on performances into **daily logs** `attributes`, but public emit drops them.
- Movies API may expose `imdbId`; durable catalog writer **does not persist** it.
- FD composer reads HomeData film fields; production hero forces enrichment nulls even if a future HomeData field appears without an explicit activation task.

---

## 3. Coverage results (local snapshot)

Audit stamp: **2026-07-25** · showtimes `generated_at` **2026-07-24T19:54:07-07:00**.

| Scope | Synopsis | Genre | MPAA | Directors | Cast | Release date | Runtime |
|-------|----------|-------|------|-----------|------|--------------|---------|
| Full catalog (54) | 54/54 | 44/54 | 51/54 | 40/54 | 37/54 | 54/54 | 54/54 |
| Current-window joined (41) | 41/41 | 34/41 | 41/41 | 31/41 | 28/41 | 41/41 | 41/41 |
| Public films (96, all sources) | 0/96 | 0/96 | 0/96 | 0/96 | — | — | 81/96 |

Join: **41/41** current AMC `source_film_id` ∈ catalog; **0** multi-id film keys; **13** catalog products not in current window (inactive/out of window).

See JSON for presentation breakdown, title-level conflict observations, and field classification.

---

## 4. Identity / join analysis

**Recommended join precedence**

1. `source_film_id` (= AMC `movieId` = catalog product key)
2. `showtime_film_key` via showtimes that carry `source_film_id` (frontend identity)
3. `source_release_id` — **grouping evidence only**; never merge products or inherit metadata automatically

**Findings**

- Public artifacts already carry enough identity for frontend or producer-side joins (`source_film_id` on films/showtimes).
- One-to-many risk is real across special presentations / formats historically; this snapshot had **0** multi-`source_film_id` film keys, but release observations still show multi-member groups.
- Prefer **producer emit** of a separate enrichment artifact keyed by `showtime_film_key` and/or `source`+`source_film_id` over client-side catalog fetch (catalog must stay non-public until cleared).

**Do not** introduce canonical `film_id` in this task (G02 / WS-FILMID remains separate).

---

## 5. Film Detail field matrix (summary)

| UI slot | Real today | AMC catalog | Indie | Proposed production | Next task | Slot |
|---------|------------|-------------|-------|---------------------|-----------|------|
| Title | Public | Yes | Yes | Keep | — | Active |
| Year | Null | Derive from `release_date_utc` | No | Activate only if enrichment artifact + terms | T-ENR-01 / T-ENR-11 | Suppress until then |
| Runtime | Public partial | Yes | Partial | Keep | — | Active |
| Rating | Null | `mpaa_rating` | No | AMC-only after terms | T-ENR-01 / T-ENR-11 | Suppress |
| Genres | Null | `genre` string | No | Normalize + AMC-only | T-ENR-01 / T-ENR-11 | Suppress |
| Director | Null | `directors_raw` | No | Display string only | T-ENR-01 | Suppress |
| Cast | Null | `starring_actors_raw` | No | Defer UI; no person search | later | Suppress |
| Synopsis | Null | 54/54 | No | AMC-only after terms | T-ENR-01 / T-ENR-12 | Suppress |
| Poster | Public | media + public | Partial | Keep public poster | — | Active |
| Backdrop/hero | Null | hero URLs | No | Defer (media rights) | later / WS-IMG | Suppress |
| Format badges | Showtimes tags | attribute_codes (capability menu) | Partial | Keep showtime tags | — | Active |
| Opening date | — | release_date | No | Opening workstream | T-OPEN-* | Separate |
| Letterboxd / awards | Fixture QC | No | No | Remain suppressed | Stage 5 | Suppress |
| Theater count / Best Way / ticket URL | Schedule evidence | — | — | Keep | — | Active |
| Distance | Null | No | No | Suppress | WS-TRAV | Suppress |

Principle preserved: **remove fake production values, not designed slots.**

---

## 6. Search / filter implications

| Capability | Safe now? | Prerequisite |
|------------|-----------|--------------|
| Genre display on AMC rows | Not until public enrichment | Terms + emit + suppress nulls for non-AMC |
| Genre filter / Schedule color-by-genre | **No** | Coverage gate across enabled sources (not AMC-only) |
| Rating display | AMC-only after terms | Same |
| Runtime filter | Partially (public runtime) | Already possible without AMC catalog |
| Release-year display | AMC-only after terms | Re-release suppression rules |
| Director/cast search | **No** | D12 / person index deferred; raw strings ≠ search index |
| Synopsis keyword search | Only after public synopsis emit | Honesty: do not promise people/collections |

`T-SEARCH-01` honesty constraints remain: no person promise.

---

## 7. Source-asymmetry recommendation

Approved D04: partial-by-source OK; hide unsupported.

| Approach | Verdict |
|----------|---------|
| Per-field suppress when null | **Required** (already FD pattern) |
| AMC-rich / indie-thin Film Detail | **Acceptable** after terms + emit |
| Source badges | Optional later; not required to activate |
| Global hide until all sources match | **Reject** for synopsis/year/rating/director (blocks G01 forever) |
| Global hide for genre **coloring / ranking** | **Keep** until multi-source coverage adequate (avoid distorting Search/Schedule) |

Do not let AMC-only enrichment change opportunity ranking.

---

## 8. Republish terms gate (roadmap deliverable)

### Gate status: **UNCLEARED**

| Evidence | What it implies | What it does **not** do |
|----------|-----------------|-------------------------|
| AMC Developer Portal vendor request page: catalog APIs exist “to display AMC showtimes and associated movie data” | Partner display is an intended API use case | Grant rights to **redistribute** full catalog JSON on third-party static hosting |
| AMC consumer Terms (website): limited personal license; no reproduce/exploit of AMC Content | Website scraping/republish of site content is restricted | Define API vendor contractual rights |
| Repo docs (`amc-source-catalog.md`): catalog **not public**, not Pages, not Cockpit SPA | Current engineering policy matches uncleared gate | Replace legal review |
| No vendor agreement text in repository | Engineers cannot self-clear Ext=Y | — |

### Cleared only when PO/legal confirms (written)

At minimum answer:

1. May Reel Seattle **copy** synopsis, cast, directors, MPAA, genre, release dates into **public static JSON** on GitHub Pages?
2. May it **hotlink** AMC CDN poster/hero/trailer URLs from the public site?
3. Required attribution / branding / geographic limits?
4. Does the key allow non-transactional discovery apps (no ecommerce APIs)?

Until then: **do not** promote `amc_movie_products` (or subsets) into `public/data/`.

### Skip-AMC path (roadmap alternative for `T-ENR-01`)

Proceed without AMC republish: keep FD suppressions; optionally scaffold empty enrichment artifact schema; treat external provider as a **later** research track (still no vendor pick here).

---

## 9. Risks

- Re-release / anniversary `release_date_utc` misread as original year.
- Special presentations sharing titles with conflicting runtime/rating.
- Synopsis/media republish without clearance (legal + brand).
- Treating `attribute_codes` as spoken language (they are capability menus).
- Client fetching internal catalog paths (must never ship).
- Activating genre coloring with AMC-only coverage (Search/Schedule distortion).

---

## 10. Recommendation (narrow)

### Smallest high-confidence slice (only if terms cleared)

**Text-first AMC-only enrichment artifact** (new public JSON, not bloating showtimes):

1. `synopsis`
2. `mpaa_rating` (normalize display)
3. `release_year` derived from `release_date_utc` with suppress for `anniversary_or_rerelease` / other special categories as needed
4. `genres` from single `genre` string → one-element array
5. `director` from `directors_raw` when nonempty

**Defer:** cast UI, person search, hero/trailer URLs, IMDb/TMDB, Letterboxd, awards, genre coloring, distributor.

### Producer / artifact changes (`T-ENR-01`)

- New generated public enrichment file (schema + emitter) joined on `source_film_id` / `showtime_film_key`.
- Coverage validation: joined AMC current-window thresholds (e.g. synopsis ≥95%, mpaa ≥90% of joined) or skip emit for that film.
- Keep showtimes thin.

### Frontend consumers to activate later

- Film Detail hero meta + synopsis (slots already exist).
- Search expanded meta **display only** (no new promises).
- Not: ranking, genre color modes, person search.

### Coverage / validation gate

- Re-run `scripts/audit_amc_enrichment.py` in CI or pre-publish.
- Leak tests: non-AMC films must keep null enrichment; QC fixtures must not seed production.

### Fields that stay suppressed regardless

Letterboxd, awards, distance, backdrop (until media rights), cast/director **search**, fixture thematic tags.

### AMC-only initially?

**Yes**, if terms cleared. Otherwise **skip-AMC** and leave slots suppressed.

### Follow-on task

**`T-ENR-01`** — Enrichment artifact v0 (depends on this gate **or** explicit skip-AMC decision).

---

## 11. What this task did / did not do

**Did:** research memo, coverage audit script + committed JSON, roadmap/doc reconciliation.  
**Did not:** activate FD enrichment, scrape Letterboxd/IMDb, call TMDB, pick a vendor, create `film_id`, redesign UI, modify stores/planner/calendar, publish catalog under `public/`.
