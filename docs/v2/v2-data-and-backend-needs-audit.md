# Reel Seattle v2 — Data and Backend Needs Audit (Stage 2)

**Status:** Stage 2 audit — validation pass complete (expanded inventory, subsystems, roadmap reconciliation, quantitative snapshots)  
**Date:** 2026-07-24 (validation pass)  
**Authority:** Stage 2 only — requirements inventory; not an implementation roadmap; **not** Stage 3  
**Mockup source of truth:** `Canonical Mockup Images/`  
**Related:** [data-foundation-roadmap.md](../data-foundation-roadmap.md) (§14 reconciliation) · [v2-stage-3-product-decisions.md](./v2-stage-3-product-decisions.md) (D01–D17 **approved**) · [v2-front-back-integration-roadmap.md](./v2-front-back-integration-roadmap.md) (Stage 3) · [development-operating-model.md](../development-operating-model.md) · [docs/v2/](./README.md) · [17-first-implementation-slice.md](./17-first-implementation-slice.md)

This document inventories every data and backend capability implied by the approved v2 mockups, maps each need to repository evidence, and classifies gaps. It does **not** implement backends, replace fixtures, simplify designs, or change frontend code. Architecture and provider choices are listed as **alternatives** unless already settled by repository or product decision.

---

## 0. Validation-pass compliance checklist (vs original Stage 2 prompt)

| Original requirement | Status after first pass | Status after this validation pass |
|----------------------|-------------------------|-----------------------------------|
| Mockup inventory (every image) | Fully completed | Fully completed |
| Group by product area; note contradictions | Fully completed | Fully completed |
| Repository review (docs, schemas, pipeline, fixtures, planner, search, enrichment) | Partially completed (strong, some depth missing) | Expanded via subsystems + quantitative appendix |
| Field-level inventory with full methodology columns | Intentionally abbreviated | Expanded (§6) for required domains |
| Page-by-page requirements matrix | Fully completed (compact rows) | Fully completed (retained §4) |
| Cross-cutting capability matrix | Fully completed | Fully completed (retained §5) |
| Gap register with deps / Stage 5 / PO | Partially completed (weak prereq links) | Expanded (§7) |
| Difficulty summary A–F | Fully completed | Fully completed + refreshed (§8) |
| Product decisions list | Fully completed | Fully completed (§9) |
| Source feasibility assessment | Partially completed (some policy/cost stated as fact) | Relabeled evidence classes (§10, §15) |
| Static vs dynamic architecture | Partially completed (over-prescriptive recommendations) | Rewritten as alternatives (§11) |
| Mockup-only / fictional warnings | Fully completed | Fully completed (retained §12) |
| Stage 3 preparation workstreams | Fully completed | Fully completed (retained §13) |
| Roadmap reconciliation (explicit) | Missing as dedicated section | Added (§14) |
| Dedicated planner / schedule / search / evidence / theater curation / calendar-notify analyses | Missing or compressed | Added (§16) |
| Dynamic-copy appendix | Missing | Added (§17) |
| Quantitative coverage snapshots | Missing | Added (§18) |
| Deliverables compliance appendix | Missing | Added (§19) |
| No implementation | Honored | Honored |

**Assumptions previously presented too strongly (now relabeled):** TMDB as default enrichment; routing-provider cost; Letterboxd “Stage 5 remove”; localStorage vs accounts as decided architecture; “likely Stage 5” list treated as cuts rather than investigation targets.

---


## 1. Executive summary

The approved v2 UI is **partially supportable** from current production data. Showtimes, theater registry identity, format tags (incomplete), newly-added announcements, pipeline health, and a same-theater planner engine form a strong foundation for schedule-centric surfaces. Most of the mockup’s **rich film identity**, **theater visit metadata**, **cultural signals**, **persistent personal state**, **multi-theater travel planning**, **calendar sync**, **notifications**, and **editorial collections** are missing from public artifacts or exist only as fixtures / localStorage prototypes.

### Supportability (qualitative)

| Layer | Verdict |
|-------|---------|
| Schedule facts (date/time/theater/title/runtime/poster within ~14-day window) | Strong — production-ready in `public/data/showtimes_current.json` |
| Discovery shelves that are schedule-derived (Top Opportunity mechanical ranking, browse by showtimes) | Partial — real selectors exist; mockup implies richer ranking/copy |
| Opening This Week as theatrical openings | Weak — no approved opening-date classifier; provisional `newly_added` only |
| Leaving Soon | Weak — review-only AMC heuristic artifact; not Pages-shipped |
| Film Detail enrichment (year, rating, synopsis, director, genres, backdrop, Letterboxd) | Missing from public data — mockup is fixture-only today |
| Theater list/detail (address, screens, amenities, pricing, hours, imagery) | Missing — registry has id/name/source/city/neighborhood only |
| Persistent user state (Save, Seen, Not interested, favorites, plans, profile, memberships) | Largely missing — Seen/Not interested/recent searches are device-local v2 only; no Save; no accounts |
| Planner Build a Plan / multi-theater results with walking distance | Partial algorithm (v1 same-theater) + large capability gap for travel, A-List, sold-out, budget |
| My Schedule / calendar sync / insights | Entirely missing as product systems |
| Search (title/theater/format) | Partial client-side over HomeData; person search unsupported despite mockup placeholder copy |

### Strongest existing foundations

1. Multi-source showtime pipeline (AMC, SIFF, Beacon, NWFF, Central) → `showtimes_current.json` + history CSV  
2. Theater registry + pipeline health (`theaters.json`, `pipeline_report.json`)  
3. Newly-added announcements + Leaving Soon research artifact / design docs  
4. Format slug normalization + parent/variant film grouping  
5. Legacy Planner engine (`src/utils/plannerEngine.js`) — same-theater chains  
6. Internal AMC source catalog (synopsis, cast, directors, MPAA, release dates) — **not public**  
7. v2 Home/Explore adapters already consuming allowlisted public JSON with honesty rules  

### Largest missing systems

1. Canonical film identity + public enrichment (provider alternatives in §10; not selected here)  
2. Theater model expansion (address, coords, screens, amenities, hours, pricing, imagery)  
3. Durable user persistence (Save, Seen, Not interested, favorites, scheduled plans, settings) — local-only vs accounts is a product decision  
4. Multi-theater travel (curated matrix and/or routing alternatives)  
5. Opening-week classifier distinct from newly-added  
6. Ship-quality Leaving Soon model + Pages exposure  
7. Presentation-attribute taxonomy in public emit (attrs currently stripped)  
8. Ticket/purchase URL + source showtime ID emission (schema fields present; emit hardcodes null; logs capture more)  
9. Calendar modes, notifications, memberships, collections/editorial (separated in §16.F)  

### Riskiest mockup assumptions

- Letterboxd Top 250 / cultural ranks as Why-See-It evidence (licensing + scraping risk)  
- Precise walking miles between theaters without a routing provider or curated matrix  
- Theater amenities/pricing/hours/seat counts presented as facts without curated ownership  
- “Opening This Week” count and sort by opening date without Seattle opening-date data  
- Person search (“Kurosawa”) matching people, not only titles containing the string  
- Ongoing bidirectional calendar sync (About My Schedule claims one-way updates)  
- A-List weekly use counts and membership renewal without authenticated AMC integration  
- Grand Illusion / Paramount / Egyptian as venues not currently in registry  

### Mapping vs new data vs persistence vs algorithms

| Work class | Approximate share of mockup needs |
|------------|-----------------------------------|
| Frontend mapping of existing public fields | Moderate (Home/Explore already doing much of this) |
| Emit / normalize fields already captured in logs | Moderate–large (`ticket_url`, `source_showtime_id`, attributes, AMC catalog → public) |
| New external enrichment | Large (film identity, images, ratings) |
| Manual curated theater/content JSON | Large (theater detail pages) |
| User persistence / auth | Large (Profile, Schedule, Save) |
| New algorithms / ranking / travel | Large (Top Opportunity personalization, Best Way, Planner multi-theater, Leaving Soon ship) |
| Investigate before any Stage 5 cut | Letterboxd/cultural ranks; live sold-out; bidirectional calendar; A-List live counters; person search without cast data; venues not ingested — Stage 5 risk ≠ skip investigation |

---

## 2. Mockup inventory

All images under `Canonical Mockup Images/` were listed and inspected at Stage 2 time (17 files). **Maintenance note (2026-08):** separate Home overlay PNG retired; Results film-click mockup renamed to `Build a Plan Results Page Film Interaction.png`; expanded Build-a-Plan / manage / results interaction states added as current canonical references.

| # | File | Product area | Page / state | Canonical? | Notes / contradictions |
|---|------|--------------|--------------|------------|------------------------|
| 1 | `Home Landing Page.png` | Home | Landing — Top Opportunity, Opening, Leaving, Planner CTA, Explore More | **Canonical for regions** | Bottom nav shows **5 tabs** (Home, Movies, Theaters, Planner, Me) — **obsolete**; product decision is Home · Explore · Planner · Profile. Paramount Theatre is not in current registry. Runtime line “21h 14m” in one OCR pass is idealized/erroneous sample text — treat as runtime+genre capability, not literal. |
| 2 | *(retired)* `Film Detail Overlay Example on Home Screen.png` | Home | Inline quick-detail expansion on Opening card | **Retired** — production Home/`InlineQuickDetail` is SoT | Kept as historical Stage 2 row only. |
| 3 | `Opening This Week Page.png` | Home / Explore collection | Full Opening This Week list + expand | **Canonical** for collection | Five-tab nav including Theaters — obsolete. Sort by opening date; Filters; Why See It; Also playing at; Save/Not interested. |
| 4 | `Explore Home Page.png` | Explore | Landing | **Canonical** for Explore regions | Bottom nav shows **Saved** tab — obsolete (Saved is not a primary tab). Search placeholder includes “person”. Film Activity counts; Suggested Starts; Quick Start IMAX/35mm. |
| 5 | `Search Results Page.png` | Explore | Search results for “Kurosawa” | **Canonical** | Four-tab nav. Person-as-query implied; results include year/genre/synopsis/director/language; fictional “Kurosawa Cinema” theater. |
| 6 | `Film Detail Page.png` | Film Detail | Full page (2001â€¦) | **Canonical** | Landscape hero; Why See It (Letterboxd, scarcity, exclusivity); Best Way + distance; Today’s showtimes with A-List badge; Save/Seen/Not interested/Add to planner. |
| 7 | `Theaters Page.png` | Theaters | List with expand | **Canonical** for Theater list | Includes Grand Illusion (not in registry). Address, screens, format capabilities, description, Now Showing, Favorite. |
| 8 | `Theater Detail Page.png` | Theaters | Beacon detail | **Canonical** | Amenities, pricing, hours, screen tabs, reserved seating, Website/Directions, favorite. |
| 9 | `Planner Landing Page.png` | Planner | Landing | **Canonical** | Upcoming plans, My Schedule + Build a Plan CTAs, Recent Activity event log. |
| 10 | `Build a Plan Page.png` | Planner | Configuration | **Canonical** | Presets, multi-day, must/would/not, theater prefs, location, fine tuning, A-List/indie prefs. |
| 11 | `Build a Plan Results Page.png` | Planner | Results list | **Canonical** | Ranked plans, breaks, walk miles, sorts including “Leaves soonest”, refine panel; 5-tab nav obsolete. |
| 12 | `Build a Plan Results Page Film Interaction.png` | Planner | Film adjust sheet on results | **Canonical** (renamed from Film Click Interaction) | Must/Would/Neutral/Not interested + Replace + Film details. |
| 13 | `My Schedule Main Page.png` | My Schedule | Week view | **Canonical** | Timeline, multi-movie plan grouping, breaks, Next Up, July at a glance, color-coded events. |
| 14 | `My Schedule Main Page Month Selected.png` | My Schedule | Month view | **Canonical** | Heatmap dots, insights stats, busiest days, upcoming highlights. |
| 15 | `My Schedule Main Page Settings Interaction.png` | My Schedule | Schedule Settings sheet | **Canonical** | Display options, calendar sync Off, color coding modes, clear all. |
| 16 | `About My Schedule Page.png` | My Schedule | About / FAQ | **Canonical** (mostly static copy) | Defines Saved â‰  Scheduled; one-way calendar sync policy; ticket disclaimer. |
| 17 | `Profile Page.png` | Profile | Profile hub | **Canonical** | Identity, activity counts, Up Next, A-List membership, favorite theaters, settings menu. |

### Obsolete / contradictory chrome (not data requirements)

- Five-item bottom nav (Movies / Theaters / Me / Saved) on images 1, 3, 4, 11 → ignore; use Home · Explore · Planner · Profile.  
- Theaters is reached via Explore / Home / contextual links, not a permanent tab.  
- Idealized film names, dates, rankings, and venues are examples of **capabilities**, not production literals.

### Duplicate / alternate coverage

- Home landing (#1) vs overlay (#2): same page, different interaction state — both required.  
- Planner results (#11) vs film-click (#12): same page, sheet state — both required.  
- My Schedule week (#13) / month (#14) / settings (#15) / about (#16): four states of one product area.

---

## 3. Current system inventory

### 3.1 Public artifacts (`public/data/`)

| Artifact | Schema | Role | Shipped to Pages? |
|----------|--------|------|-------------------|
| `showtimes_current.json` | `schema/showtimes_current/v1.0.0.json` | 14-day client showtimes | Yes |
| `theaters.json` | `schema/theaters/v1.1.0.json` | Deployed registry copy | Yes |
| `newly_added_current.json` | `schema/newly_added_current/v1.0.0.json` | Recently announced filmÃ—theater | Yes |
| `pipeline_report.json` | `schema/pipeline_report/v1.0.0.json` | Source health | Yes |
| `leaving_soon_current.json` | `schema/leaving_soon_current/v1.0.0.json` | AMC leaving-soon heuristic | **No** (review-only; v2 must 404) |
| `movies_announcements.csv` / `newly_announced.csv` | — | Pipeline tracking | No |

**`showtimes_current` key fields**

- Top: `schema_version`, `generated_at`, `timezone` (`America/Los_Angeles`), `window`, `sources_included`, `sources`, `stats`, `theaters`, `films`, `showtimes`  
- Film: `showtime_film_key`, `title`, `runtime_min`, `poster_url`, `parent_film_key`, `parent_display_title`, `screening_variant_type`, `is_special_screening`, `source_film_id`  
- Showtime: `id`, `date`, `time`, `time_display`, `theater_id`, `showtime_film_key`, `film_title`, `runtime_min`, `poster_url`, `status` (`active`|`sold_out`), `format_tags`, `ticket_url`, `source`, `source_showtime_id`, `source_film_id`, `source_title`, parent/variant fields, `attributes`, `first_seen_at`, `last_seen_at`

**Emit gaps (evidence: `reel_seattle/emit/current.py`):** `ticket_url` always `null`; `source_showtime_id` always `null`; `attributes` always `{}`. Richer values exist in daily logs / history for some sources.

### 3.2 Theater registry

- Canonical: `data/theaters.json` → synced `public/data/theaters.json`  
- Fields: `id`, `name`, `aliases`, `source`, `source_external_id`, `enabled`, `type`, `city?`, `neighborhood?`, `timezone?`  
- No address, coordinates, screens, amenities, hours, pricing, website, imagery  
- ~15 theaters; AMC `source_external_id` often null; Grand Illusion / Paramount not present  

### 3.3 Ingestion / history

- Adapters: `reel_seattle/adapters/{amc,siff,beacon,nwff,central_cinema}.py`  
- Daily logs: `data/daily_logs/YYYY-MM-DD_*.json`  
- History: `data/history/showtimes_history.csv` (~352k rows)  
- Normalize: titles, formats, runtime, times, theaters, year window  
- Parent/variant: `reel_seattle/analysis/film_identity.py`  

### 3.4 Internal enrichment (not public)

- AMC catalog: `data/source_catalog/amc_movie_products.json` — genre, mpaa_rating, starring_actors_raw, directors_raw, synopsis, release_date_utc, media URLs, attribute_codes  
- AMC IMDb audit: sampled Showtimes path **0** usable IMDb IDs (`docs/amc-imdb-coverage-audit.md`)  
- TMDB / Letterboxd / Wikidata production clients: **absent**  

### 3.5 Derived artifacts

| Artifact | Status |
|----------|--------|
| Newly added | Production + Pages |
| Leaving soon | Review-only heuristic `visible_dates_le_1`; design in `docs/leaving-soon-model-design.md` |
| Opening This Week classifier | **Absent** (roadmap: do not equate to newly_added) |

### 3.6 User state

| State | Exists? | Where |
|-------|---------|-------|
| Recent searches | Yes (v2) | `localStorage` `reel-seattle.v2.recentSearches` |
| Seen films | Yes (v2) | `localStorage` `reel-seattle.v2.seenFilms` (versioned v1; legacy key array migrates) |
| Not interested | Yes (v2) | `localStorage` `reel-seattle.v2.dismissedFilms` (versioned v1; legacy key array migrates) |
| Save / favorites | Partial (v2) | Saved films + Favorite Theaters versioned local stores; Profile sync deferred |
| Scheduled plans / My Schedule | **No** | — |
| Profile / auth / memberships | **No** | — |
| v1 Planner persistence | URL params | `src/utils/plannerUrlState.js` |

### 3.7 Planner

- Engine: `src/utils/plannerEngine.js` — **same-theater** chains; gaps; sorts; no travel/walk miles  
- Docs: `docs/unified-planner-design.md`, `docs/planner-ux-roadmap.md`  
- v2 Planner destination: placeholder only  

### 3.8 Search

- v1: title substring  
- v2: `v2/explore/exploreCatalog.js`, `searchResultsModel.js` — title/sourceTitle/parent + theater name/neighborhood/city + format tags; `personSearchSupported: false`  

### 3.9 v2 fixtures (idealized only)

- `v2/fixtures/filmDetailMockupFixture.js` — default Film Detail UI  
- `v2/fixtures/homeVisualFixtures.js` — visual-test shelves (not Home defaults)  
- `v2/fixtures/filmDetailVisualFixtures.js` — QC mode  

### 3.10 Validation / docs

- Validators: `scripts/validate_public_data_artifacts.py`, `validate_history_csv.py`, schema suite  
- Roadmaps: `docs/data-foundation-roadmap.md`, `docs/product-roadmap.md`, v2 specs under `docs/v2/specs/`  

---

## 4. Page-by-page requirements matrix

Availability codes: **A** available · **M** needs mapping · **P** partial · **F** fixture-only · **U** user persistence · **N** new data/backend · **D** derived/algorithm · **X** product decision · **S5** Stage 5 risk

### 4.1 Home Landing (`Home Landing Page.png`)

| Section | Required field / behavior | Status | Current source | Missing work | Diff. | Caveats |
|---------|---------------------------|--------|----------------|--------------|-------|---------|
| Brand / chrome | Logo, profile affordance | M | Static / Profile stub | Profile destination | B | Profile icon implies Profile exists |
| Editorial intro | Headline + subcopy | A | Static copy | — | A | Not data |
| Top Opportunity | Carousel of ranked opportunities | P/D | `selectTopOpportunities` + HomeData | Personalization, landscape art, richer reason copy | E | Mechanical reasons only today |
| Top Opportunity | Film image (landscape preferred) | P | `poster_url` only | Backdrop ingestion | D | Mockup uses landscape |
| Top Opportunity | Theater + showtime + runtime + genre | P | theater, time, runtime; **no genre** | Genre enrichment | C–D | |
| Top Opportunity | Opportunity reason line | P | Reason codes → templates | Editorial templates / richer signals | C | |
| Top Opportunity | Featured badge / count “1 of N” | D | Candidate list length | Eligibility rules | C | |
| Opening This Week | Shelf of opening films | P | Provisional `newly_added` | True opening-date classifier | D/E | Semantic mismatch |
| Opening This Week | Genre + opening date labels | N | — | Genre + Seattle opening date | D | |
| Leaving Soon | Shelf + “Ends {date}” | P | Review artifact only | Model quality + Pages gate | E/F | AMC-only today |
| Build a Movie Day CTA | Navigate to Planner | M | Destination stub | Planner surfaces | B | |
| Explore More | Movies/Theaters/Formats/Collections/Search | P | Static rows → Explore | Destination data per row | C–E | Collections editorial absent |

### 4.2 Home inline quick detail (`Film Detail Overlayâ€¦`)

| Section | Required field / behavior | Status | Source | Missing | Diff. | Caveats |
|---------|---------------------------|--------|--------|---------|-------|---------|
| Expand card | Poster, title | A | HomeData | — | A | |
| Meta | Genre • rating • year • runtime | P | runtime only | Enrichment | D | |
| Synopsis | Short synopsis | N/F | Fixture only in FD | Public synopsis | D | AMC catalog has internal synopsis |
| Next showtime | Theater • time • format | P | opportunities + format_tags | Ticket URL emit | B | |
| Chips | “New this week”, “Also playing at N” | D | newly_added + theaterCount | Opening semantics | C | |
| Actions | Save / Not interested / More details | U/P | Not interested local; Save absent | Save model | D | |

### 4.3 Opening This Week page

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Count | “N films openingâ€¦” | D/N | — | Opening classifier | E | |
| Sort | Opening date | N | — | Opening date field | D | |
| Filters | Unspecified filter sheet | X | — | Product filter set | C | |
| Card | Year, runtime, genres, short synopsis | N | — | Enrichment | D | |
| Primary showtime + format | Date, theater, format badge | P | showtimes | — | B | |
| Why See It | Signal text | D/N | Partial mechanical | Signal schema | E | |
| Also playing at | Alternate venues | D | HomeData | — | B | |
| Save / Not interested | Persistence | U | Partial local | Save + durable | D | |

### 4.4 Explore landing

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Search | Title, person, keyword | P | Title/theater only | Person index | E/F | Placeholder overclaims |
| Quick Start | All Movies, Today, Week, Theaters, IMAX, 35mm | P | Date/format filters | 35mm often empty | C | Honest unavailable |
| Browse By | Movies, Theaters, Formats, Collections, Coming Soon, Special Events | P | Scaffolds | Coming Soon / Events / Collections artifacts | D–E | |
| Suggested Starts | Everything / Today / Week / Weekend + imagery | P/D | Date windows | Card imagery curation | C | Week = rolling 7d (product Q) |
| Film Activity | Seen count, last seen (+ theater/date), Not interested count + recent | U/P | Keys only in localStorage | Dates, theaters, Save absence | D | Mockup shows rich last-seen |
| Recent searches | List + clear all | A | localStorage | Cross-device sync | A/D | |

### 4.5 Search Results

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Result count + facets | All/Movies/Theaters/Formats/time chips | P | searchResultsModel | — | B | |
| Filters sheet | Theater, format, etc. | P | Partial | Genre/runtime/a11y | C | |
| Film row | Year, genres, synopsis | N | null in model | Enrichment | D | |
| Expanded | Rating, director, language+subs | N | — | Enrichment + language attrs | D | |
| Next showtime + also playing | Derived | D | HomeData | — | B | |
| Tags | Playing in 35mm, Classic, Newly added | P/D | formats + newly_added; Classic absent | Classic classifier | C | |
| Theater results | Name, address, thumbnail | P | name only | Address + imagery | D | |
| Format results | Format entity | P | format_tags aggregation | Taxonomy labels/icons | C | |
| Save / Not interested | Actions | U/P | Not interested yes; Save no | Save | D | |
| Person match | Director/cast search | N | unsupported | Cast/crew index | E/F | |

### 4.6 Film Detail

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Hero backdrop + poster | Landscape + portrait | P/F | poster; fixture backdrop | Backdrop URLs + licensing | D | |
| Meta | Year, runtime, rating, genres, director | N/F | runtime only in real model | Enrichment | D | |
| Badges | Format, Classic, ranking badge | P/F | format partial | Classic + ranks | D/F | Letterboxd S5 risk |
| Actions | Save, Seen, Not interested, Add to planner | U/P | Seen/NI local; Save no; planner seed stub | Save + durable + planner | D | |
| Share | Share film/opportunity | N | — | Share payload | C | |
| Why See It Now | Multi-signal cards + See all | D/N/F | Mechanical subset in composer | Evidence schema + sources | E | |
| Synopsis + thematic tags | Long text + tags | N/F | — | Synopsis; tags = editorial/derived | D/X | Avoid inventing themes |
| Best Way | Ranked opportunity + distance | D/N | Format/venue heuristics | Distance + ranking weights | E | |
| Today’s showtimes | Grouped by theater, format, A-List | P | showtimes | A-List eligibility data | C–D | |
| Ticket actions | External ticket links | P | ticket_url null in emit | Emit ticket URLs | B | |

### 4.7 Theaters list

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Count + filters | Active theaters | P | registry enabled | Filter taxonomy | B | |
| Card | Thumbnail, address, screens, capabilities | N | name/city/neighborhood | Curated theater fields | D | |
| Description | Short blurb | N | — | Manual curation | D | |
| Now Showing | Film posters + dates | D | showtimes join | — | B | |
| Favorite | Per-user favorite | U | — | Favorites store | D | |
| Coverage | Grand Illusion etc. | N | not in registry | New sources / curation | D/X | |

### 4.8 Theater Detail

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Hero image | Exterior/interior | N | — | Image rights + storage | D | |
| Address + Website + Directions | Links | N | — | URL + coords | D | |
| Specs | Screens, capabilities, seats | N | — | Curated | D | |
| Amenities | Concessions, beer, a11y, etc. | N | — | Curated taxonomy | D | |
| Pricing | GA/senior/student/matinee | N | — | Curated; changes | D | |
| Hours | Weekly + calendar | N | — | Curated + exceptions | D | |
| Now Showing / Today / 7-day | Program | A/D | showtimes window | Beyond window honesty | B | |
| Screen tabs | Screen 1/2 + reserved seating | N | auditorium in AMC logs only | Emit + entity model | E | |
| Favorite / Share | User + share | U/N | — | Persistence | D | |

### 4.9 Planner landing

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Upcoming plans | Scheduled showtime plans | U | — | Plan store | D | |
| My Schedule / Build a Plan | Navigation | M | stubs | Surfaces | B | |
| Recent Activity | Event log | U/D | — | Activity events or derive | D/X | |

### 4.10 Build a Plan configuration

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Presets | After Work, Marathon, Premium, Last Chance, Surprise | D | — | Preset → criteria mapping | C | |
| When | Multi-date, windows, Flexible | P | v1 URL engine partial | Multi-day persistence | C | |
| What | Must / Would / Not + constraints | P | v1 include/prefer/exclude | Per-film format/theater/showtime | C–E | |
| Where | Any / AMC+A-List / indie / custom + origin | P | theater filters | Location + A-List | D–E | |
| Fine tuning | Gaps, walk, premium, budget, a11y, events, repeats, sold-out | P | gaps/count/sold-out partial | Walk, budget, a11y | E | |
| Summary validation | Impossible combos | D | partial | Better validation UX | C | |

### 4.11 Build a Plan results + film sheet

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Ranked multi-theater plans | Sequences across venues | P | same-theater only | Multi-theater + travel | E | |
| Breaks + total duration + finish | Derived | D | engine gaps | End time from runtime | C | |
| Walking distance miles | Travel | N | — | Routing or matrix | E/F | |
| Sorts | Best match, gaps, runtime, finish, leaves soonest | P | subset in v1 | Best match + leaving | E | |
| Favorite result / share | Persistence | U | — | Store | D | |
| Film sheet prefs | Must/Would/Neutral/NI + Replace | D/U | — | Mutation scope rules | E | |
| Subtitled badge | Language presentation | P | attrs stripped | Emit presentation attrs | C | |

### 4.12 My Schedule (week / month / settings / about)

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Scheduled plans persistence | Showtime-level plans | U | — | Plan schema + store | D | |
| Week timeline + now indicator | UI + clock | D | client time | — | C | |
| Multi-movie grouping + breaks | Plan structure | U/D | — | Plan model | D | |
| Open-time search | Find films in gap | D | showtimes | Query UX | C | |
| Month heatmap + insights | Aggregates | D/U | from plans | Definitions | C–E | |
| Next Up + ticket link | Next plan + ticket_url | U/P | ticket null | Emit + store | B/D | |
| Color coding modes | Opportunity/theater/genre | D/U/N | genre missing | Taxonomy | C | |
| Calendar sync | One-way sync claimed | N | — | OAuth + sync engine | E/F | |
| Settings + clear all | Preferences | U | — | Settings store | D | |
| About / FAQ | Mostly static | A | copy | — | A | Product policy text |

### 4.13 Profile

| Section | Required | Status | Source | Missing | Diff. | Caveats |
|---------|----------|--------|--------|---------|-------|---------|
| Name, location, avatar | Profile identity | U | — | Auth or local profile | D/X | |
| Counts | Seen / NI / Saved / Plans | U | partial local | Save + plans + dates | D | |
| Up Next | Next multi-film plan | U | — | Plan store | D | |
| Membership A-List | Tier, renews, weekly use | N/U | — | Manual entry vs OAuth | E/F | |
| Favorite theaters | List + imagery | U/N | — | Favorites + images | D | |
| Settings menu | Notifications, a11y, appearance, privacy, account, connected, about | U/N | — | Full settings system | E | |

---

## 5. Cross-cutting capability matrix

| Capability ID | Capability | Dependent pages |
|---------------|------------|-----------------|
| CAP-FILM-ID | Canonical film identity + external IDs | Film Detail, Search, Collections, Save/Seen |
| CAP-ENRICH | Year, rating, genres, director, cast, synopsis, backdrop | Home expand, Opening, Search, Film Detail, Theater now-showing cards |
| CAP-SHOW | Showtimes window + status + formats + tickets | Almost all |
| CAP-PRESATTR | Presentation attributes (format/a11y/language/event) | Film Detail, Search, Planner, Schedule colors |
| CAP-OPEN | Seattle opening / Opening This Week classifier | Home, Opening page, signals |
| CAP-LEAVE | Leaving Soon ship-quality | Home, Why See It, Planner sort, alerts |
| CAP-THEATER-META | Address, geo, amenities, hours, pricing, imagery, screens | Theaters, Theater Detail, Search theater hits, Directions |
| CAP-FORMAT-TAX | Canonical format taxonomy + venue capabilities | Explore Quick Start, Formats browse, badges, Best Way |
| CAP-RANK-OPP | Opportunity ranking / Best Way / Top Opportunity | Home, Film Detail |
| CAP-SEARCH | Multi-entity search index | Explore, Search, Planner add-film |
| CAP-USER-FILM | Save / Seen / Not interested (+ timestamps) | Home, Explore, Search, FD, Profile |
| CAP-USER-THEATER | Favorite theaters | Theaters, Profile, Planner prefs |
| CAP-PLAN-STORE | Scheduled plans + multi-film grouping | Planner landing, My Schedule, Profile Up Next |
| CAP-PLAN-ENGINE | Multi-theater planner + travel | Build a Plan results |
| CAP-TRAVEL | Distances / walk / transit / drive | Best Way, Planner results, Theater directions |
| CAP-MEMBER | Memberships / A-List | Film Detail badges, Planner, Profile |
| CAP-CAL | Calendar export / sync | Schedule settings, About |
| CAP-NOTIFY | Alerts infrastructure | Profile settings |
| CAP-COLL | Collections / Coming Soon / Special Events | Explore Browse By |
| CAP-ACTIVITY | Activity event log | Planner Recent Activity |
| CAP-INSIGHT | Schedule aggregates / streaks | Month view |
| CAP-AUTH | Accounts + sync + privacy | Profile, cross-device |

---

## 6. Field-level inventory (expanded)

**Methodology:** Each requirement records the 21 audit fields below. Shared fields are defined once; consumers list every screen. Availability uses the Stage 2 classification vocabulary. Evidence labels appear in §15.

**Column key:** Avail · Repo source · Path · Coverage · Complete · Reliability · Cadence · History · Persist · Kind · Future · Transform · Schema · Deps · Diff · Risks/next

**Kinds:** source-provided · normalized · derived · predicted · user-entered · user state · editorial · fixture-only

### 6.1 Canonical film identity

#### F-001 — `showtime_film_key`
| # | Field | Value |
|---|-------|-------|
| 1–2 | ID / consumers | F-001 · Home, Explore, Search, Film Detail, Planner, Schedule, Profile activity |
| 3–4 | UI / example | Internal film join key · `blue-hour` style slug |
| 5–6 | Category / Avail | Identity · **Available and production-ready** |
| 7–8 | Source / path | Title normalize · `showtimes_current.films[].showtime_film_key` (`reel_seattle/normalize/titles.py`) |
| 9–12 | Coverage / complete / reliability / cadence | All public films · High for schedule grain · High within title-normalization limits · Daily emit |
| 13–15 | History / persist / kind | History column `showtime_film_key` · No · normalized |
| 16–18 | Future / transform / schema | Retain as schedule key alongside future `film_id` · slugify title · none |
| 19–21 | Deps / Diff / next | — · **A** · Document collision cases (remakes, year-bearing titles) |

#### F-002 — Canonical `film_id`
| Field | Value |
|-------|-------|
| Consumers | Save/Seen sync, Search person→film, Collections, cross-source FD |
| UI | Stable identity behind variants |
| Avail | **Requires new backend capability** |
| Source/path | Roadmap Planned only — not in public artifacts (`docs/data-foundation-roadmap.md` film identity) |
| Coverage | None production |
| Kind | normalized (authored/matched) |
| Future alternatives | Authored registry; confidence match from AMC catalog + indie source IDs; external ID bridge (candidates in §10) — **no provider selected here** |
| Schema | New film entity store + provenance |
| Deps | G01 enrichment optional; source product catalogs |
| Diff | **E** |
| Risks | Silent merges forbidden (roadmap) · Next: match policy design |

#### F-003 — Display title
| Field | Value |
|-------|-------|
| Consumers | All film surfaces |
| Example | “Blue Hour”, “2001: A Space Odyssey” |
| Avail | **Available and production-ready** |
| Path | `films[].title` / `showtimes[].film_title` |
| Coverage | All rows |
| Kind | source-provided / normalized |
| Diff | **A** |

#### F-004 — Alternate / source / parent titles
| Field | Value |
|-------|-------|
| Consumers | Search ranking, variant grouping |
| Path | `source_title`, `parent_display_title`, `parent_film_key` |
| Avail | **Available but incomplete** (source_title not universal) |
| Kind | source-provided / derived |
| Diff | **B** |

#### F-005 — Source-specific film IDs
| Field | Value |
|-------|-------|
| Consumers | Matching, provenance |
| Path | `films[].source_film_id`; history `source_film_id` |
| Avail | **Available only for some sources** / historically sparse |
| History snapshot | See §18 (AMC ~10.5k rows with film id; indie sparse; total history 352,559 rows) |
| Kind | source-provided |
| Diff | **B** (use) / **E** (unify) |

#### F-006 — Seattle opening date / first theatrical opening
| Field | Value |
|-------|-------|
| Consumers | Opening This Week sort/count, Opening labels |
| Example | “Fri 5/18”, “18 films openingâ€¦” |
| Avail | **Requires new backend capability** / **Requires product decision** |
| Source | Not equal to `newly_added` `first_announced_date` or `first_seen_at` |
| Kind | derived (rules TBD) |
| Future | History-based first showtime heuristics; distributor dates; curated overrides |
| Diff | **E** · Gap G03 |

#### F-007 — First/last observed Seattle showtime
| Field | Value |
|-------|-------|
| Consumers | Leaving heuristics, lifecycle |
| Path | `showtimes[].first_seen_at` / `last_seen_at`; history |
| Avail | **Derivable from current data** |
| Kind | derived / source observation |
| Diff | **C** |

#### F-008 — Remakes, festival programs, shorts, mystery, non-film events
| Field | Value |
|-------|-------|
| Consumers | Search, identity, FD |
| Avail | **Available only partially** via titles + `is_special_screening` / variant types |
| Kind | derived + product classification |
| Diff | **D–E** · Requires product taxonomy |

### 6.2 Film enrichment

#### E-001 — Runtime
| Field | Value |
|-------|-------|
| Consumers | Home, Search, FD, Planner end times, Schedule insights |
| Example | “2h 29m” |
| Avail | **Available but incomplete** |
| Path | `films[].runtime_min` / showtime runtime |
| Coverage snapshot | §18: **81/96 films (84.4%)** on `showtimes_current` generated 2026-07-20 |
| Kind | normalized |
| Future | Fill from AMC catalog / external enrichment candidates |
| Diff | **B** |

#### E-002 — Release year
| Field | Value |
|-------|-------|
| Consumers | FD hero, Search rows, Opening cards |
| Example | “1968”, “2025” |
| Avail | **Available only in fixtures** publicly; AMC catalog has `release_date_utc` (internal) |
| Path | Fixture: `v2/fixtures/filmDetailMockupFixture.js`; Catalog: `data/source_catalog/amc_movie_products.json` |
| Coverage | Catalog §18: 54/54 products have `release_date_utc` (AMC only, internal) |
| Kind | source-provided (internal) / fixture-only (UI) |
| Future alternatives | Promote selective catalog fields; external metadata API; curated year |
| Diff | **D** |
| Evidence | Confirmed by repository for catalog; fixture-only for UI |

#### E-003 — MPAA / content rating
| Field | Value |
|-------|-------|
| Consumers | Inline expand, FD, Search expand |
| Example | “PG-13”, “G” |
| Avail | **Available only for some sources** (AMC catalog internal) |
| Path | `amc_movie_products[].mpaa_rating` — §18: 51/54 nonempty |
| Kind | source-provided |
| Diff | **D** |

#### E-004 — Genres
| Field | Value |
|-------|-------|
| Consumers | Home meta, Opening, Search, Schedule color-by-genre |
| Example | “Drama • Western” |
| Avail | Internal AMC `genre` (§18: 44/54); **not public** |
| Kind | source-provided |
| Diff | **D** |

#### E-005 — Director / cast / crew
| Field | Value |
|-------|-------|
| Consumers | FD (“Directed byâ€¦”), Search person, Collections |
| Example | “Stanley Kubrick”, query “Kurosawa” |
| Avail | Internal AMC `directors_raw` 40/54, `starring_actors_raw` 37/54; public **absent**; person search unsupported (`personSearchSupported: false`) |
| Kind | source-provided |
| Diff | **D** (emit/enrich) · **E/F** (person search quality) |
| Risks | Requires terms/licensing review for external people DBs |

#### E-006 — Synopsis (short/long)
| Field | Value |
|-------|-------|
| Consumers | Inline expand, Opening, Search, FD What It’s About |
| Avail | Fixture-only in UI; AMC catalog synopsis 54/54 internal |
| Kind | source-provided / fixture-only |
| Diff | **D** · Attribution/licensing for public republish = **Requires terms/licensing review** |

#### E-007 — Poster URL
| Field | Value |
|-------|-------|
| Consumers | Almost all film UIs |
| Avail | **Available but incomplete** · §18: 81/96 (84.4%) |
| Path | `films[].poster_url` |
| Kind | source-provided |
| Diff | **B** |

#### E-008 — Backdrop / landscape hero
| Field | Value |
|-------|-------|
| Consumers | Top Opportunity, FD hero |
| Avail | **Available only in fixtures** in v2 UI |
| Internal alt | AMC catalog `media.hero_desktop_url` / `hero_mobile_url` (present on sampled products) — **not public** |
| Kind | fixture-only / source-provided (internal) |
| Future alternatives | Catalog media promotion (AMC-only); external image API; soft-wash poster fallback (already in specs) |
| Diff | **D** |

#### E-009 — Thematic tags (“Mind-bending”)
| Field | Value |
|-------|-------|
| Consumers | FD What It’s About |
| Avail | **Available only in fixtures** |
| Kind | editorial / fixture-only |
| Diff | **F** without editorial ops · **Requires product decision** whether allowed |

#### E-010 — Classic / repertory badge
| Field | Value |
|-------|-------|
| Consumers | Search tags, FD badges |
| Avail | **Requires product decision** + derived rules |
| Kind | derived |
| Diff | **C** after definition |

#### E-011 — External ranking / Letterboxd / awards evidence
| Field | Value |
|-------|-------|
| Consumers | Why See It, FD badges |
| Example | “#13 on Letterboxd Top 250” |
| Avail | **Available only in fixtures** |
| Kind | fixture-only |
| Future | Official APIs only if licensed; otherwise omit signal type |
| Diff | **F** · **Requires terms/licensing review** + product decision · Stage 5 risk **after** investigation, not instead of it |

### 6.3 Showtimes and performance identity

#### S-001 — Internal performance id
| Field | Value |
|-------|-------|
| Consumers | Plans, Schedule, Opp scaffolds |
| Path | `showtimes[].id` |
| Avail | **Available and production-ready** |
| Kind | normalized |
| Diff | **A** |

#### S-002 — Source showtime / performance id
| Field | Value |
|-------|-------|
| Consumers | Calendar sync keys, change detection, tickets |
| Path | Schema `showtimes[].source_showtime_id`; emit **always null** (`reel_seattle/emit/current.py`) |
| Capture | AMC daily log 2026-07-20: **2876/2876** with `source_showtime_id`; history nonempty counts §18 |
| Avail | **Available but incomplete** (captured; not emitted) |
| Kind | source-provided |
| Diff | **B** · Gap G05/G06 family |

#### S-003 — Local date, time, time_display, timezone
| Field | Value |
|-------|-------|
| Path | `date`, `time`, `time_display`; artifact `timezone: America/Los_Angeles` |
| Avail | **Available and production-ready** |
| Kind | normalized |
| Diff | **A** |

#### S-004 — Theater id on performance
| Field | Value |
|-------|-------|
| Path | `showtimes[].theater_id` → registry |
| Avail | **Available and production-ready** |
| Diff | **A** |

#### S-005 — End time (runtime-derived)
| Field | Value |
|-------|-------|
| Consumers | Planner breaks, film sheet “8:30–10:42”, Schedule |
| Avail | **Derivable from current data** when runtime present |
| Transform | start + `runtime_min` (legacy `getMovieEndTime` adds **no** trailer buffer — confirmed `src/utils/timeUtils.js`) |
| Kind | derived |
| Diff | **C** · Buffer policy = product decision (G26) |

#### S-006 — Status active / sold_out
| Field | Value |
|-------|-------|
| Path | `showtimes[].status` |
| Snapshot | AMC 18 sold_out / 2876 on 2026-07-20 current artifact; indie 0 |
| Avail | **Available but unreliable** for true realtime; scrape-cadence limited |
| Kind | source-provided |
| Diff | **B** display · **C** freshness UX |

#### S-007 — Ticket / purchase URL
| Field | Value |
|-------|-------|
| Consumers | View tickets, Opp CTAs |
| Path | Public `ticket_url` always null; AMC log attrs include `purchase_url`, `mobile_purchase_url` (2026-07-20 log) |
| Avail | **Available but incomplete** (capture≠emit; field name mismatch) |
| Kind | source-provided |
| Diff | **B** · Gap G05 |

#### S-008 — Screen / auditorium
| Field | Value |
|-------|-------|
| Consumers | Theater Detail screen tabs |
| Path | AMC log `attributes.auditorium` — not public |
| Avail | **Available only for some sources** (AMC logs) |
| Kind | source-provided |
| Diff | **D** |

### 6.4 Presentation attributes / formats

#### P-001 — `format_tags[]`
| Field | Value |
|-------|-------|
| Consumers | Badges, Filters, Quick Start, Best Way, Planner |
| Path | `showtimes[].format_tags`; normalize `reel_seattle/normalize/formats.py` |
| Snapshot | Unique on current: `70mm`, `dolby-cinema-at-amc`, `imax-at-amc`, `reald-3d`, `xl-at-amc`; **0** 35mm-like; 905/3075 showtimes have any tag; indie sources **0** tags in snapshot |
| Avail | **Available only for some sources** / incomplete taxonomy |
| Kind | normalized |
| Diff | **B** mapping · **D** full taxonomy |

#### P-002 — Structured `presentation_attributes[]`
| Field | Value |
|-------|-------|
| Consumers | OC/CC/AD, Q&A, subtitled, dubbed, events |
| Avail | **Requires new backend capability** (architecture Planned; implementation Deferred pending P-18B) |
| Source | Roadmap unified presentation-attribute section; AMC `amc_attributes` / `languages` in logs |
| Kind | normalized |
| Diff | **D** · Gap G07 |

#### P-003 — Subtitled / language display
| Field | Value |
|-------|-------|
| Consumers | Planner results “SUBTITLED”, Search language |
| Avail | Logs retain language objects; first expanded AMC day had empty spoken/dubbed/subtitle values (roadmap P-18B) |
| Kind | source-provided |
| Diff | **D** · Reliability unknown pending more observation |

#### P-004 — Theater format capability vs scheduled format
| Field | Value |
|-------|-------|
| Consumers | Theater cards “Digital, 70mm, IMAX” |
| Avail | **Requires new** curated capabilities; inferring from window is weak |
| Kind | editorial / derived |
| Diff | **D** |

### 6.5 Theater identity and detail metadata

#### T-001 — Registry identity
| Field | Value |
|-------|-------|
| Path | `data/theaters.json` → `public/data/theaters.json` |
| Fields | `id`, `name`, `aliases`, `source`, `source_external_id`, `enabled`, `type`, `city`, `neighborhood`, `timezone` |
| Snapshot | 15 theaters (13 enabled); city 15/15; neighborhood 8/15; timezone 15/15; **source_external_id 0/15**; no address/geo/amenities keys |
| Avail | Core identity **Available**; visit metadata **Requires new** |
| Kind | editorial (authored) |
| Diff | **A** core · **D** expansion · Gap G08 |
| Audit | [theater-data-audit.md](./research/theater-data-audit.md) (2026-07-26) — next **T-THEA-01** |

#### T-002 — Address, lat/lng, website, directions, phone
| Field | Value |
|-------|-------|
| Consumers | Theaters list/detail, Search theater hit, Directions |
| Example | “4405 Rainier Ave Sâ€¦” |
| Avail | **Requires new backend capability** (curated) |
| Kind | editorial / user-facing factual curation |
| Diff | **D** · See §16.E maintenance |

#### T-003 — Screens, seats, amenities, hours, pricing, description, imagery
| Field | Value |
|-------|-------|
| Consumers | Theater Detail |
| Avail | **Requires new** curated fields |
| Kind | editorial |
| Cadence | Hours/pricing higher churn than address |
| Diff | **D** |
| Stale behavior | Must show “as of” or hide when expired — product policy |

#### T-004 — Favorite theater flag
| Field | Value |
|-------|-------|
| Consumers | Theaters, Profile, Planner prefer |
| Path | `v2/stores/favoriteTheatersStore.js` · `reel-seattle.v2.favoriteTheaters` (versioned v1) |
| Avail | **Available** as local store (T-FAV-01); UI / Profile / Planner wiring deferred |
| Kind | user state |
| Diff | **D** · Gap G11b |

### 6.6 User film state

#### U-001 — Seen
| Field | Value |
|-------|-------|
| Consumers | FD, Explore Film Activity, Profile counts, Planner allow-repeats |
| Path | `v2/explore/seenFilmsStore.js` · `localStorage` key `reel-seattle.v2.seenFilms` · `string[]` max 50 keys only |
| Avail | **Available but incomplete** (no dates/theaters; not Profile-synced; cap 50) |
| Persist | Yes (local today) |
| Kind | user state |
| Diff | **B** enrich locally · **D** durable sync · Gap G11 |

#### U-002 — Not interested (dismissed)
| Field | Value |
|-------|-------|
| Path | `v2/stores/notInterestedFilmsStore.js` (+ Explore `dismissedFilmsStore.js` compat) · `reel-seattle.v2.dismissedFilms` |
| Avail | **Available** as versioned local store (T-NI-01); Film Detail wired (T-NI-03); Profile sync / management / ranking still deferred |
| Note | Does not yet filter Home ranking (roadmap) |
| Diff | **B–D** |

#### U-003 — Saved / bookmark
| Field | Value |
|-------|-------|
| Consumers | Home expand, Opening, Search, FD, Profile |
| Avail | **Requires user persistence** — no store |
| Kind | user state |
| Diff | **D** · Gap G10 · Product decision local vs account |

#### U-004 — Recent searches
| Field | Value |
|-------|-------|
| Path | `recentSearchesStore.js` · max 6 |
| Avail | **Available and production-ready** for device-local |
| Diff | **A** |

### 6.7 Plan configuration, results, scheduled plans

#### PL-001 — Plan configuration object
| Field | Value |
|-------|-------|
| Consumers | Build a Plan page, refine panel, share |
| Fields implied | dates[], flexible, startAfter, finishBefore, mustInclude[], wouldLove[], notInterested[], per-film constraints, theaterPref, origin, planSize, maxGap, walkLimit, premiumFormats, budget, accessibility, specialEvents, allowRepeats, excludeSoldOut |
| Avail | **Partial** via v1 URL planner filters (`src/utils/plannerUrlState.js`, `plannerEngine.js`) — missing walk, multi-day first-class, Neutral tier, A-List toggle, budget |
| Kind | user-entered |
| Diff | **C–E** · Gap G13 |

#### PL-002 — Plan result structure
| Field | Value |
|-------|-------|
| Consumers | Results cards |
| Fields | rank, items[{performanceId, film, theater, format, start, end, runtime}], breaks[], totalDuration, walkDistance, breakCount, finishTime, favorite flag |
| Avail | Legacy returns same-theater chains with gaps; **no walkDistance**; no multi-theater |
| Kind | derived |
| Diff | **E** for mockup parity |

#### PL-003 — Scheduled plan (My Schedule)
| Field | Value |
|-------|-------|
| Consumers | Planner landing, Schedule, Profile Up Next |
| Avail | **Requires user persistence** — nowhere in repo |
| Kind | user state |
| Entities | See §16.B |
| Diff | **D** · Gap G12 |

### 6.8 Search indexing

#### SR-001 — Searchable film/theater/format fields
| Field | Value |
|-------|-------|
| Path | `v2/explore/exploreCatalog.js`, `searchResultsModel.js` |
| Indexed today | title, sourceTitle, parentDisplayTitle, theater name/neighborhood/city, format tags |
| Not indexed | people, alternate titles beyond sourceTitle, collections, synopsis |
| Avail | **Available but incomplete** vs mockup |
| Scale snapshot | 96 films / 13 theaters / 3075 showtimes in current artifact — client-side feasible |
| Diff | **B** now · **E** if person/collection search required |

### 6.9 Opportunity evidence / Opening / Leaving

#### O-001 — Top Opportunity candidate + reason
| Field | Value |
|-------|-------|
| Path | `v2/adapters/selectTopOpportunities.js` — mechanical reasons only |
| Avail | **Derivable** (non-personalized) |
| Kind | derived |
| Diff | **C** mechanical · **E** personalized |

#### O-002 — Why See It / Best Way evidence records
| Field | Value |
|-------|-------|
| Avail | Partial mechanical in `filmDetailModel.js`; cultural ranks fixture-only |
| Minimum evidence fields | type, subject refs, facts{}, provenance, confidence, expires_at, copy_template_id |
| Kind | derived / predicted / external |
| Diff | **E** · See §16.D |

#### O-003 — Opening This Week membership
| Field | Value |
|-------|-------|
| Avail | **Requires new** classifier (provisional newly_added today) |
| Kind | derived |
| Diff | **E** · G03 |

#### O-004 — Leaving Soon
| Field | Value |
|-------|-------|
| Path | `leaving_soon_current.json` review-only; design `docs/leaving-soon-model-design.md` |
| Avail | **Available only historically / review** — not Pages |
| Kind | predicted |
| Diff | **E/F** · G04 |

### 6.10 Travel / geospatial

#### G-001 — Theater coordinates + user origin
| Field | Value |
|-------|-------|
| Avail | **Requires new** (coords) + **user-entered** origin |
| Kind | editorial + user-entered |
| Diff | **D** |

#### G-002 — Walking distance / time between theaters
| Field | Value |
|-------|-------|
| Consumers | Planner results “2.2 mi walk”, Best Way “0.6 mi” |
| Avail | **Requires new external data** or curated matrix |
| Alternatives | Straight-line; curated NÃ—N walk matrix; routing API (cost/ToS unknown — **Requires web research**) |
| Diff | **E** · Gap G09 · Do not select provider here |

### 6.11 Calendar, notifications, profile, memberships, collections, copy

#### C-001 — Calendar integration modes
| Field | Value |
|-------|-------|
| Avail | **Requires new backend capability** (none implemented) |
| Modes | Separated in §16.F — ICS ≠ sync â‰  push |
| Diff | **C** ICS · **E** one-way sync · **F** bidirectional |

#### N-001 — Notification preferences + delivery
| Field | Value |
|-------|-------|
| Consumers | Profile → Notifications & Alerts |
| Avail | **Requires new** |
| Diff | **E** · Gap G20 |

#### PR-001 — Profile identity + memberships
| Field | Value |
|-------|-------|
| Example | Name “Mattheus”; A-List “4 of 4 this week” |
| Avail | **Requires user persistence**; live A-List counters **Requires new** + likely ToS barriers |
| Internal hint | AMC catalog `available_for_a_list` 44/54 — eligibility flag, **not** user usage |
| Diff | **D** manual membership prefs · **F** live AMC usage |

#### COL-001 — Collections / Coming Soon / Special Events
| Field | Value |
|-------|-------|
| Avail | **Requires new** curated or rule-generated artifacts |
| Kind | editorial / derived |
| Diff | **D–E** · Gap G18 · **Requires product decision** on editorial ops |

#### COPY-001 — Dynamic copy dependencies
| Field | Value |
|-------|-------|
| See | §17 full appendix |
| Diff | Mostly **B–C** once inputs exist |

---

## 7. Gap register (validated)

| Gap ID | Name | Screens | Current | Solution class | Prereq gaps | Roadmap ref | Diff | Uncertainty | Stage 5 risk? | PO decision? |
|--------|------|---------|---------|----------------|-------------|-------------|------|-------------|---------------|--------------|
| G01 | Public film enrichment | Home expand, Opening, Search, FD | Internal AMC catalog + fixtures | New public artifact and/or external metadata | — | Film identity Planned; public enrichment Planned; **T-ENR-AMC-R done** (gate uncleared; coverage measured) | D | Med | No — **T-ENR-01** next (AMC slice or skip-AMC) | Enrichment scope + republish rights |
| G02 | Canonical film_id | Save sync, Search, Collections | showtime_film_key only | Matching system | Partial G01 | film_id Planned | E | High | No | Match policy |
| G03 | Opening This Week classifier | Home, Opening page, signals | Provisional newly_added | Derived daily artifact | F-006 definition | Data dependency noted; **Planned track added** | E | High | No | Week definition |
| G04 | Leaving Soon ship | Home, Why See It, Planner sort, alerts | Review heuristic | Eval gate + Pages policy | History | Leaving Soon UI Deferred | E | High | Possible if quality fails | Ship bar |
| G05 | Ticket/purchase URL emit | Opp, Schedule, Next Up | Log has purchase URLs; public null | Emit mapping | — | Emit completeness Planned | B | Low | No | — |
| G06 | Source showtime ID emit | Sync, change detection | Captured in logs; public null | Emit mapping | — | Emit completeness Planned | B | Low | No | — |
| G07 | presentation_attributes public | FD, Search, Planner, colors | Logs; public `{}` | Contract + emit | P-18B evidence | presentation_attributes Deferred | D | Med | No | Taxonomy accept |
| G08 | Theater visit metadata | Theaters, Detail, Search | Thin registry | Curated schema expansion | — | Theater expansion Planned; **audit 2026-07-26** [theater-data-audit.md](./research/theater-data-audit.md) → **T-THEA-01** next | D | Med | No | Ownership/SLA |
| G09 | Geo + travel | Best Way, Planner miles | Absent | Matrix and/or routing | G08 coords | Travel Research needed | E | High | Possible for paid routing | MVP method |
| G10 | Save store | Many | Absent | Persistence | Auth decision optional | Product gap noted | D | Med | No | Local vs account |
| G11 | Rich Seen/NI | Explore, Profile, ranking | Keys local max 50 | Richer store Â± sync | G10 optional | Roadmap dependency | D | Med | No | Sync |
| G11b | Favorite theaters | Theaters, Profile, Planner | Store v1 (T-FAV-01); UI deferred | Wire UI + Profile | — | T-FAV-01 done; list/detail wiring with T-THEA-10 | B–D | Low | No | Local vs account |
| G12 | Scheduled plans | Planner, Schedule, Profile | Local store wired | Plan schema + store | G05 helpful | T-PLAN-01 done; live Results need T-PENG-01 | D | Med | No | Local vs account |
| G13 | Multi-theater planner | Results | Same-theater engine | Engine + travel | G09 for miles | unified-planner docs | E | High | No | Same-theater MVP? |
| G14 | Accounts / cross-device | Profile | Absent | Auth backend | Privacy | Profile spec future | E | High | No | Need accounts? |
| G15 | Calendar capabilities | Settings, About | ICS UI wired | Separate modes §16.F | G12 | T-CAL-01+02 done; one-way sync later | C–F | High | Bidirectional likely | ICS vs sync |
| G16 | Cultural ranks (Letterboxd etc.) | FD Why See It | Fixture | Licensed source or omit | G01 | Letterboxd Planned optional; policy note | F | Very high | **Investigate then maybe Stage 5** | Allow? |
| G17 | Person search | Explore, Search | Unsupported | People index | G01/E-005 | Explore dependency | E | High | Possible without cast data | Placeholder honesty |
| G18 | Collections / Coming Soon / Events | Explore Browse By | Scaffolds | Curated/rules artifacts | G01 helpful | Explore dependency | D–E | Med | Editorial ops | Editorial? |
| G19 | Memberships / A-List usage | Profile, FD, Planner | Absent; catalog has eligibility flag | Manual prefs vs integration | — | None | D–F | Very high | Live counters likely | Manual OK? |
| G20 | Notifications | Profile | Absent | Delivery infra | G12/G04 etc. | None DF | E | High | No | Channel scope |
| G21 | Activity event log | Planner Recent Activity | Absent | Log vs derive | G10–G12 | None | D | Med | No | Need log? |
| G22 | Venue coverage gaps | Home, Theaters, Search | Registry incomplete vs mockups | New sources / aliases | PO pick | New source Planned PO-blocked | D | Med | No | Which venues? |
| G23 | Landscape imagery pipeline | Home, FD | Poster / fixture | Catalog media and/or external | G01 | — | D | Med | No | Source choice |
| G24 | Sold-out freshness | Planner exclude | Status field | Cadence + stale UX | — | — | C | Med | True realtime unlikely | Honesty copy |
| G25 | Insights definitions | Month view | Absent | Spec + compute | G12 | — | C | Med | No | Definitions |
| G26 | Runtime end-time buffer policy | Planner, Schedule | Runtime-only end | Product rule | E-001 | T-BUF-01 done (15/10/5 in `plannerBufferPolicy`) | C | Low | No | Theater-specific / user adjust later |
| G27 | Share payloads | FD, Planner, Theater | Absent | URL/state design | — | v1 planner share exists partially | C | Low | No | What is shared |
| G28 | Screen/auditorium public model | Theater Detail | AMC log only | Emit + entity | G07 helpful | Auditoriums Research needed | E | Med | No | Need screens? |

---

## 8. Difficulty summary (refreshed)

### A
F-001/003 titles & keys; S-001/003/004 schedule basics; U-004 recent searches; static About copy.

### B
G05/G06 emit; format label mapping; Now Showing joins; Search facets on existing fields; ticket CTA once URLs emit.

### C
Exclusivity/count copy; end times; local schedule settings; insights once plans exist; ICS export; G26 buffer; G27 share.

### D
G01 enrichment artifact; G08 theater curation; G10–G12/G11b persistence; G07 attrs; G18 collections; G23 imagery; selective catalog promotion.

### E
G02 film_id; G03 opening; G04 leaving ship; G09/G13 travel+multi-theater; G14 accounts; G17 person search; G20 notifications; one-way calendar sync; evidence engine.

### F (investigate — do not auto-cut)
G16 cultural ranks; G19 live A-List usage; G15 bidirectional calendar; guaranteed 35mm; true realtime sold-out.

---

## 9. Product decisions required

(Unchanged intent; clarified as decisions not engineering gaps.)

1. Local-only vs accounts for Save/Seen/NI/favorites/plans/Profile  
2. Opening This Week definition + week boundary vs rolling-7d label honesty  
3. Leaving Soon ship quality bar + AMC-only vs multi-source  
4. Enrichment republish rights (AMC catalog fields) + external metadata provider choice  
5. Letterboxd/cultural rank allowance  
6. Theater metadata owner + SLA  
7. Travel MVP method  
8. Planner: same-theater MVP vs multi-theater required for v2  
9. Calendar: ICS-only vs one-way sync (About copy currently assumes sync)  
10. Memberships: manual vs any live integration  
11. Editorial ops for collections/tags/Suggested imagery  
12. Person-search placeholder honesty  
13. Venue expansion priority  
14. Color-coding-by-genre without genres  
15. Seen exclusion vs “special opportunities” exception  
16. Budget/price in planner given partial AMC prices  
17. Trailer/preshow/transfer buffer minutes (G26)

---

## 10. Source feasibility assessment (evidence-labeled)

| Source | Supplies | Current use | Access | Reliability | Policy/licensing | Cost | Coverage | Cadence | Recommendation posture |
|--------|----------|-------------|--------|-------------|------------------|------|----------|---------|------------------------|
| Theater scrapers/APIs | Showtimes, some meta | Production | Scrapers/API | **Confirmed by repository** high for schedules | ToS/breakage = **engineering inference** | Eng time | Seattle set | Daily | Continue primary |
| AMC source catalog | Synopsis, cast, directors, MPAA, release, media, `available_for_a_list` | Internal | AMC paths | **Confirmed by repository** | Public republish = **terms gate UNCLEARED** ([T-ENR-AMC-R](./research/amc-enrichment-audit.md) 2026-07-25); PO/legal must clear vendor agreement before Pages emit | Eng | AMC only | Daily soft-fail | Technically join-ready (41/41 current AMC ids); **not** cleared to republish |
| History CSV | Trajectories | Pipeline | Repo | **Confirmed** | Low | Storage | Broad | Daily | Retain for derived models |
| TMDB | IDs, metadata, images | Planned in roadmap only | API key | **Requires web research** for current ToS/rate limits | Attribution **Requires terms/licensing review** | **Requires web research** | Broad (assumed) | On match | **Alternative**, not selected |
| IMDb | IDs/ratings | Audit only; 0 usable on sampled Showtimes path | Restricted | — | Scraping **high risk** (docs) | — | — | — | Do not scrape; external IDs only if via licensed bridge |
| Letterboxd | Ranks/lists | Fixture only | Unofficial | Unknown | **Requires terms/licensing review** | Unknown | Unknown | — | Alternative / omit until legal+product |
| Wikidata | IDs | Absent | API | Variable | Generally open | Free | Spotty | On demand | Optional bridge alternative |
| Metacritic/RT | Scores | Absent | Fragile | — | Likely restricted | — | — | — | Not required for MVP signals |
| Routing APIs | Walk/transit | Absent | API | Unknown | Privacy + ToS | **Requires web research** | — | On demand | Alternative to curated matrix |
| Manual curation | Theater meta, collections | Registry today | Git | High if owned | Low | Editorial time | Controllable | Rare–monthly | Required for Theater Detail |
| User-entered | Profile, memberships, home | Absent | App | User truth | Privacy | — | Per user | Live | Membership MVP alternative to live AMC |

---

## 11. Static versus dynamic architecture assessment (alternatives)

| Capability | Reasonable delivery alternatives (no final pick) |
|------------|--------------------------------------------------|
| Showtimes / newly_added / pipeline | Existing static public JSON + Actions (**confirmed**) |
| Opening / Leaving / enrichment packs | New generated static JSON **or** on-demand client derive (weaker) |
| Theater meta / collections / FAQ | Repo JSON/Markdown **or** later admin tool |
| Search at current scale (~96 films) | Client-side over artifacts (**feasible now**) **or** later search index if people/collections explode scale |
| Top Opportunity / Best Way non-personalized | Client calculation **or** precomputed JSON |
| Personalized ranking | Client+local state **or** serverless |
| Save/Seen/plans | localStorage/IndexedDB **or** authenticated DB — **product decision** |
| Multi-theater planner | Client **or** serverless for CPU |
| Travel | Curated matrix JSON **or** third-party routing via proxy |
| Calendar | Client ICS **or** OAuth one-way sync backend **or** (avoid) bidirectional |
| Notifications | Local reminders **or** browser Notification API **or** push/email backend |
| Plan sharing | URL state (v1 pattern) **or** short-link service |

---

## 12. Mockup-only or fictional-data warnings

(Retained; still authoritative.) Idealized titles/dates/venues; Film Detail mockup fixture; home visual fixtures; Search Kurosawa composition; Profile counts/membership; theater addresses/amenities/pricing/hours; planner walk miles & multi-theater results; Schedule July 2026 events; obsolete nav chrome; landscape/theater photography.

---

## 13. Stage 3 preparation

(Retained workstreams from first pass.) Do not start Stage 3 in this task. Sequence still: emit completeness → enrichment/theater curation (PO) → user-state MVP → planner/schedule → explore destinations → profile/notify → Stage 5 cuts only after investigation.

---

## 14. Roadmap reconciliation

Cross-walk between [docs/data-foundation-roadmap.md](../data-foundation-roadmap.md) and this audit.

| Existing roadmap item | Related gap IDs | Already covered? | Change made? | Exact change | Why justified | Wait for Stage 3? |
|-----------------------|-----------------|------------------|--------------|--------------|---------------|-------------------|
| Public artifact validation / inventory / pipeline report | — | Yes (foundation) | No | — | — | N/A |
| AMC source catalog (P-14D, P-21*) | G01 | Yes (internal) | No | — | Catalog remains internal | Enrichment publish = later |
| P-18A/B attributes observation | G07, P-002 | Yes | No | — | Still blocked on ≥3 expanded dates | Yes for implement |
| `presentation_attributes[]` Deferred | G07 | Yes | No | — | Correctly deferred | Yes |
| Film identity + TMDB Planned | G01, G02, G16 | Partial | Yes (earlier + this pass) | Public enrichment Planned row; Letterboxd policy note | Mockups need public enrichment; Letterboxd not settled | Provider choice Stage 3+ |
| Opening This Week dependency note | G03 | Mentioned only | **Yes (this pass)** | Add explicit Planned derived artifact row | Durable data product distinct from newly_added | Design can start; ship Stage 3+ |
| Leaving Soon UI Deferred | G04 | Yes | No | — | Correct gate | Yes |
| Theater model expansion Planned | G08, G09, G22, G28 | Partial | Yes (earlier pass) | Added website/description/amenities/hours/pricing/imagery/travel research | Mockup Theater Detail requires them | Curation can start anytime |
| New source PO-blocked | G22 | Yes | No | — | Venue picks are PO | Yes |
| Emit ticket_url / source_showtime_id Planned | G05, G06 | Added prior pass | No further | Table under film identity | Confirmed emit hardcode vs log capture | Small DF task — still not auto-Started |
| Save store product gap | G10 | Yes (note) | No | — | Product not DF Ready | Stage 3 / product track |
| Seen/NI local-only note | G11 | Yes | No | — | — | Stage 3 |
| Explore person/35mm/collections notes | G17, G18, P-001 | Yes | No | — | — | Stage 3 |
| Stage 2 audit cross-link | all | Yes | **Yes (this pass)** | Point to validation-pass status + §14 | Reciprocal navigation | N/A |
| Scheduled plans / calendar / notifications / memberships | G12, G15, G19, G20 | Stage 2 note only | **Yes (this pass)** | Add “Out of DF Ready scope” bullet list with gap IDs — **not** Ready tasks | Prevent silent loss; avoid turning DF into Stage 3 | **Yes — Stage 3 / product** |
| Multi-theater planner travel | G09, G13 | Travel Research needed | No further | — | Correct | Stage 3 |
| Conflicts / obsolete | — | — | No conflict found | five-tab nav already ignored in v2 specs | — | — |

### Roadmap updates in this validation pass
1. Explicit **Opening This Week derived artifact** Planned row (G03).  
2. Softened Letterboxd / TMDB wording: investigate before Stage 5; provider not selected in Stage 2.  
3. **Out of Data-Foundation Ready scope** bullet list with gap IDs (G12, G11b, G15, G20, G19, G18, G13) — prevents silent loss without inventing Ready DF tasks.  
4. Header last-updated + reciprocal link to audit §14 / validation-pass status.  
5. Prior pass retained: public enrichment Planned; emit completeness table; theater meta/travel research rows.

---

## 15. Evidence classification legend (applied globally)

| Label | Meaning |
|-------|---------|
| Confirmed by repository | Code, schema, or committed artifact inspected |
| Confirmed by existing project documentation | Roadmap/spec/design doc |
| Engineering inference | Reasonable engineering judgment, not proven |
| Requires web research | External ToS/pricing/API behavior |
| Requires terms/licensing review | Legal/product rights |
| Requires product decision | PO must choose |

---

## 16. Dedicated subsystem analyses

### 16.A Planner engine

**Required input model (mockup):** configuration PL-001; showtimes window; theater meta; optional travel matrix; user Seen/membership prefs; sold-out flags; format/presentation attrs.

**Candidate construction:** All performances in selected dates/theaters/formats intersecting film preference sets; compute end times; optionally expand cross-theater edges if travel available.

**Constraint model:** date/time windows; flexible flag; must-include coverage; exclusions; plan size min/max; min/max gap; walk limit; accessibility; special events include/exclude; exclude sold out; same-theater preference optional.

**Preference model:** would-love soft boost; premium formats; Prefer AMC / indie / custom; A-List value; origin proximity; Neutral tier on film sheet.

**Validity rules:** non-overlapping after buffers; must-includes present; finish before window; travel feasible; no excluded films; optional no repeats.

**Ranking:** mockup sorts — Best match, Smallest gaps, Shortest runtime, Earliest finish, Leaves soonest. Legacy sorts: `earliest_start`, `shortest_span`, `longest_span`, `most_films`, `smallest_gaps`, `latest_finish` (`PLANNER_SORT_MODES`).

**Diversity:** suppress duplicate lineups (legacy `dedupeByFilmLineup`); mockup implies more diversity across theaters.

**Travel:** not in legacy engine; required for mockup miles; depends G09.

**Runtime/end-time:** legacy `getMovieEndTime` = start+runtime only for showtimes display (**Confirmed**). Planner expected end / transfer validity use D17 policy via `plannerBufferPolicy` (T-BUF-01: +15m preshow, +10m general / +5m same-venue).

**Sold-out / cancel:** legacy filters canceled via `isShowtimeCanceled`; status `sold_out` exists. Recalc when refresh shows changes — product rules for scheduled plans.

**Film-click mutation scope (mockup):** Must/Would/Neutral/NI may update global criteria vs single result — **Requires product decision**; Replace movie = local slot search; Film details = navigate FD.

**Client vs server:** at current scale client feasible; multi-theater + routing may push serverless — alternatives only.

**Persistence boundary:** drafts/config shareable (URL); accepted plans → G12 store; results cache optional with stale detection vs `generated_at`.

**Exact differences vs legacy (`src/utils/plannerEngine.js`):**
| Area | Legacy | Mockup need |
|------|--------|-------------|
| Theater scope | Same-theater only | Multi-theater + walk |
| Film tiers | include / preferred / exclude | Must / Would / Neutral / NI |
| Dates | Single date filter | Multi-day + Flexible |
| Travel | None | Miles + walk minutes |
| Sorts | 6 modes above | + Best match, Leaves soonest |
| Walk/budget/a11y/A-List | Absent | Present |
| Buffers | Runtime only | Trailer + transfer |
| Limits | maxResults 200, depth 8 | Load more UX |

### 16.B My Schedule data model

**Entity distinctions**
| Entity | Meaning |
|--------|---------|
| Film | Canonical or schedule film identity |
| Performance | Specific showtime at a theater |
| Plan item | User commitment to a performance (or break/travel segment) |
| Plan | Grouping of plan items (single- or multi-film) for a day/span |
| Schedule event | Timeline projection of a plan item (UI) |
| Break | Non-performance gap segment with duration |
| Travel segment | Optional move between theaters |
| External calendar event | Projection in Google/Apple/ICS — not source of truth per About mockup |

**Minimum fields**
- **Single-film plan:** planId, performanceId, filmKey, theaterId, start, end?, format?, ticketUrl?, status (`scheduled|completed|canceled|changed`), source (`user|planner`), createdAt  
- **Multi-film plan:** planId, itemIds[], breakIds[], travelIds[], label?, favorite?  
- **Break:** breakId, start, end, durationMin  
- **Travel:** fromTheater, toTheater, mode, durationMin, distanceMi?  
- **Changed/canceled:** link performanceId → prior snapshot; user notification flag  
- **Completed:** status + completedAt (settings: hide/dim)  
- **Calendar-export state:** lastExportedAt, externalEventIds[], syncMode (`off|ics|one_way`)  
- **Week/month projections:** derived from plans in range  
- **Insights:** movie days, unique films, runtime sum, double features, theaters visited, busiest days, streaks — definitions G25  

Saved film ≠ schedule (About mockup) — **Confirmed by product decision in prompt/mockup**.

### 16.C Search

| Topic | Requirement |
|-------|-------------|
| Entity types | Films, theaters, formats; mockup also people, collections |
| Film fields | Title, alts, year, genre, synopsis, director, language, runtime, next showtime |
| People | Name → film credits (unsupported today) |
| Theaters | Name, address, imagery |
| Formats | Taxonomy label + count |
| Collections | Names/themes (absent) |
| Matching | Exact/prefix/contains today; fuzzy optional later |
| Ranking | Exact→prefix→contains→sourceTitle→next showtime→alpha (v2 model) |
| Filters | Type facets; Playing now/Today/This week; theater/format sheet; genre/runtime/a11y future |
| Counts | “18 results for 'Kurosawa'” + per-section counts |
| Scale | §18 snapshot ~96 films — client OK |
| Forces dedicated index | Large cast graph, typo-tolerant people search, multi-city expansion, server personalization |

### 16.D Opportunity evidence

**Surfaces:** Top Opportunity, Why See It Now, Best Way, Opening/Leaving chips, scarcity/exclusivity/format rarity, rankings/awards, personal/theater/membership matches.

**Minimum evidence record (not final schema):**
- `evidence_id`, `type`, `film_key` / `performance_id` / `theater_id`  
- `facts` (structured: venue_count, screenings_left, format, rank_position, â€¦)  
- `provenance` (source, method, observed_at)  
- `confidence` (0–1 or enum)  
- `expires_at` / validity window  
- `copy_template_id` + parameters for deterministic strings  
- `rank_weight` optional for ordering cards  

**Deterministic copy needs:** “Only N venues in Seattle”; “N screenings left”; “Ends {date}”; “Only at {theater}”; “Rare {format}”; ranking strings only if licensed.

**Personal/membership evidence:** requires user state (G10–G11, G19) — mark personalized explicitly.

### 16.E Theater metadata maintenance

| Field group | Owner | Change frequency | Validation | Source of truth | Review cadence | Repo JSON safe? | Admin tool later? | If stale |
|-------------|-------|------------------|------------|-----------------|----------------|-----------------|-------------------|----------|
| Address, coords, website, phone | PO / curator | Rare | Format + map check | Curated registry | Semi-annual | Yes | Optional | Hide Directions / warn |
| Description | Curator | Rare | Editorial review | Curated | Annual | Yes | Optional | Keep last |
| Screens, seats, capabilities | Curator | Rare–occasional | Compare to showtimes inference | Curated (+ infer warn) | Semi-annual | Yes | Optional | Prefer scheduled formats |
| Amenities | Curator | Occasional | Checklist | Curated | Semi-annual | Yes | Helpful | Hide amenity |
| Hours | Curator | Seasonal/holiday | Compare theater site | Curated | Monthly / holiday | Yes initially | Likely | Show “verify on site” |
| Pricing | Curator | Occasional | Spot-check site | Curated | Quarterly | Yes initially | Likely | Hide prices |
| Imagery | Curator | Rare | Rights/attribution | Asset store / repo | On change | Yes if licensed | Helpful | Fall back placeholder |
| Favorites | User | Live | — | User state | — | local/user DB | — | — |

### 16.F Calendar and notifications (separated)

| Capability | Description | Deps | Diff | Notes |
|------------|-------------|------|------|-------|
| ICS export | Download .ics for plan(s) | G12 | C | One-shot file; no account |
| One-time Add to Calendar | OS/web cal link | G12 | C | Not ongoing sync |
| Ongoing one-way sync | App→external creates/updates | G12, OAuth | E | Matches About mockup claim |
| Bidirectional sync | External edits flow back | — | F | About says external edits **won’t** sync back — do not build unless PO changes policy |
| Local reminders | Device-local alarms | G12 | C | No server |
| Browser notifications | Notification API | Permission | D | Needs trigger rules |
| Push notifications | Mobile/web push infra | Backend | E | |
| Email alerts | Leaving/saved/theater | Email provider + consent | E | |

Do not conflate these systems in Stage 3 planning.

---

## 17. Dynamic-copy appendix

| UI location | Example | Inputs | Formatting | Plural | Relative date | TZ | Missing fallback | Copy class |
|-------------|---------|--------|------------|--------|---------------|----|------------------|------------|
| Top Opp pagination | “1 of 3” | index, count | `{i} of {n}` | — | — | — | Hide if n<2 | interpolated |
| Top Opp reason | “Stunning 70mmâ€¦” | format, engagement type | template | — | — | — | Omit reason | rule-generated / editorial template |
| Opening shelf date | “Fri 5/18”, “Tonight” | opening/show date, now | weekday+short date | — | Tonight/Today/Tomorrow rules | PT | Hide date | interpolated |
| Leaving shelf | “Ends May 19” | end date | `Ends {Mon D}` | — | — | PT | Omit shelf item | predicted/rule |
| Opening page sub | “18 films openingâ€¦” | count | `{n} filmsâ€¦` | film/films | — | — | “No films openingâ€¦” | interpolated |
| Also playing | “Also playing at 2 theaters” | theaterCount-1 | | theater/theaters | — | — | Hide chip | rule-generated |
| Screenings left | “3 screenings left” | future count | | screening/screenings | — | — | Hide | rule-generated |
| Exclusivity | “Only at SIFF Downtown” | venueCount==1 | | — | — | — | Hide | rule-generated |
| Rare format | “Only 3 venues in Seattle” | formatVenueCount | | venue/venues | — | — | Hide | rule-generated |
| Next showtime line | “SIFFâ€¦ Tonight 6:15 PM • 35mm” | theater, time, format | | — | Tonight/Tomorrow | PT | “No upcoming showtimes” | interpolated |
| Search summary | “18 results for 'Kurosawa'” | total, query | | result/results | — | — | Empty state | interpolated |
| Also playing search | “Also playing at 3 other theaters” | count | | | — | — | Hide | rule-generated |
| Best Way when | “Today, May 17 • 7:30 PM” | date, time | | — | Today | PT | Omit card | interpolated |
| Best Way distance | “0.6 mi” | distance | 1 decimal mi | — | — | — | Omit distance fact | derived |
| Plan duration | “9h 47m total” | minutes | h/m | — | — | — | — | derived |
| Break | “Break 1h 16m” | gap min | | — | — | — | Hide breaks setting | derived |
| Walk | “2.2 mi walk” | miles | | — | — | — | Same-theater: 0 / omit | derived |
| Results count | “18 plans found” | n | | plan/plans | — | — | “No plansâ€¦” | interpolated |
| Film activity | “Last seen: The Odyssey, May 17 (AMCâ€¦)” | title, date, theater | | — | — | PT | “No seen films yet” | personalized |
| Membership | “4 of 4 this week” | used, quota, week | | — | week boundary | PT | Hide usage | personalized |
| Month insights | “8 movie days • 11 films • 23h 45m” | aggregates | | | — | — | Empty insights | derived |
| Busiest day | “4 movies” | count | | movie/movies | — | — | Hide section | derived |
| Heatmap legend | “1 movie”â€¦“4+ movies” | count buckets | | | — | — | — | static+interpolated |
| Empty day | “No plans yetâ€¦” | — | | — | — | — | Always | static |
| Canceled/changed | (FAQ implies warnings) | status, prior time | | — | — | PT | Honest omit if unknown | rule-generated |
| Completed plans | dim/hide per settings | status | | — | — | — | — | personalized |
| Timezone note | “All times in PT” | — | | — | — | fixed PT | Always | static |
| Relative Today/Tomorrow | many | local date vs Pacific now | | — | calendar day PT | **America/Los_Angeles** | Absolute date | interpolated |

**Relative-date rules (proposed for Stage 3 design, not implemented):** compare show date to Pacific “today”; Tonight = today + evening heuristic optional; never use device TZ for Seattle showtimes.

---

## 18. Quantitative coverage snapshots

**Labeling:** All figures are **snapshots**, not longitudinal SLAs.

### 18.1 `public/data/showtimes_current.json`
- **generated_at:** 2026-07-20T01:46:08-07:00  
- **window:** 2026-07-20 → 2026-08-03  
- **Scope:** committed public artifact (browser-facing)  
- Films: 96 · Showtimes: 3075 · Theaters in artifact: 13  
- Runtime nonempty: **81/96 (84.4%)**  
- Poster nonempty: **81/96 (84.4%)**  
- `ticket_url` nonempty: **0/3075**  
- `source_showtime_id` nonempty: **0/3075**  
- `attributes` nonempty: **0/3075**  
- Showtimes with any `format_tags`: **905/3075**  
- Unique format tags: `70mm`, `dolby-cinema-at-amc`, `imax-at-amc`, `reald-3d`, `xl-at-amc`  
- 35mm-like tags: **0**  
- Sold out: AMC 18; other sources 0 in this snapshot  

### 18.2 AMC daily log vs public emit (same calendar day)
- Artifact: `data/daily_logs/2026-07-20_amc.json` · generated_at 2026-07-20T01:45:47-07:00 · 2876 records  
- `source_showtime_id` present: **2876/2876**  
- Nonempty `attributes`: **2876/2876** (includes `purchase_url`, `mobile_purchase_url`, `auditorium`, `ticket_prices`, â€¦)  
- `ticket_url_raw` top-level: **0** (URLs live under attributes)  
- **Conclusion (Confirmed by repository):** capture≠public emit for IDs, purchase URLs, attributes.

### 18.3 Theater registry `data/theaters.json`
- **updated_at:** 2026-07-15 · schema 1.0.0  
- 15 theaters (13 enabled)  
- city 15/15 · neighborhood 8/15 · timezone 15/15 · `source_external_id` **0/15**  
- address/coords/amenities/hours/pricing/imagery keys: **none**

### 18.4 AMC catalog `data/source_catalog/amc_movie_products.json`
- **generated_at:** 2026-07-20T01:46:18-07:00 · 54 products · **internal only**  
- synopsis 54/54 · release_date_utc 54/54 · mpaa 51/54 · genre 44/54 · directors_raw 40/54 · starring 37/54 · media 54/54 · `available_for_a_list` 44/54  
- Representative of **AMC catalog slice**, not all Seattle films.
- **T-ENR-AMC-R (2026-07-25):** current-window AMC join **41/41** `source_film_id`→catalog; public films still **0/96** year/genres/director/synopsis/mpaa. Terms gate **uncleared**. Repro: `python scripts/audit_amc_enrichment.py` → [`data/audits/amc_enrichment_coverage.json`](../../data/audits/amc_enrichment_coverage.json); report [`research/amc-enrichment-audit.md`](./research/amc-enrichment-audit.md).

### 18.4b Enrichment availability classes (post T-ENR-AMC-R)

| Class | Fields |
|-------|--------|
| **Existing (public)** | title; runtime_min (partial); poster_url (partial); format/ticket/source ids on showtimes |
| **Easy to expose after terms + producer emit** | AMC synopsis, mpaa_rating, derived year, genre→genres, directors_raw (join-ready) |
| **Needs producer work** | Public enrichment artifact; rerelease year suppress; genre normalize; optional hero URL policy |
| **Needs new provider** | TMDB ids/meta; durable IMDb (not in catalog); indie synopsis/year/genres; Letterboxd |
| **Deferred** | Person/cast search; genre coloring; awards; backdrop activation; canonical `film_id` |

### 18.5 History `data/history/showtimes_history.csv`
- Rows: **352,559**  
- Nonempty `source_film_id` by source (counts of rows): amc 10545, siff 193, beacon 84, central_cinema 46, nwff 41  
- Nonempty `source_showtime_id`: amc 4069, siff 193, beacon 82, central_cinema 46, nwff 0  
- **Historical availability is sparse** relative to total rows (legacy era without IDs).

---

## 19. Deliverables compliance appendix

| Original Stage 2 deliverable | Audit section(s) | Completion status | Remaining limitation |
|------------------------------|------------------|-------------------|----------------------|
| Executive summary | §1 | Complete | Qualitative only (no fake %) |
| Mockup inventory | §2 | Complete | OCR may misread literal fixture strings; capabilities audited |
| Current system inventory | §3 | Complete | Not every adapter line reproduced |
| Page-by-page matrix | §4 | Complete | Compact status codes; details in §6–7 |
| Cross-cutting capability matrix | §5 | Complete | — |
| Field-level 21-field inventory | §6 | **Complete for required domains** | Not every minor UI chrome string as its own ID |
| Gap register | §7 | Complete | Some product questions remain open by design |
| Difficulty summary | §8 | Complete | — |
| Product decisions | §9 | Complete | Awaiting PO |
| Source feasibility | §10 | Complete with evidence labels | External ToS/cost not settled |
| Static vs dynamic | §11 | Complete as alternatives | No final architecture pick |
| Mockup-only warnings | §12 | Complete | — |
| Stage 3 preparation | §13 | Complete | Not Stage 3 prompts |
| Roadmap reconciliation | §14 | Complete | DF roadmap not converted to Stage 3 |
| Subsystem analyses A–F | §16 | Complete | Not final schemas |
| Dynamic-copy appendix | §17 | Complete for listed patterns | May add patterns as new mockups arrive |
| Quantitative snapshots | §18 | Complete for cheap metrics | Single-day snapshots |
| Compliance checklist | §0, §19 | Complete | — |
| No implementation | — | Honored | — |

**Document status:** Stage 2 audit **validation pass complete**. It does **not** claim production implementation readiness. It does **not** begin Stage 3.

---

## Appendix C — Original abbreviated inventory

The first-pass abbreviated tables in the prior revision were superseded by §6–§18 of this validation pass. Historical gap IDs G01–G25 were preserved and extended (G11b, G26–G28).

---

*End of Stage 2 audit — validation pass.*
