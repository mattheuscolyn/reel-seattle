# Reel Seattle — Product Roadmap & Tracker

**Status:** Living document — update when priorities shift or work ships  
**Last updated:** 2026-07-01  
**Audience:** Maintainers, product direction, and Cursor agents

This is the **master tracker** for cross-cutting product work. Domain-specific roadmaps remain authoritative for depth:

| Doc | Scope |
|-----|--------|
| [planner-ux-roadmap.md](./planner-ux-roadmap.md) | Planner filter UX, picker patterns, mock preview |
| [unified-planner-design.md](./unified-planner-design.md) | Planner engine, URL contract, technical design |
| [film-identity-normalization.md](./film-identity-normalization.md) | Parent/variant identity, AMC `movieId`, staged Identity PRs |
| [leaving-soon-model-design.md](./leaving-soon-model-design.md) | Leaving Soon labels, evaluation gates, PR E/E2/F |
| [frontend-smoke-check.md](./frontend-smoke-check.md) | Manual QA checklist |
| [SCRAPING_README.md](../SCRAPING_README.md) | Daily scraping pipeline |

**Agent instructions:** Read this file before starting new product work. Update item **Status** and **Last touched** when work begins or ships. Add new ideas via the [Idea intake template](#idea-intake-template). Do not expand into **Deferred** or **Do not ship** items without explicit user approval.

---

## Recommended phases

Practical sequence based on current repo state (Identity-C analysis done; Leaving Soon blocked; frontend still title-keyed).

| Phase | Theme | Rationale |
|-------|--------|-----------|
| **0** | Tracker + UX audit | This document; quick audits of planner mobile layout and time picker (no code required for Phase 0) |
| **1** | Planner mobile UX polish | High user-visible impact; no pipeline/schema dependency |
| **2** | Film identity → product | Analysis-only parent logic exists; additive JSON then frontend grouping |
| **3** | Planner interactive refinement | Builds on stable planner UX from Phase 1 |
| **4** | Data expansion | AMC API audit, language/caption metadata, external metadata — informs identity + filters |
| **5** | Theater expansion + scraping audit | New sources and reliability before broad marketing |
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
| 2026-07 | **`showtime_film_key` remains backward-compatible** (title slug). Parent/variant fields are **additive** when emitted. |
| 2026-07 | **Parent/variant grouping is not unreliable** — it was **not scoped for frontend yet**. Logic exists in analysis only; live site still lists variants separately. |
| 2026-07 | Generated outputs under `data/analysis/` stay **gitignored**; do not commit unless part of an intentional data workflow. |
| 2026-07 | Historical git footprint lacks `amc_movie_id`; forward scrapes must accumulate **4–8 weeks** before re-running parent-mode evaluation. |
| 2026-07 | Do **not** auto-collapse double features or distinct programs when grouping variants. |

---

## Tracker summary

| ID | Item | Theme | Status | Phase | Priority |
|----|------|-------|--------|-------|----------|
| **P-01** | Parent/variant film grouping (product) | Identity & UX | **Designed** (analysis done) | 2 | High |
| **P-02** | Planner time selector UX | Planner mobile | **Done** (UX-1 `b55297d`) | 1 | High |
| **P-07** | iPhone screen-space optimization | Planner mobile | **In progress** (UX-2 implemented) | 1 | High |
| **P-03** | AMC API exploration | Data expansion | **Investigating** (partial D5) | 4 | Medium |
| **P-04** | Interactive planner result refinement | Planner advanced | **Not started** | 3 | Medium |
| **P-05** | Additional metadata integrations | Data expansion | **Not started** | 4 | Low–Medium |
| **P-06** | Language & caption metadata | Data & filters | **Not started** | 4 | Medium |
| **P-08** | Preserve scroll position on filter toggle | Planner mobile | **Not started** | 1 | Medium |
| **P-09** | AM/PM & next-day / midnight timing | Planner correctness | **Not started** | 1 | Medium |
| **P-10** | NW Film Forum + Central Cinema scraping | Theater expansion | **Not started** | 5 | Medium |
| **P-11** | Current scraping audit | Pipeline reliability | **Investigating** | 5 | Medium |
| **P-12** | Leaving Soon re-evaluation | Model (deferred product) | **Deferred** | 6 | Low until gate |

**Status values:** `Not started` · `Investigating` · `Designed` · `In progress` · `Blocked` · `Deferred` · `Done`

---

## Theme: Identity & film grouping

### P-01 — Parent/variant film grouping (product)

| Field | Value |
|-------|--------|
| **Status** | Designed (analysis); **not integrated** in frontend |
| **User problem** | Sensory Friendly, Early Access, Fan Event, IMAX Opening Night, anniversary, and language/accessibility variants appear as **separate film cards** and planner entries. |
| **Proposed value** | One parent card with variant showtimes listed; cleaner search; unified footprint for Leaving Soon when model is ready. |
| **Current state** | `reel_seattle/analysis/film_identity.py` + weekly labels `--identity-mode parent`. **No** `parent_film_key` in `showtimes_current.json` yet. **No** frontend grouping. |
| **Scope** | Group under parent: Sensory Friendly, Early Access, Fan Event, IMAX Opening Night, Anniversary, language/accessibility variants. Preserve exact variant as metadata (`source_title`, `screening_variant_type`). **Do not** collapse true double features or distinct programs. |
| **Dependencies** | Identity-D (emit additive fields in JSON) → Identity-E (frontend grouping). Forward `source_film_id` improves confidence. |
| **Risks** | Wrong merges (double features, Fathom events); share URLs keyed on `showtime_film_key`; Recently Added double-counting. |
| **Blockers** | Product design for card UX; optional wait for AMC `movieId` correlation on live scrapes. |
| **Next action** | Design Identity-D schema additions; prototype parent card + variant list in planner/showtimes (no ship until reviewed). |
| **Links** | [film-identity-normalization.md](./film-identity-normalization.md) §5–7, `src/utils/plannerFilms.js`, `reel_seattle/emit/current.py` |

**Staged implementation (from identity doc):**

| PR | Scope | Status |
|----|-------|--------|
| Identity-A | Variant audit | **Done** (`9785021`) |
| Identity-B | `source_film_id` / `source_title` forward | **Done** (`2534c14`) |
| Identity-C | Analysis-only parent weekly labels | **Done** (`9c1e1d7`) |
| Identity-D | Emit parent/variant fields in `showtimes_current.json` | **Not started** |
| Identity-E | Frontend grouping | **Not started** |
| Identity-F | Leaving Soon artifact uses parent identity | **Deferred** (model gate) |

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
| **Status** | **In progress** — UX-2 mobile summary bar + collapsible filters implemented |
| **User problem** | Mobile planner spends too much vertical space on filters; hard to see a full plan on one screen. |
| **Proposed value** | User can view a complete plan without excessive scrolling when reasonable (2–3 films). |
| **Implemented (UX-2)** | Sticky summary chips; collapse filter panels after Find plans on mobile; Find plans stays visible. |
| **Remaining** | UX-3 scroll retention; UX-5 result card density. |
| **Links** | [planner-ux-roadmap.md](./planner-ux-roadmap.md), [frontend-smoke-check.md](./frontend-smoke-check.md) |

---

### P-08 — Preserve scroll position

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **User problem** | Collapsing/expanding filters or results **jumps** scroll position — jarring on iPhone. |
| **Proposed value** | Stable viewport when toggling sections (best practice: preserve anchor or scroll restoration). |
| **Affected areas** | Planner filter panels, results section, possibly Showtimes filters |
| **Next action** | Reproduce on device/simulator; apply scroll-anchor or `scroll-margin` / focus management pattern. |
| **Links** | [planner-ux-roadmap.md](./planner-ux-roadmap.md) |

---

### P-09 — AM/PM & next-day / midnight timing

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **User problem** | Minor issues when showtimes extend past midnight; AM/PM labels, gaps, and end times may be confusing. |
| **Proposed value** | Correct timelines, gap math, and labels across midnight boundaries. |
| **Affected areas** | `plannerEngine.js`, time parsing/display utilities, `PlannerTimePicker`, result cards |
| **Dependencies** | P-02 time picker behavior |
| **Next action** | Add test cases for late-night / after-midnight showtimes; audit `time_24h` vs display labels. |
| **Links** | [unified-planner-design.md](./unified-planner-design.md), `tests/frontend/planner*.test.mjs` |

---

## Theme: Planner interactive refinement

### P-04 — Interactive planner result refinement

| Field | Value |
|-------|--------|
| **Status** | Not started |
| **User problem** | Users get a plan but want small tweaks without re-running opaque searches from scratch. |
| **Proposed value** | Plan-level actions: reverse order, widen/tighten gap, exclude 3D, change theater, start later/earlier, pin/avoid films, see **near-miss** alternatives when filters are too strict. |
| **UX patterns to plan** | Result-card actions; swap order; loosen/tighten gap; exclude format; pin/avoid film; explain why near-misses failed. |
| **Dependencies** | Stable Phase 1 planner UX; engine support for incremental constraints; possibly near-miss ranking in `plannerEngine.js`. |
| **Risks** | Scope creep; confusing UX if explanations are wrong. |
| **Next action** | **Design-only:** wireframes + action → URL state mapping; no implementation until approved. |
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
| Identity-A/B/C | Analysis + forward source fields |
| Leaving Soon PR B–D5, weekly labels/eval | Modeling only; UI deferred |
| AMC metadata forward capture (D5) | `movieId`, genre, rating, etc. on new scrapes |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-01 | Phase 1 UX-2: mobile planner filter summary bar + collapsible filters. |
