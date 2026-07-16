# Reel Seattle — Product Roadmap & Tracker

**Status:** Living document — update when priorities shift or work ships  
**Last updated:** 2026-07-03  
**Audience:** Maintainers, product direction, and Cursor agents

This is the **master tracker** for cross-cutting product work. Domain-specific roadmaps remain authoritative for depth:

| Doc | Scope |
|-----|--------|
| [data-foundation-roadmap.md](./data-foundation-roadmap.md) | Data foundation backlog — catalogs, AMC audits, presentation attributes, enrichment |
| [planner-ux-roadmap.md](./planner-ux-roadmap.md) | Planner filter UX, picker patterns, mock preview |
| [unified-planner-design.md](./unified-planner-design.md) | Planner engine, URL contract, technical design |
| [film-identity-normalization.md](./film-identity-normalization.md) | Parent/variant identity, AMC `movieId`, staged Identity PRs |
| [leaving-soon-model-design.md](./leaving-soon-model-design.md) | Leaving Soon labels, evaluation gates, PR E/E2/F |
| [frontend-smoke-check.md](./frontend-smoke-check.md) | Manual QA checklist |
| [SCRAPING_README.md](../SCRAPING_README.md) | Daily scraping pipeline |

**Agent instructions:** Read this file before starting new product work. Update item **Status** and **Last touched** when work begins or ships. Add new ideas via the [Idea intake template](#idea-intake-template). Do not expand into **Deferred** or **Do not ship** items without explicit user approval.

---

## Recommended phases

Practical sequence based on current repo state (Phase 1 complete; Identity-D shipped; Identity-E partial; Leaving Soon blocked).

| Phase | Theme | Rationale |
|-------|--------|-----------|
| **0** | Tracker + UX audit | This document — **complete** |
| **1** | Planner mobile UX polish | **Complete** (UX-1–UX-5, `cfa1e7f`) |
| **2** | Film identity → product | **In progress** — Identity-D shipped (#4); Showtimes grouping shipped (#5); E2 remainder |
| **3** | Planner interactive refinement | **Design-first next** — Planner-R1 before engine/UI |
| **4** | Data expansion | AMC API audit, language/caption metadata, external metadata |
| **5** | Theater expansion + scraping audit | New sources and reliability |
| **6** | Leaving Soon re-evaluation | **Gated** on live `source_film_id` / `movieId` history + monthly stability |

Phase 1 and 2 can overlap lightly (e.g. time picker while designing Identity-D), but **do not ship Leaving Soon UI (PR F)** or **replace PR E artifact (PR E2)** until Phase 6 passes the model-quality gate.

---

## Decision log

Recorded decisions — do not re-litigate without new data.

| Date | Decision |
|------|----------|
| 2026-06 | Unified Planner replaces Double Feature / Marathon; legacy routes redirect only. |
| 2026-06 | PR E `leaving_soon_current.json` is **review-only**; listed in `vite.config.js` `PUBLIC_SKIP_FILES` — **not** shipped to GitHub Pages `dist/`. |
| 2026-06 | **PR E2** (weekly-rule artifact) and **PR F / UI** are **deferred** until monthly precision stability ≥ ~75% on held-out weeks. |
| 2026-06 | Weekly Leaving Soon labels (PR C2+) supersede tautological PR D/E rules for modeling. |
| 2026-06–07 | **Identity-A/B/C** shipped: audit → forward `source_film_id` / `source_title` → analysis-only parent keys in weekly labels (`9c1e1d7`). |
| 2026-07 | Parent-mode evaluation **did not** improve monthly stability (47.62% min precision title vs parent). **Does not justify** PR E2 or UI. |
| 2026-07-03 | **Identity-D shipped** (#4 `227f15a`): parent/variant fields in `showtimes_current.json`. **Identity-E partial** (#5 `3ca2bca`, fix `5405d59`): Showtimes parent/variant grouping live. **Showtimes mobile** (#6 `03673fd`, #7 `c0fab4a`). |
| 2026-07-03 | **Phase 1 complete** (`cfa1e7f`). Parent grouping now on live site for Showtimes; Planner pickers still title-keyed per variant. |
| 2026-07 | **`showtime_film_key` remains backward-compatible** (title slug). Parent/variant fields are **additive** on films and showtime rows. |
| 2026-07 | **Parent/variant grouping is live on Showtimes** (Identity-E partial). Planner film pickers and Recently Added still use per-variant keys until E2. |
| 2026-07 | Generated outputs under `data/analysis/` stay **gitignored**; do not commit unless part of an intentional data workflow. |
| 2026-07 | Historical git footprint lacks `amc_movie_id`; forward scrapes must accumulate **4–8 weeks** before re-running parent-mode evaluation. |
| 2026-07 | Do **not** auto-collapse double features or distinct programs when grouping variants. |

---

## Tracker summary

| ID | Item | Theme | Status | Phase | Priority |
|----|------|-------|--------|-------|----------|
| **P-01** | Parent/variant film grouping (product) | Identity & UX | **In progress** — D done, E partial | 2 | High |
| **P-13** | Showtimes mobile filter collapse | Showtimes mobile | **Done** (#6 `03673fd`) | 2 | Medium |
| **P-14** | Format / variant badge unification | Showtimes UX | **Done** (#7 `c0fab4a`) | 2 | Medium |
| **P-02** | Planner time selector UX | Planner mobile | **Done** (UX-1 `b55297d`) | 1 | High |
| **P-07** | iPhone screen-space optimization | Planner mobile | **Done** (UX-2–UX-5) | 1 | High |
| **P-08** | Preserve scroll position on filter toggle | Planner mobile | **Done** (UX-3 `16bfee6`) | 1 | Medium |
| **P-09** | AM/PM & next-day / midnight timing | Planner correctness | **Done** (UX-4 `f109025`) | 1 | Medium |
| **P-03** | AMC API exploration | Data expansion | **Investigating** (partial D5) | 4 | Medium |
| **P-04** | Interactive planner result refinement | Planner advanced | **Not started** | 3 | Medium |
| **P-05** | Additional metadata integrations | Data expansion | **Not started** | 4 | Low–Medium |
| **P-06** | Language & caption metadata | Data & filters | **Not started** | 4 | Medium |
| **P-10** | NW Film Forum + Central Cinema scraping | Theater expansion | **Not started** | 5 | Medium |
| **P-11** | Current scraping audit | Pipeline reliability | **Investigating** | 5 | Medium |
| **P-12** | Leaving Soon re-evaluation | Model (deferred product) | **Deferred** | 6 | Low until gate |

**Status values:** `Not started` · `Investigating` · `Designed` · `In progress` · `Blocked` · `Deferred` · `Done`

---

## Current focus (2026-07-03)

**Phase 1 (Planner mobile UX)** is **complete**. **Phase 2 (Identity)** is **in progress** — emit and Showtimes grouping shipped; finish E2, then start **Planner-R1** design.

| Track | Status | Next PR / action |
|-------|--------|------------------|
| **Identity-D** | **Done** (#4 `227f15a`) | — |
| **Identity-E (Showtimes)** | **Done** (#5 `3ca2bca`, fix `5405d59`) | Manual QA on parent cards + variant rows |
| **Identity-E2** | **Not started** | Planner picker grouping via `groupFilmsByParent()`; Recently Added parent dedup; share/search audit |
| **Showtimes mobile (#6, #7)** | **Done** | Collapsible filters; unified format/variant badges |
| **Planner-R1** | **Not started** | Design doc: complaint taxonomy, action model, near-miss definition, mobile wireframes |

**Recommended sequence**

1. **Identity-E2** — wire parent grouping into Planner film pickers and Recently Added (helper already exists in `plannerFilms.js`; Showtimes uses `groupMoviesByParent()`).
2. **Planner-R1** — docs-only design pass; can run in parallel with E2.
3. **Planner-R2+** — near-miss engine and result-card actions **after** R1 approved.

**Do not include in next PRs:** Leaving Soon UI (PR F), PR E2 artifact replacement, near-miss engine without R1 design, rewriting `showtime_film_key`.

**Validation gates**

- **E2:** `npm run test:frontend`; manual Planner picker + Recently Added QA; confirm share URLs still use `showtime_film_key`
- **R1:** design review only
- **R2+:** `plannerEngine.test.mjs`; parity QA; no regression on exact-match search

---

## Theme: Identity & film grouping

### P-01 — Parent/variant film grouping (product)

| Field | Value |
|-------|--------|
| **Status** | **In progress** — Identity-D shipped; Showtimes grouping shipped; E2 remainder |
| **User problem** | Sensory Friendly, Early Access, Fan Event, IMAX Opening Night, and similar variants appeared as **separate film cards** and planner entries. |
| **Proposed value** | One parent card with variant showtimes listed; cleaner search; unified footprint for Leaving Soon when model is ready. |
| **Current state** | `parent_film_key`, `parent_display_title`, `screening_variant_type`, etc. emitted in JSON (#4). Showtimes groups by parent via `groupMoviesByParent()` + `FilmVariantList` (#5). `groupFilmsByParent()` exists in `plannerFilms.js` but **Planner pickers do not use it yet**. Recently Added still keys on `showtime_film_key` only. |
| **Scope** | Group under parent: Sensory Friendly, Early Access, Fan Event, IMAX Opening Night, Anniversary, language/accessibility variants. Preserve exact variant as metadata. **Do not** collapse true double features or distinct programs. |
| **Dependencies** | Identity-D (**done**) → Identity-E Showtimes (**done**) → Identity-E2 (Planner, Recently Added, share audit). |
| **Risks** | Wrong merges (double features, Fathom events); share URLs keyed on `showtime_film_key`; Recently Added double-counting until E2. |
| **Next action** | **Identity-E2:** Planner `FilmMultiSelect` / `FilmSingleSelect` parent grouping; Recently Added dedup by `parent_film_key`; document share URL behavior. |
| **Links** | [film-identity-normalization.md](./film-identity-normalization.md) §5–7, `src/utils/plannerFilms.js`, `src/utils/showtimesPageEngine.js`, `reel_seattle/emit/current.py` |

**Staged implementation (from identity doc):**

| PR | Scope | Status |
|----|-------|--------|
| Identity-A | Variant audit | **Done** (`9785021`) |
| Identity-B | `source_film_id` / `source_title` forward | **Done** (`2534c14`) |
| Identity-C | Analysis-only parent weekly labels | **Done** (`9c1e1d7`) |
| Identity-D | Emit parent/variant fields in `showtimes_current.json` | **Done** (#4 `227f15a`) |
| Identity-E | Frontend grouping — Showtimes | **Done** (#5 `3ca2bca`, fix `5405d59`) |
| Identity-E2 | Planner picker, Recently Added, share/search audit | **Not started** |
| Identity-F | Leaving Soon artifact uses parent identity | **Deferred** (model gate) |

### P-13 — Showtimes mobile filter collapse

| Field | Value |
|-------|--------|
| **Status** | **Done** (#6 `03673fd`) |
| **Scope** | Collapsible filter bar on mobile Showtimes page — mirrors Planner UX-2 pattern. |
| **Links** | `src/pages/ShowtimesPage.jsx`, `src/App.css` |

### P-14 — Format / variant badge unification

| Field | Value |
|-------|--------|
| **Status** | **Done** (#7 `c0fab4a`) |
| **Scope** | Unified premium format and screening variant badge display on Showtimes film rows. |
| **Links** | `src/utils/showtimesDisplay.js`, `src/components/FilmShowtimeGroup.jsx` |

---

## Theme: Planner mobile UX & polish

### P-02 — Planner time selector UX

| Field | Value |
|-------|--------|
| **Status** | **Done** — UX-1 shipped (`b55297d`) |
| **User problem** | “Start after” / “Finish by” time picker overlay is **visually heavy and oversized** on mobile; feels clunky vs common time-picker patterns. |
| **Proposed value** | Smaller, cleaner control; faster selection; consistent with mobile UX best practices. |
| **Affected areas** | `src/components/PlannerTimePicker.jsx`, `src/pages/PlannerPage.jsx`, `App.css` / planner styles |
| **Dependencies** | None (UI-only). Coordinate with P-07 compact filter layout. |
| **Risks** | Regressing URL compact time format (`start` / `finish` params). |
| **Next action** | UX audit + mock: compact sheet, native `input type="time"` fallback, or hour/minute/AM-PM row with smaller footprint. |
| **Links** | [planner-ux-roadmap.md](./planner-ux-roadmap.md) §4 (shipped baseline); [unified-planner-design.md](./unified-planner-design.md) |

**Acceptance hints:** Smaller overlay; clear AM/PM; does not dominate viewport on iPhone; preserves shareable URL encoding.

---

### P-07 — iPhone screen-space optimization

| Field | Value |
|-------|--------|
| **Status** | **Done** — Phase 1 complete (UX-2 `1276a89`, UX-3 `16bfee6`, UX-5 result density) |
| **User problem** | Mobile planner spends too much vertical space on filters and results; hard to see a full plan on one screen. |
| **Proposed value** | User can view a complete plan without excessive scrolling when reasonable (2–3 films). |
| **Implemented** | UX-2: sticky summary chips; collapse filters after Find plans. UX-3: scroll retention. UX-5: compact result cards — horizontal film rows, smaller posters, hide redundant meta, 3-col stat row, shorter timeline. |
| **Manual QA** | iPhone 375px: 2–3 film plan fits with less scroll; share button ≥36px; `(+1)` labels still visible. |
| **Links** | [planner-ux-roadmap.md](./planner-ux-roadmap.md), [frontend-smoke-check.md](./frontend-smoke-check.md) |

---

### P-08 — Preserve scroll position

| Field | Value |
|-------|--------|
| **Status** | **Done** — UX-3 shipped (`16bfee6`) |
| **User problem** | Collapsing/expanding filters or results **jumps** scroll position — jarring on iPhone. |
| **Proposed value** | Stable viewport when toggling sections; controlled scroll to results after Find plans. |
| **Implemented (UX-3)** | `plannerScroll.js` helpers; collapse height compensation; sticky-offset scroll to results; `prefers-reduced-motion`. |
| **Caveats** | iOS address-bar resize may still shift viewport slightly; no `scrollRestoration` API override. |
| **Links** | [planner-ux-roadmap.md](./planner-ux-roadmap.md) |

---

### P-09 — AM/PM & next-day / midnight timing

| Field | Value |
|-------|--------|
| **Status** | **Done** — UX-4 shipped (`f109025`) |
| **User problem** | Minor issues when showtimes extend past midnight; AM/PM labels, gaps, and finish-by may be wrong. |
| **Proposed value** | Correct timelines, gap math, and labels across midnight on a single date row. |
| **Convention** | AM before 6:00 on same date → +1440 min; end times may exceed 1440; labels show `(+1)` when needed. |
| **Finish-by** | Early AM finish-by uses same +1440 rule (e.g. finish by 1:30 AM allows next-day endings). |
| **Links** | [unified-planner-design.md](./unified-planner-design.md), `tests/frontend/planner*.test.mjs` |

---

## Theme: Planner interactive refinement

### P-04 — Interactive planner result refinement

| Field | Value |
|-------|--------|
| **Status** | Not started — **design-first** (Planner-R1 before engine/UI) |
| **User problem** | Users get a plan but want small tweaks without re-running opaque searches from scratch. |
| **Proposed value** | Plan-level actions: reverse order, widen/tighten gap, exclude 3D, change theater, start later/earlier, pin/avoid films, see **near-miss** alternatives when filters are too strict. |
| **UX patterns to plan** | Result-card actions; swap order; loosen/tighten gap; exclude format; pin/avoid film; explain why near-misses failed. |
| **Dependencies** | Stable Phase 1 planner UX (**done**); Identity-E2 optional but improves picker UX before actions ship. **Sequencing:** Planner-R1 design doc first; no result-card UI before R1 approved. |
| **Risks** | Scope creep; confusing UX if near-miss explanations are wrong; mobile control density vs UX-5 compact cards. |
| **Next action** | **Planner-R1:** complaint taxonomy, action → URL state map, near-miss model, mobile wireframe notes — new doc `docs/planner-result-refinement-design.md`. |
| **Links** | [unified-planner-design.md](./unified-planner-design.md) §7 deferred ideas, [planner-ux-roadmap.md](./planner-ux-roadmap.md) |

---

## Theme: Data expansion & metadata

### P-03 — AMC API exploration

| Field | Value |
|-------|--------|
| **Status** | Investigating (PR D5 captured `movieId`, genre, rating, `sellUntil`, `movieUrl` on forward scrapes) |
| **User problem** | Unknown what additional AMC developer API data could improve UX, identity, and Leaving Soon. |
| **Proposed value** | Document endpoints/fields for metadata, identity, formats, captions, ticketing, coming-soon vs now-playing. |
| **Investigate** | [AMC Developers](https://developers.amctheatres.com/) — `movieId`, release date, cast/crew, genre, rating, runtime, auditorium, ticketing status, `sellUntilDateTimeUtc`, showtime attributes, premium formats, caption/accessibility, now-playing/advance views. |
| **Constraints** | **No live API calls** in repo unless keys already configured and safe. Prefer docs + fixture expansion + audit scripts. |
| **Next action** | Extend `reel_seattle/analysis/amc_metadata_audit.py` with endpoint checklist; update [leaving-soon-model-design.md](./leaving-soon-model-design.md) §4. |
| **Links** | `reel_seattle/adapters/amc.py`, `amc_metadata.py`, `tests/fixtures/adapters/amc_api_showtime_full.json` |

---

### P-05 — Additional metadata integrations (external)

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **User problem** | Showtimes lack rich context (popularity, box office, cast, awards, Letterboxd/TMDB-style data). |
| **Proposed value** | Better discovery and planner hints if legal, reliable, and maintainable. |
| **Candidates** | Box office, Letterboxd (if appropriate), ratings counts, TMDB-style metadata, language, country, runtime quality, awards/festival. |
| **Risks** | Licensing, API rate limits, stale data, scope creep. |
| **Next action** | Spike: legal/ToS review for 1–2 sources; cache strategy; **no user-facing fetch** until approved. |
| **Links** | — |

---

### P-06 — Language & caption metadata

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **User problem** | Users cannot filter for spoken language, subtitles, open captions, dubbed/subbed, or accessibility screenings. |
| **Proposed value** | Filters and badges on showtimes/planner when data exists. |
| **Sources** | AMC API attributes (TBD via P-03); indie theater pages; title heuristics; external metadata. |
| **Dependencies** | P-03 AMC audit; scraping audit (P-11) for indie pages |
| **Next action** | Inventory what AMC already exposes in scrape logs vs what appears on SIFF/Beacon pages. |
| **Links** | `special_screening_flags.py` (analysis-only title patterns today) |

---

## Theme: Theater expansion & pipeline

### P-10 — Additional theater scraping

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **Theaters** | [Northwest Film Forum](https://nwfilmforum.org/calendar/) · [Central Cinema](https://central-cinema.com/calendar) · future: Grand Illusion, others |
| **User problem** | Incomplete Seattle indie coverage. |
| **Next action** | Feasibility spike per site: HTML structure, rate limits, showtime fields, maintenance risk, `data/theaters.json` entry. |
| **Dependencies** | New adapter module pattern (`reel_seattle/adapters/`), schema consistency, daily workflow capacity. |
| **Links** | [SCRAPING_README.md](../SCRAPING_README.md), `reel_seattle/adapters/siff.py`, `beacon.py` |

---

### P-11 — Current scraping audit

| Field | Value |
|-------|--------|
| **Status** | Investigating |
| **Scope** | Metadata available on existing theater pages; reliability; parser fragility; performance; logging/diagnostics; schema consistency AMC vs indie. |
| **Next action** | Checklist pass on SIFF/Beacon/AMC adapters + `pipeline_report.json` gaps; document findings in a short audit note or this tracker. |
| **Links** | [SCRAPING_README.md](../SCRAPING_README.md), `daily_processor.py`, `.github/workflows/daily_scraping.yml` |

---

## Theme: Leaving Soon (deferred product)

### P-12 — Leaving Soon re-evaluation

| Field | Value |
|-------|--------|
| **Status** | **Deferred** — do not ship UI |
| **Gate** | Monthly precision stability ≥ ~75%; meaningful lift; product accepts low recall. |
| **Current model** | Best weekly rule ~97.5% test precision but **47.6%** monthly min; parent mode did not help (Identity-C). |
| **PR state** | PR E artifact **review-only**, excluded from Pages. **PR E2** and **PR F/UI blocked.** |
| **Next action** | Wait **4–8 weeks** of forward `source_film_id` / `movieId`; re-run `build_weekly_leaving_soon_labels.py --identity-mode parent` + `evaluate_weekly_leaving_soon_baselines.py --identity-mode compare`. |
| **Links** | [leaving-soon-model-design.md](./leaving-soon-model-design.md) §12–13, [film-identity-normalization.md](./film-identity-normalization.md) |

⚠️ **Do not ship** Leaving Soon badges, `/leaving-soon` page, or Pages dist inclusion until this item moves past **Deferred**.

---

## Idea intake template

Copy for new tracker items:

```markdown
### P-XX — [Short title]

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **User problem** | |
| **Proposed value** | |
| **Affected areas** | files / pages / pipeline |
| **Dependencies** | |
| **Risks** | |
| **Blockers** | |
| **Next action** | |
| **Links** | docs, issues, PRs |
```

---

## Completed / shipped (reference)

| Item | Note |
|------|------|
| Unified Planner v1 | Engine, URL state, redirects |
| Film multi-select, time picker v1, validation, Showtimes “Plan this film” | [planner-ux-roadmap.md](./planner-ux-roadmap.md) |
| Mock plan preview | [mock-plan-preview-implementation.md](./mock-plan-preview-implementation.md) |
| Phase 1 Planner mobile UX (UX-1–UX-5) | `b55297d` → `cfa1e7f` |
| Identity-D parent/variant JSON fields | #4 `227f15a` |
| Identity-E Showtimes parent/variant grouping | #5 `3ca2bca`, fix `5405d59` |
| Showtimes mobile collapsible filters | #6 `03673fd` |
| Showtimes format/variant badge unification | #7 `c0fab4a` |
| Identity-A/B/C | Analysis + forward source fields |
| Leaving Soon PR B–D5, weekly labels/eval | Modeling only; UI deferred |
| AMC metadata forward capture (D5) | `movieId`, genre, rating, etc. on new scrapes |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-03 | Roadmap refresh: Phase 1 complete; Identity-D/E partial shipped (#4–#7); next = Identity-E2 + Planner-R1. |
| 2026-07-02 | Phase 1 UX-5 shipped (`cfa1e7f`): compact mobile result cards and timeline density. |
| 2026-07-02 | Phase 1 UX-4 shipped (`f109025`): planner midnight/next-day extended minutes. |
| 2026-07-01 | Phase 1 UX-4: planner midnight/next-day extended minutes and regression tests. |
