# Leaving Soon — Predictive Feature Design & Data Audit

**Status:** PR B/B2/C complete; PR D baseline evaluation ready; PR E pending review  
**Date:** 2026-06-30  
**Audience:** Maintainers evaluating whether to ship an AMC “Leaving Soon” signal

**Target update (2026-09-02):** The modeling goal is now **remaining theatrical lifetime** (calendar days until the final Seattle-area AMC showtime of the current source-native run), not Wednesday booking-extension failure. See [leaving-soon-lifecycle-audit.md](./leaving-soon-lifecycle-audit.md). Wednesday cadence remains a feature/process analysis. This document still describes the earlier weekly-label work; do not treat §1’s extension-failure question as the current label.

---

## 1. Product definition

### User value

**Leaving Soon** would warn Seattle-area moviegoers when an AMC film is **unlikely to receive another week of bookings** after the next AMC weekly schedule update (typically Wednesday afternoon PT).

The signal is **not** “no showtimes exist right now.” A film can have showtimes through Saturday and still be at risk of disappearing after Wednesday’s booking extension. The product question is closer to:

> Given this film’s current AMC footprint and recent trajectory, how likely is it to **fail to extend** into the following booking week after the next Wednesday update?

### Possible surfaces (later, only if model quality passes)

- Dedicated `/leaving-soon` page
- Showtimes section or filter (“Leaving soon at AMC”)
- Badge on film cards
- Sort key (“urgency”)

**Quality bar:** If evaluation does not meet the minimum thresholds in §7, **do not ship** UI. A misleading tag is worse than no tag.

### Scope for v1 modeling

- **AMC only** — SIFF/Beacon have different booking cadences and are out of scope for v1.
- **Seattle-area AMC set** — theaters enabled in `data/theaters.json` with `source: amc` (currently ~13 locations).
- **Film grain** — one score per `showtime_film_key` (normalized title slug), aggregated across the AMC theater set unless evaluation shows per-theater models are needed.

---

## 2. Current pipeline audit

### End-to-end flow

```text
amc_logger.py / run_daily_scraping.py
  → reel_seattle/adapters/amc.py (all currently announced future AMC showtimes)
  → data/daily_logs/YYYY-MM-DD_amc.json (normalized RawShowtime snapshot)
  → public/showtimes.csv (legacy AMC CSV, past + current/future)
  → daily_processor.py (merge into history, emit JSON)
  → data/history/showtimes_history.csv (canonical history)
  → public/data/showtimes_current.json (frontend, 14-day viewing window)
```

| Stage | Location | Role |
|-------|----------|------|
| AMC fetch | `reel_seattle/adapters/amc.py` | Paginated `GET /v2/theatres/{id}/showtimes` (no date) per enabled theater — all currently announced future showtimes. See [amc-all-announced-showtimes.md](./amc-all-announced-showtimes.md). |
| Raw snapshot | `data/daily_logs/YYYY-MM-DD_amc.json` | Per-scrape normalized records + `generated_at`; **not** truncated to 14 days |
| Legacy CSV | `public/showtimes.csv` | AMC-only; past rows retained, future restated |
| Canonical history | `data/history/showtimes_history.csv` | All sources; **not** shipped to browser; may include far-future AMC rows |
| Frontend artifact | `public/data/showtimes_current.json` | Built by `reel_seattle/emit/current.py`; public viewing horizon remains 14 days |
| Freshness | `public/data/pipeline_report.json` | Per-source status for Showtimes UI |

### Canonical vs forward-looking sources

| Purpose | Source |
|---------|--------|
| **Historical modeling (AMC)** | `data/history/showtimes_history.csv` |
| **Point-in-time snapshots (AMC)** | `data/daily_logs/YYYY-MM-DD_amc.json` (intended daily commit via GitHub Actions) |
| **Browser / app** | `public/data/showtimes_current.json` only |
| **First-seen / last-seen film×theater** | `public/data/movies_announcements.csv` (pipeline only, not in browser) |

### Related docs

| Doc | Relevance |
|-----|-----------|
| `SCRAPING_README.md` | Pipeline overview, history schema, AMC restate semantics |
| `schema/showtime/v1.0.0.json` | Target normalized showtime shape |
| `schema/showtimes_current/v1.0.0.json` | Frontend artifact contract |
| `docs/frontend-smoke-check.md` | QA; no Leaving Soon yet |
| `docs/unified-planner-design.md` | Planner uses `showtimes_current.json`; orthogonal to Leaving Soon |

### Critical pipeline behavior: AMC restate

From `daily_processor.py` / `SCRAPING_README.md`:

- Each daily run **deletes all AMC history rows with `show_date >= today`** and replaces them with the latest scrape.
- **Past** AMC show dates are **never** removed.
- If a scrape returns zero future AMC rows but history has future AMC rows, restate is **skipped** (safety guard).

**Implication for modeling:** `showtimes_history.csv` holds **at most one forward-looking AMC snapshot** (the latest restate). It does **not** preserve how far into the future a film’s bookings extended on prior scrape days. Trajectory features (horizon shrinkage, week-over-week contraction) require **daily snapshot logs** or a new derived snapshot table.

---

## 3. Historical data field audit

### History CSV columns (`HISTORY_FIELDNAMES`)

| Field | Available | Notes |
|-------|-----------|-------|
| `Date`, `Time`, `time_24h` | Yes | Show date/time; `time_24h` for prime-time features |
| `Theater`, `theater_id` | Yes | Resolved via `data/theaters.json` |
| `Film`, `showtime_film_key` | Yes | Title + normalized slug |
| `Runtime` | Yes | Often populated for AMC |
| `isAlmostSoldOut` | Yes | Sparse; maps to `sold_out` in JSON |
| `isCanceled` | Yes | Canceled rows in history; excluded from `showtimes_current.json` |
| `premiumFormat` | Yes | IMAX, Dolby, 3D, etc. |
| `hasTrailers`, `maximumIntendedAttendance` | Yes | Sparse in practice |
| `posterDynamic` | Yes | Poster URL |
| `first_seen_date` | Yes | Set when row first added (YYYY-MM-DD) |
| `last_updated` | Yes | Scrape run date when row last restated in forward window |
| `source` | Yes | `amc` for AMC rows |

**Not in history:** AMC `movieId`, genre, MPAA rating, release date, `sellUntil`, auditorium id, ticketing URLs, scrape timestamp per row, explicit “removed from API” events.

### Scale (local clone, 2026-06-30)

| Metric | Value |
|--------|-------|
| Total history rows | ~344k |
| AMC rows | ~340k |
| Distinct AMC `last_updated` dates | ~336 |
| AMC films currently in forward window | ~50 |
| Films with last show date before today (ended) | ~1,100 |
| AMC daily logs in git | 1 file (`2026-06-29_amc.json`) — workflow commits `data/daily_logs/` daily; local clone may lag |

### Reconstructible per film × scrape date?

| Question | From history alone | From daily_logs (when retained) |
|----------|-------------------|--------------------------------|
| Theaters carrying film | Partial | Yes |
| Showtimes per day | Partial (past dates frozen) | Yes |
| Showtimes by theater | Partial | Yes |
| First / last show date (ever observed) | Yes | Yes |
| Furthest future show date **at snapshot T** | **No** (forward snapshot overwritten) | Yes |
| Extends beyond current week | Only for latest snapshot | Yes per snapshot |
| Weekend / prime-time coverage | Yes (from `Date` + `time_24h`) | Yes |
| Week-over-week expansion/contraction | **No** for forward horizon | Yes |

**Partial:** Past show dates remain in history, so retrospective features for **ended** films are possible. Forward-horizon trajectory at arbitrary past anchors is **incomplete** without snapshots.

### Daily log fields (`RawShowtime` → JSON)

Each `data/daily_logs/YYYY-MM-DD_amc.json` record includes:

- `theater_name_raw`, `date_raw`, `time_raw`, `title_raw`
- `runtime_raw`, `poster_url_raw`, `canceled`, `almost_sold_out`, `format_raw`
- `source_showtime_id` (AMC showtime id)
- `attributes.has_trailers`, `attributes.maximum_intended_attendance`, `attributes.premium_format_raw`
- Envelope: `generated_at`, `source`, `stats`, `warnings`, `errors`

**Not persisted:** AMC `movieId`, `genre`, `movieUrl`, `sellUntilDateTimeUtc`, auditorium, seat availability, collection `lastUpdatedDateUtc`.

### Announcements artifact

`movies_announcements.csv`: `Film`, `Theater`, `first_announced_date`, `last_seen_date` — per **film×theater**, not film-region aggregate. Useful for lifecycle but updated on appearance in scrape, not on removal.

---

## 4. AMC API — captured vs ignored fields

### Currently mapped (`api_showtime_to_raw`)

| API field | Stored |
|-----------|--------|
| `showDateTimeLocal` | `date_raw`, `time_raw` |
| `movieName` | `title_raw` |
| `runTime` | `runtime_raw` |
| `media.posterDynamic` | `poster_url_raw` |
| `isCanceled` | `canceled` |
| `isAlmostSoldOut` | `almost_sold_out` |
| `premiumFormat` | `format_raw` + `attributes.premium_format_raw` |
| `hasTrailers` | `attributes.has_trailers` |
| `maximumIntendedAttendance` | `attributes.maximum_intended_attendance` |
| `id` | `source_showtime_id` |
| `movieId` | `attributes.movie_id` (PR D5; forward-only) |
| `movieUrl` | `attributes.movie_url` (PR D5) |
| `sellUntilDateTimeUtc` | `attributes.sell_until_utc` (PR D5) |
| `genre` | `attributes.genre` (PR D5) |
| `rating` | `attributes.mpaa_rating` (PR D5) |

### Ignored but potentially useful (per AMC v2 docs / public examples)

| Field | Modeling value |
|-------|----------------|
| `movieId` | Stable film identity across title variants |
| `genre` | Genre lifecycle priors |
| `movieUrl` / Movies API `releaseDateUtc` | Release age |
| `sellUntilDateTimeUtc` | Ticketing cutoff signal |
| `performanceNumber`, `internalReleaseNumber` | Low priority |
| Auditorium / screen attributes | Format prestige |
| Ticketing / seat availability | Demand proxy |
| Collection `lastUpdatedDateUtc` | Schedule publish timing |
| Movies views: `now-playing`, `advance`, `coming-soon` | Advance vs limited booking |
| `hasScheduledShowtimes` (Movies API) | Explicit booking flag |

### Raw response retention

**Full raw AMC JSON is not saved today.** Only normalized `RawShowtime` records go to daily logs.

**Recommendation:** Add optional **sample capture** without bloating the repo:

- `tests/fixtures/adapters/amc_api_showtime_full.json` — full showtime object with movieId/sellUntil (PR D5)
- `data/samples/amc/` — gitignored or size-capped; CI scraper writes **one** weekly tarball to Actions artifacts (not committed)
- Extend `RawShowtime` / daily log schema incrementally when new fields prove useful

---

## 5. Proposed target label (v1)

### Recommended v1 label: **Wednesday-extension failure (binary)**

**Prediction anchor:** `T` = timestamp of a daily AMC scrape (prefer **Tuesday evening** or **Wednesday morning** PT scrape, before the afternoon booking drop).

**Observation window at T:** Use only showtimes visible in the AMC snapshot at `T` (from daily log or reconstructed forward rows with `last_updated == scrape_date(T)`).

**Label horizon:** Let `W` = the **Wednesday booking update** immediately after `T` (calendar Wednesday in America/Los_Angeles). Let `E` = end of the **following calendar week** (Sunday) after that Wednesday — i.e. the week AMC would extend into if the film survives.

**Positive label (`leaving_soon = 1`):** Film has **≥1** Seattle AMC showtime with `show_date ∈ [T, T+7]` visible at `T`, but has **zero** Seattle AMC showtimes with `show_date ∈ (max_show_date_at_T, E]` visible in the **first successful scrape on or after Wednesday 15:00 PT** (or Thursday 06:00 PT daily scrape if only one run/day).

**Negative label (`leaving_soon = 0`):** Film receives **≥1** new showtime dated after `max_show_date_at_T` in that post-Wednesday snapshot.

**Ambiguous / exclude:** Film already has zero showtimes at `T`; scrape failure; World Cup / Fathom one-night events; film never had Seattle AMC showtimes.

### Why this target

- Matches user mental model: “Will it survive **next week’s** booking extension?”
- Anchors explicitly to **Wednesday update** behavior
- Avoids trivial positives (“no showtimes left” when film already ended)

### Leakage rules

| Allowed at T | Forbidden at T |
|------------|----------------|
| Showtimes in snapshot ≤ T | Any snapshot with `generated_at > T` |
| `first_seen_date` ≤ T | Future `last_seen_date` from announcements |
| Past show dates < T | Post-Wednesday show dates for labeling |

### Alternatives considered

| Target | Pros | Cons |
|--------|------|------|
| **Survival ≥14 days** | Simple | Conflates limited booking window with leaving |
| **Time-to-event** | Rich | Harder to explain; needs more snapshots |
| **3-class risk buckets** | Better UX | Needs more data for calibration |
| **Per-theater leave** | Granular | Noisy; user cares about “any AMC” |

**v1:** binary label + optional **high-confidence-only** UI bucket later.

### Label feasibility with **current** data

| Data source | Can build v1 labels? |
|-------------|---------------------|
| `showtimes_history.csv` alone | **Partial** — good for ended-film retrospectives; **insufficient** for clean forward-horizon labels |
| `data/daily_logs/` (≥8–12 weeks retained) | **Yes** — primary path going forward |
| Git history backfill (`public/data/daily_logs/*_amc_showtimes.csv`) | **Yes** — ~342 snapshots recoverable (2025-07-11 → 2026-06-29) via PR B2 |
| Going forward + backfill | Commit daily JSON logs; backfill historical footprints from Git |

---

## 6. Candidate features

| Family | Examples | v1 status |
|--------|----------|-----------|
| **Current footprint** | `theater_count`, `showtime_count`, `days_with_showtimes`, weekend count | **Derivable** from daily log snapshot |
| **Daily allocation** | showtimes/day histogram, prime-time share (17:00–22:00), matinee share | **Derivable** (`time_24h`) |
| **Trajectory** | Δ theaters, Δ showtimes, Δ max_show_date vs prior snapshot | **Requires pipeline change** (snapshots series) |
| **Lifecycle** | `days_since_first_seen`, weeks in AMC, release age | **Partial** — `first_seen_date`; release needs `movieId` + Movies API |
| **Booking horizon** | `max_show_date`, days until max, gap days in schedule | **Derivable** per snapshot |
| **Format mix** | premium format share, IMAX/Dolby flags | **Derivable** |
| **Theater mix** | Pacific Place presence, suburban-only | **Derivable** |
| **Film metadata** | runtime, genre, rating | **Partial** — runtime yes; genre/rating need API |
| **Calendar** | week-of-year, holiday proximity, Wednesday distance | **Derivable** |
| **Competition** | new AMC titles that week | **Requires snapshot index** |
| **Demand proxies** | `isAlmostSoldOut` rate | **Sparse** |
| **Scrape health** | source `success` vs `stale` | **Derivable** from `pipeline_report` / log presence |

**Not worth v1:** cross-source features, TMDB/Letterboxd (no integration today), seat-level models, per-auditorium models.

---

## 7. Evaluation plan (before any frontend work)

### Data splits

- **Time-based only** — never random row splits.
- **Train:** oldest 60% of Wednesday anchor weeks  
- **Validation:** next 20%  
- **Test:** most recent 20% (hold out until ship decision)
- Exclude scrape-failure days and known pipeline skip days from anchors.

### Baselines

1. **Always negative** — no tag (measure false alarm rate of any model)
2. **Naive horizon:** `max_show_date ≤ anchor + 4 days` → leaving soon
3. **Naive footprint:** `theater_count == 1 AND showtime_count ≤ N`
4. **Naive week boundary:** no showtimes dated in the week after `max_show_date`
5. **First-seen age:** `days_since_first_seen > 28` → leaving soon

### Candidate models (v1)

| Model | Role |
|-------|------|
| Heuristic ensemble of 2–3 rules | Interpretable floor |
| **Logistic regression** | **Recommended v1** — explainable coefficients, works with ~50–200 positives |
| Gradient boosted trees (XGBoost/LightGBM) | v2 if data grows |
| Survival (Cox/discrete-time) | v2 if snapshot density improves |

### Metrics

| Metric | Use |
|--------|-----|
| **Precision@k** / precision at fixed recall | Primary — false “Leaving Soon” alarms annoy users |
| **Recall@high-precision** | Catch films that actually leave |
| **PR-AUC** | Imbalanced positives |
| **Calibration** (reliability diagram) | For confidence thresholds |
| **Segmented performance** | By `theater_count`, `days_since_first_seen`, blockbuster vs limited |

### Product consequences

| Error | Impact |
|-------|--------|
| **False positive** | Users rush unnecessarily; trust erodes |
| **False negative** | Missed urgency; less harmful if we show no tag |

→ **Optimize for precision**; accept lower recall.

### Minimum quality bar to ship UI

Proposed gates (tune after first backtest):

| Gate | Threshold |
|------|-----------|
| Precision on **high-confidence** bucket | **≥ 0.75** on held-out test weeks |
| Coverage | High-confidence bucket covers **≥ 15%** of films at risk OR **≥ 5 films/week** minimum |
| Beat best naive baseline | **≥ 10 pp** precision at equal recall |
| Stability | No single week accounts for >40% of errors |
| Calibration | Predicted 0.8 bin has empirical positive rate 0.65–0.90 |

**UI rule:** Show tag only when `P(leaving) ≥ 0.75` (configurable). Otherwise show **nothing** — no “maybe leaving.”

### Backtest deliverable

Script output (not committed to repo):

- `analysis/leaving_soon_backtest/report.md`
- Per-week precision/recall table
- Error analysis: top false positives / false negatives
- Feature coefficient or SHAP summary

---

## 8. Data collection improvements

| Change | Location | Priority |
|--------|----------|----------|
| **Retain all daily AMC logs** | `data/daily_logs/` (committed by Actions) | **P0** — already wired; verify retention |
| **Film-day footprint snapshot table** | `data/analysis/amc_film_footprint_daily.csv` (gitignored) | **P0 — PR B implemented** |
| **Persist `movieId`** | `RawShowtime` + history column | **P1** |
| **Snapshot `generated_at` on footprint rows** | footprint table | **P0** |
| **Explicit removal events** | Derived: film in snapshot T, absent T+1 | **P1** |
| **Wednesday afternoon scrape** (optional second daily run) | GitHub Actions cron | **P2** — better label alignment |
| **Weekly raw API sample** | Actions artifact, not repo | **P2** |
| **Canceled showtimes in footprint** | Include count; don’t drop silently | **P2** |
| **`leaving_soon_current.json`** | `public/data/` | **Only after evaluation passes (PR E)** |

### Footprint table (PR B — implemented)

**Script:** `scripts/build_amc_film_footprint.py`  
**Library:** `reel_seattle/analysis/amc_footprint.py`  
**Input:** `data/daily_logs/*_amc.json` (normalized scrape logs)  
**Output:** `data/analysis/amc_film_footprint_daily.csv` (**gitignored**)

**Scope:** All **enabled** AMC theaters in `data/theaters.json` (v1 full registry allowlist; can narrow to a Seattle-core subset later without schema changes).

**Grain:** One row per **`snapshot_date` × `showtime_film_key` × `show_date`**.

Film-level snapshot columns (`min_show_date_visible_for_film_at_snapshot`, `max_show_date_visible_for_film_at_snapshot`, etc.) are duplicated on each show-date row for convenient modeling joins.

**Generated columns (31):**

`snapshot_date`, `snapshot_timestamp`, `source`, `showtime_film_key`, `film_title`, `amc_movie_id`, `show_date`, `days_from_snapshot_to_show_date`, `theater_count`, `showtime_count`, `canceled_count`, `active_showtime_count`, `almost_sold_out_count`, `first_show_time`, `last_show_time`, `has_matinee`, `has_primetime`, `has_late`, `has_weekend_show`, `format_list`, `premium_format_count`, `theater_list`, `min_show_date_visible_for_film_at_snapshot`, `max_show_date_visible_for_film_at_snapshot`, `visible_show_date_count_for_film_at_snapshot`, `total_visible_showtimes_for_film_at_snapshot`, `total_visible_theaters_for_film_at_snapshot`, `first_snapshot_seen_for_film`, `snapshots_seen_count_for_film`, `event_like_flag`, `event_like_reason`

**Event / one-night titles:** Not removed. `event_like_flag` + `event_like_reason` mark likely event films (`title_pattern`, `sparse_single_venue_day`) for filtering in PR C.

**Limitations (current daily logs):**

- `amc_movie_id` is blank (not captured by adapter today).
- Only **one AMC daily log** in this clone at audit time → lifecycle fields (`snapshots_seen_count_for_film`) are trivial until more logs accumulate.
- Single daily scrape (~06:00 UTC) may blur Wednesday schedule-update timing; recommend a **second Wednesday PM scrape** later (not in PR B).
- Footprint summarizes **visibility per snapshot only** — no labels, no forward outcomes.

**Run:**

```bash
python scripts/build_amc_film_footprint.py
python scripts/build_amc_film_footprint.py --input-dir data/daily_logs --output data/analysis/amc_film_footprint_daily.csv
```

**Tests:** `tests/analysis/test_amc_footprint.py` with `tests/fixtures/analysis/amc_footprint_mini.json`

### Git-history footprint backfill (PR B2)

**Script:** `scripts/extract_amc_snapshots_from_git.py`  
**Libraries:** `reel_seattle/analysis/git_amc_snapshots.py`, `reel_seattle/analysis/legacy_amc_csv.py`  
**Output:** `data/analysis/amc_film_footprint_from_git.csv` (**gitignored**)  
**Inventory:** `data/analysis/amc_snapshot_inventory.csv` (**gitignored**)

Git commit history retains historical AMC snapshots even when the working tree only has recent `data/daily_logs/*_amc.json` files. A read-only audit found **~342 usable snapshots** from **2025-07-11** through **2026-06-29** (~12 missing days in that span).

**Source precedence (per snapshot date):**

1. `public/data/daily_logs/YYYY-MM-DD_amc_showtimes.csv` — legacy archive (best; point-in-time when filtered)
2. `public/showtimes.csv` at the matching daily commit — gap-fill (e.g. 2026-05-23 → 2026-05-29)
3. `data/daily_logs/YYYY-MM-DD_amc.json` — normalized JSON (current/future path)

Legacy archive CSVs include cumulative past rows. The extractor keeps only rows with **`show_date >= snapshot_date`** before footprint derivation.

**Schema caveats:**

- Older archive CSVs (~10 columns) lack `isCanceled`, `premiumFormat`, and AMC `movieId`.
- Expanded `public/showtimes.csv` (~14 columns) adds status/format fields but still no `movieId`.
- JSON logs include richer `RawShowtime` fields and `generated_at`; preferred going forward.

**Run:**

```bash
python scripts/extract_amc_snapshots_from_git.py --every-n 30   # quick sample
python scripts/extract_amc_snapshots_from_git.py                # full historical run
python scripts/extract_amc_snapshots_from_git.py --inventory-only
```

**Tests:** `tests/analysis/test_legacy_amc_csv.py`, `tests/analysis/test_git_amc_snapshots.py`

### Leaving Soon labels (PR C)

**Script:** `scripts/build_leaving_soon_labels.py`  
**Library:** `reel_seattle/analysis/leaving_soon_labels.py`  
**Input:** `data/analysis/amc_film_footprint_from_git.csv` (default)  
**Output:** `data/analysis/leaving_soon_labels.csv` (**gitignored**)  
**Summary:** `data/analysis/leaving_soon_label_summary.json` (**gitignored**)

**v1 label: Wednesday-extension failure (binary)**

For each film at anchor snapshot `T` (default: **Tuesday or Wednesday**):

1. Require active visible showtimes at or after `T` (`min_active_showtimes`, default 1).
2. `anchor_max_show_date` = furthest show date visible for the film at `T`.
3. Find the first post-update snapshot after `T`, preferably **Thursday or Friday** within `max_post_update_gap_days` (default 4) after the relevant **Wednesday** booking update.
4. `post_update_max_show_date` = furthest show date for the film in that snapshot (blank if absent).
5. `extended_after_update = true` when `post_update_max_show_date > anchor_max_show_date`.
6. `leaving_soon_label = true` when the film **fails** to extend (`extended_after_update = false`).

**Leakage prevention:** Predictor fields are copied from the **anchor snapshot only**. Post-update fields (`post_update_*`, `extended_after_update`, `leaving_soon_label`) are outcomes for labeling/backtesting — not model inputs.

**Exclusions / non-labeled rows (`label_status`):**

| Status | Meaning |
|--------|---------|
| `labeled` | Valid anchor + post-update; binary label assigned |
| `missing_post_update_snapshot` | No Thu/Fri snapshot within gap after relevant Wednesday |
| `event_like_excluded` | `event_like_flag` at anchor (default: excluded from training) |
| `insufficient_current_showtimes` | No active showtimes at/after anchor |

**Limitations:**

- Daily scrape is ~06:00 UTC (~10 PM PT prior evening); Wednesday-morning anchors may still predate the afternoon booking drop. Optional Wed PM scrape remains a future improvement.
- 12 missing snapshot days in Git history → some anchors cannot be labeled.
- Legacy CSV snapshots lack `amc_movie_id`; title-key identity may split variants.
- Films already at zero forward horizon at anchor are excluded.

**Run:**

```bash
python scripts/build_leaving_soon_labels.py
python scripts/build_leaving_soon_labels.py --input data/analysis/amc_film_footprint_from_git.csv
```

**Tests:** `tests/analysis/test_leaving_soon_labels.py` with `tests/fixtures/analysis/leaving_soon_footprint_mini.csv`

### Baseline evaluation (PR D)

**Script:** `scripts/evaluate_leaving_soon_baselines.py`  
**Library:** `reel_seattle/analysis/leaving_soon_eval.py`  
**Input:** `data/analysis/leaving_soon_labels.csv` (default)  
**Outputs (gitignored):**

- `data/analysis/leaving_soon_baseline_report.json`
- `data/analysis/leaving_soon_baseline_report.md`
- `data/analysis/leaving_soon_baseline_predictions.csv` (best rule)

**Approach:**

- Evaluate explainable heuristics only (no ML training).
- Predictors: anchor-time footprint fields only (`days_until_anchor_max_show_date`, theater/showtime counts, weekend/primetime flags, etc.).
- Forbidden predictors: `post_update_*`, `extended_after_update`, `leaving_soon_label`.
- Time-aware splits by anchor date: **60% train / 20% validation / 20% held-out test**.
- Select high-confidence rules on validation (`precision ≥ 0.75`, `coverage ≥ 0.05`, `lift ≥ 1.05` over base rate).
- Report monthly precision/coverage stability.

**Baseline heuristics evaluated:**

- Always positive / always negative
- Booking horizon thresholds (`horizon_le_N`)
- Weak footprint (`showtimes_le_N`, `theaters_le_N`, `visible_dates_le_N`)
- No weekend / no primetime coverage
- Combined rules (short horizon + low theaters/showtimes/no weekend)
- Score-style weak-footprint sum with thresholds

**Quality gates (§7):**

| Gate | Result (2026-06-30 full run) |
|------|------------------------------|
| High-confidence precision ≥ 0.75 (held-out test) | **Pass** — best rule 91.6% |
| Coverage ≥ 5% | **Pass** — 22.2% |
| Lift over base rate (77.6%) | **Marginal** — 1.16× (not +10 pp at equal recall) |
| Monthly stability | **Mostly pass** — monthly precision 84–99% for best rule |
| Beat always-positive at equal recall | **Fail** — base rate already ~78% |

**Full historical run findings (2026-06-30):**

| Metric | Value |
|--------|-------|
| Labeled rows | 4,930 |
| Base positive rate | **77.6%** |
| Best validation rule | `visible_dates_le_1` (only one visible show date at anchor) |
| Held-out test precision | **91.6%** |
| Held-out test recall | 25.8% |
| Held-out test coverage | 22.2% |
| Held-out test lift | **1.16×** |
| Held-out false positives | 17 |

**Interpretation:**

- A **high-precision, interpretable subset exists**: films with only one visible show date at anchor are often truly leaving soon.
- **Lift over the naive always-positive baseline is modest** because most films already fail to extend in this label definition (~78% positive).
- The 75% precision ship bar is **necessary but not sufficient**; the signal is usable only as a **narrow high-confidence bucket**, not a broad tag.
- False positives include limited-run anniversary screenings with a single visible date but longer horizons; false negatives include films with short horizons that still extend.

**Recommendation:** `proceed_with_caution` — PR E may prototype a current artifact using `visible_dates_le_1` (or similar), but **do not ship UI (PR F)** until product review accepts low recall and modest lift. Consider label refinement and Wednesday PM scrape before wider rollout.

**Run:**

```bash
python scripts/evaluate_leaving_soon_baselines.py
```

**Tests:** `tests/analysis/test_leaving_soon_eval.py`

### What stays out of `public/data/`

Do **not** ship model scores to the browser until PR E passes evaluation. Keep modeling artifacts under `data/analysis/` or `analysis/` (gitignored via `.gitignore`).

---

## 9. Staged PR roadmap

| PR | Scope | Status |
|----|-------|--------|
| **A** | Design audit (`docs/leaving-soon-model-design.md`) | **Done** |
| **B** | `scripts/build_amc_film_footprint.py` + tests | **Done** |
| **B2** | `scripts/extract_amc_snapshots_from_git.py` + tests | **Done** |
| **C** | `scripts/build_leaving_soon_labels.py` + tests | **Done** |
| **D** | `scripts/evaluate_leaving_soon_baselines.py` + tests | **Ready** |
| **E** | `public/data/leaving_soon_current.json` emitter (only if §7 gates pass) | **Review** — cautious proceed |
| **F** | Showtimes UI — badge, section, sort | Only if E passes |

**Do not start PR F** until PR D report is reviewed and accepted.

---

## 10. Feasibility verdict

### Is this idea feasible?

| Aspect | Verdict |
|--------|---------|
| **Product fit** | Strong — distinct from “no showtimes” |
| **With history CSV alone** | **Insufficient** for rigorous Wednesday-extension labels |
| **With daily logs + footprint table** | **Feasible** for v1 heuristic / logistic model |
| **With Git-history backfill (~342 snapshots)** | Reasonable first backtest now (PR B2) |
| **With 6+ months** | Better calibration and segment stability |

### Biggest blockers / risks

1. **AMC restate overwrites forward snapshots in history** — trajectory is lost unless daily logs are used.
2. **Sparse daily log history in working tree** — mitigated by PR B2 Git-history extractor (~342 snapshots).
3. **Wednesday timing** — single 06:00 UTC scrape may miss afternoon update; labels may be noisy until an optional Wed PM run exists.
4. **Title identity** — `showtime_film_key` may split variants (e.g. sensory screenings); `movieId` would help.
5. **Class imbalance** — few positives per week; metrics must be precision-focused.
6. **Event films** — one-night Fathom / World Cup matches behave differently; may need exclusion rules.
7. **Scrape failures** — safety guard preserves stale forward data; labels must detect stale snapshots.

### Open questions for human review

1. **UI copy:** “Leaving soon” vs “Last chance this week at AMC” — legal/brand tone?
2. **Geography:** All enabled AMC theaters in registry, or a core Seattle subset?
3. **Second daily scrape:** Worth adding ~Wed 21:00 PT for cleaner labels?
4. **Ship threshold:** Is 75% precision at high-confidence acceptable, or higher?
5. **Include Beacon/SIFF later?** Different booking semantics.

---

## 11. Recommended next PR

**PR E (optional, cautious):** `public/data/leaving_soon_current.json` emitter applying the best validated heuristic (`visible_dates_le_1` or successor) to the latest AMC footprint — **modeling/pipeline only**, no UI.

**Prerequisite:** Regenerate labels and re-run evaluation after new daily snapshots:

```bash
python scripts/extract_amc_snapshots_from_git.py
python scripts/build_leaving_soon_labels.py
python scripts/evaluate_leaving_soon_baselines.py
```

**Do not start PR F (UI)** until product accepts:

- Low recall (~26% on held-out test for best high-confidence rule)
- Modest lift (1.16×) over an already-high base positive rate
- Residual false positives on limited-run / anniversary titles

**Provisional ship bar (not approval to ship UI):** ≥75% precision on high-confidence bucket **and** meaningful lift over base rate. PR D shows precision passes but lift is marginal — treat UI as **deferred pending review**, not green-lit.

---

## 12. Milestone status & PR E readiness

### Current milestone (2026-06-30)

| Item | State |
|------|--------|
| PR A design audit | Done |
| PR B footprint derivation | **Done** — `edbf473` |
| PR B2 Git-history extractor | **Done** — `f2f639f` |
| PR C label builder | **Done** — `9f5a2f8` |
| PR D baseline evaluation | **Done** — `c991d4b` |
| PR E current artifact | **Review-only** — tautological rule; excluded from Pages |
| PR C2 weekly labels | **Done** — booking-cycle analysis + weekly-extension labels |
| Generated outputs | `data/analysis/` gitignored |

### PR E — current artifact (product review)

**Rule:** `visible_dates_le_1` only — non-event AMC films with exactly one visible play date in the current `showtimes_current` window.

**Emit:**

```bash
python scripts/build_leaving_soon_current.py
# or via daily_processor.py after showtimes_current
```

**Output:** `public/data/leaving_soon_current.json` — high-confidence **risk signals**, not guarantees. Method block carries held-out PR D metrics and disclaimer.

**Shipping:** Artifact is committed with daily scraping (same convention as `newly_added_current.json`) but listed in `vite.config.js` `PUBLIC_SKIP_FILES` so it does **not** ship to GitHub Pages until PR F wires frontend consumption.

### PR E readiness checklist

- [x] PR D report generated locally
- [x] High-confidence precision ≥ 75% on held-out test
- [x] Current artifact emitter (`visible_dates_le_1`, AMC-only, event exclusion)
- [ ] Product review of modest lift (1.16×) and low recall
- [ ] Agreement on heuristic and UI copy
- [ ] Re-run evaluation after new daily snapshots land

**Regenerate evaluation:**

```bash
python scripts/evaluate_leaving_soon_baselines.py
# outputs: data/analysis/leaving_soon_baseline_report.{json,md}
```

**Regenerate current artifact:**

```bash
python scripts/build_leaving_soon_current.py
```

**When ready:** PR F UI only if product accepts tradeoffs.

---

## 13. Product correction — weekly booking target (2026-07-01)

### Why `visible_dates_le_1` is not a valid predictor

The PR D “best” rule `visible_dates_le_1` (only one visible show date at anchor) is **likely a tautology**, not a forecast:

- If a film has **only one visible play date**, it is already at the **end of its visible schedule**.
- The PR C label (`leaving_soon = true` when `post_update_max_show_date` does not exceed `anchor_max_show_date`) rewards rules that detect **films already at their horizon**.
- High precision (~92%) is therefore expected: “one date left” ≈ “won’t extend past that date.”
- Modest lift (1.16×) over a **77.6% base rate** further suggests the rule mostly re-labels the obvious.

**Correct modeling question (weekly):**

> On or shortly after Wednesday, when AMC’s next schedule block is first announced, which currently playing films will also receive showtimes in the **following booking week**?

Reason in **booking weeks**, not remaining visible days.

### What PR C / D / E got wrong

| PR | Issue |
|----|--------|
| **C** | Label used **horizon extension** (`post_max > anchor_max`), which correlates with “already at end of schedule” features. |
| **D** | `visible_dates_le_1` exploited that correlation; precision gate passed but lift was marginal. |
| **E** | Current artifact applies the same tautological rule to live data — **review-only, not product-ready**. |

**PR E artifact disposition:** Keep `public/data/leaving_soon_current.json` **tracked** (daily workflow convention) and **excluded from Pages `dist/`** until a corrected weekly model exists. Do **not** remove the file yet — useful for comparing tautology vs weekly labels. Do **not** wire frontend (PR F).

### Booking-cycle analysis (PR C2)

**Script:** `scripts/analyze_amc_booking_cycle.py`  
**Output:** `data/analysis/amc_booking_cycle_report.json` (gitignored)

Full footprint run (2025-07-11 → 2026-06-29, 341 snapshots):

**Any `max_show_date` increase (consecutive snapshots):**

| Weekday observed | Events | Share |
|------------------|--------|-------|
| Monday | 394 | 10.7% |
| **Tuesday** | **1,013** | **27.6%** |
| Wednesday | 777 | 21.1% |
| Thursday | 348 | 9.5% |
| Friday | 314 | 8.5% |
| Saturday | 394 | 10.7% |
| Sunday | 435 | 11.8% |

**Week-crossing extensions** (new max show date moves past prior snapshot’s Sunday):

| Weekday observed | Share (dominant) |
|------------------|------------------|
| Tuesday | 22.7% dominant |
| Thursday | ~10.3% |

**Conclusion:** The data **does not** show Thursday as the dominant extension-observation day. Extensions are **diffuse** across weekdays — consistent with **daily horizon creep** in snapshots, not a clean “Wednesday PM drop → Thursday snapshot” signal at `max_show_date` granularity. Scrape timing (~06:00 UTC ≈ prior evening PT) may still miss same-calendar-day Wednesday PM updates, but **Thursday-only anchoring is not strongly supported** by extension counts alone.

**Recommended convention (pragmatic, leakage-safe):**

- **Anchor:** Tuesday pre-update snapshot (features from current booking week only).
- **Observation:** Thursday snapshot (first Thu/Fri after relevant Wednesday) for **following-week outcome**.
- Treat Wednesday as the **conceptual** booking anchor; confirm cadence with ongoing analysis, not assumption.

### Corrected weekly label (PR C2)

**Script:** `scripts/build_weekly_leaving_soon_labels.py`  
**Library:** `reel_seattle/analysis/weekly_leaving_soon_labels.py`  
**Output:** `data/analysis/weekly_leaving_soon_labels.csv` (gitignored)

**Definition (`weekly-extension` mode):**

- **Anchor:** Tuesday (default) — film must have ≥1 active showtime in the **current** Monday–Sunday booking week.
- **Outcome:** Thursday post-update snapshot — does the film have **any** showtimes in the **following** Monday–Sunday week?
- **`leaving_soon_label = true`** only if it **does not** receive following-week showtimes.
- Avoids tautology: a film can have many visible dates in the current week yet still fail to book the next week.

**First full run summary:**

| Metric | PR C (old) | PR C2 (weekly) |
|--------|------------|----------------|
| Labeled rows | 4,930 | **1,811** |
| Positive rate | 77.6% | **38.0%** |
| Anchor weekdays | Tue/Wed | **Tue** |

The corrected base rate is **substantially lower** — future evaluation (PR D2) must use this rate, not 77.6%.

### Booking-week features (non-tautological)

Available at Tuesday anchor in `weekly_leaving_soon_labels.csv`:

- `current_week_showtime_count`, `current_week_theater_count`, `current_week_visible_days`
- `current_week_has_weekend_show`, `current_week_has_primetime`
- Prior-week counts and deltas (`prior_week_*`, `*_change_vs_prior_week`)
- `weeks_since_first_seen`, `booking_cycles_survived`
- `peak_showtime_count_to_date`, `peak_theater_count_to_date`

**Do not use as predictors for weekly model:** `visible_dates_le_1`, `days_until_anchor_max_show_date` alone, post-update fields, following-week outcome columns.

**Forbidden / outcome-only:** `gets_following_week_showtimes`, `following_week_*`, `post_update_*`, `leaving_soon_label`.

### PR D2 evaluation (done)

**Script:** `scripts/evaluate_weekly_leaving_soon_baselines.py`  
**Library:** `reel_seattle/analysis/weekly_leaving_soon_eval.py`  
**Input:** `data/analysis/weekly_leaving_soon_labels.csv`  
**Outputs (gitignored):** `weekly_leaving_soon_baseline_report.{json,md}`, `weekly_leaving_soon_baseline_predictions.csv`

**Approach:**

- Non-tautological heuristics on Tuesday anchor / current-week + prior-history features only.
- Time-aware 60/20/20 splits by anchor date; monthly precision/coverage.
- High-confidence selection on validation (`precision ≥ 75%`, `coverage ≥ 5%`, `lift ≥ 1.05`).
- Coverage-floor reporting at 5%, 10%, 15%, 20%.
- Tautology controls (`visible_dates_le_1`, `horizon_le_3`) reported separately — not product candidates.
- Event-like films excluded at label build; evaluation uses labeled rows only.
- ML skipped: scikit-learn not in project dependencies.

**Full run findings (2026-07-01):**

| Metric | Value |
|--------|-------|
| Labeled rows | 1,811 |
| Corrected base positive rate | **38.0%** |
| Best validation-gate rule | `no_current_week_weekend` |
| Held-out test precision | **80.1%** |
| Held-out test recall | 86.7% |
| Held-out test coverage | 43.6% |
| Held-out test lift | **1.99×** |
| Held-out false positives | 29 |
| Held-out false negatives | 18 |
| Monthly stability | **Fail** — Dec 61.4%, Jan 65.6% below 75% gate |

**Coverage floors (all pick `no_current_week_weekend` on validation):** 5%/10%/15%/20% floors → same held-out test metrics as above.

**Tautology controls on weekly labels (comparison only):**

| Rule | Test precision | Coverage | Lift |
|------|----------------|----------|------|
| `tautology_visible_dates_le_1` | 97.7% | 13.1% | 2.43× |
| `tautology_horizon_le_3` | 80.1% | 43.6% | 1.99× |

`no_current_week_weekend` matches tautology `horizon_le_3` on weekly labels — suggests weekend coverage still proxies end-of-run scheduling.

**Higher-precision narrow rules (low coverage):**

- `theater_pct_of_peak_le_025`: 100% precision, 2.1% coverage
- `low_showtimes_and_shrinking`: 90.0% precision, 17.9% coverage

**Recommendation:** `needs_more_work` — weekly signal is **materially better than PR D** (1.99× lift vs 1.16×) but **monthly precision is unstable**. Do **not** replace PR E artifact or ship UI yet. Collect more snapshots; consider Wednesday PM scrape and richer trajectory features.

**Run:**

```bash
python scripts/build_weekly_leaving_soon_labels.py
python scripts/evaluate_weekly_leaving_soon_baselines.py
```

**Tests:** `tests/analysis/test_weekly_leaving_soon_eval.py`

### PR D3 — richer weekly features and stability (done)

**Scope:** Expand anchor-time weekly label features (68 columns), add trajectory/peak/lifecycle/scheduling-shape fields, granular special-screening flags, richer baseline rules, monthly weak-month diagnostics, and strict-event evaluation-only filter experiment. No UI, no PR E replacement, no Wednesday PM scrape.

**New label features (anchor-only):** matinee/primetime/late/weekend showtime counts, weekend day count, showtime density, pct change vs prior week, peak-week footprint, pct of peak, weeks since peak, first anchor seen, booking-cycle lifecycle, weekday-only/single-theater/single-day buckets, `strict_event_like_*` and granular title flags.

**Evaluation additions:** coverage floors through **40%**, PR D2 baseline comparison (`no_current_week_weekend`), weak-month analysis (2025-07, 2025-12, 2026-01), strict-event filter experiment (evaluation-only).

**Results vs PR D2 (2026-07-01, rich-weekly-v2):**

| Metric | PR D2 (`no_current_week_weekend`) | PR D3 best gate rule (`low_footprint_not_first_week`) |
|--------|-----------------------------------|------------------------------------------------------|
| Test precision | 80.1% | **91.7%** |
| Test recall | 86.7% | 48.9% |
| Test coverage | 43.6% | 21.5% |
| Test lift | 1.99× | **2.27×** |
| Test FP / FN | 29 / 18 | 6 / 69 |
| Monthly precision range | 61.4%–87.8% | **52.2%–95.0%** |
| Months below 75% | 4 | **2** (2025-12, 2026-03) |
| Stability pass | No | **No** |

**Coverage floors (validation pick → held-out test):**

| Floor | Best rule | Test precision | Coverage |
|-------|-----------|----------------|----------|
| 5–20% | `low_footprint_not_first_week` | 91.7% | 21.5% |
| 30–40% | `no_current_week_weekend` (PR D2 baseline) | 80.1% | 43.6% |

**Weak-month diagnosis:** December 2025 still weakest (52.2% precision) — limited-run/holiday titles (e.g. Hamnet, event screenings) flagged as low-footprint false positives. January 2026 improved to 80.0% vs PR D2’s 65.6%. July 2025 early-data month at 83.3%.

**Strict-event filter experiment (evaluation-only, not default):** Removing 203 strict-event-like labeled rows → base rate 34.4%. `low_footprint_not_first_week` precision 91.8% but stability still fails (Dec min 48.8%). `no_current_week_weekend` improves lift to 2.15× but 4 months below 75%. **Do not adopt as default label exclusion yet.**

**ML:** scikit-learn available locally; exploratory logistic regression, shallow decision tree, and random forest ran on anchor-time features (outputs in `data/analysis/weekly_leaving_soon_ml_exploration.json`, gitignored). Best ML test precision did not beat `low_footprint_not_first_week`; rules remain preferable for explainability.

**Recommendation:** `needs_more_work` — richer features improved peak precision and reduced FP count, but **monthly stability still fails** and best rule trades recall for precision. **Do not proceed to PR E2.** Refine event filtering and collect more snapshots before artifact replacement. PR F/UI remains deferred.

**Regenerate:**

```bash
python scripts/build_weekly_leaving_soon_labels.py
python scripts/evaluate_weekly_leaving_soon_baselines.py
```

### PR D4 — event/limited-run filtering and December diagnosis (done)

**Scope:** Granular special-screening flags, run-segment classification, false-positive error audit, segment analysis (not blind exclusion), and segment-aware evaluation-only rules. No UI, no PR E replacement, no Wednesday PM scrape.

**New flags (auditable):** `flag_holiday_rerelease_like`, `flag_family_holiday_like`, `flag_opening_night_like`, `flag_live_or_concert_like`, `flag_anime_event_like`, `flag_awards_limited_like`, `flag_foreign_limited_like`, `flag_special_event_like`, `flag_probable_normal_first_run`, plus `run_segment` / `run_type` columns (79 label columns total).

**Error audit (`low_footprint_not_first_week`, all labeled rows):** 97 false positives / 329 false negatives. December 2025 accounts for **22 FPs** (largest month). Run-type breakdown: **77 normal_first_run**, 9 family_holiday, 4 awards_limited, 3 anime, 3 anniversary, 1 holiday_re_release. **Most FPs are not caught by title flags** — the core rule is weak on low-footprint normal runs that briefly extend, not only on obvious special events.

**Segment analysis (same base rule):**

| Segment | Rows | Base rate | Dec 2025 precision | Dec FPs |
|---------|------|-----------|-------------------|---------|
| All rows | 1,811 | 38.0% | 52.2% | 22 |
| Exclude holiday/family | 1,778 | 38.3% | **63.9%** | 13 |
| Normal first-run only | 1,533 | 34.9% | **66.7%** | 9 |
| Special/limited only | 259 | 57.5% | 55.6% | 4 |

**Segment-aware rules (evaluation-only, held-out test):** `segment_aware_suppress_special` / `normal_only_low_footprint` reduce test FPs from 6→5 and raise monthly min precision from 52.2%→**66.7%**, but **stability gate still fails** (3 months below 75%). December improves on the full labeled set when holiday titles are excluded, but normal-first-run low-footprint titles (e.g. One Battle After Another) remain problematic.

**Strict-event exclusion (updated flags):** 278 rows removed (was 203 in PR D3). Still does not pass monthly stability.

**Recommendation:** `needs_more_work` — segmentation clarifies that the model works better on normal first-run films and holiday exclusion helps December, but **77% of FPs look like normal first-run** and monthly min precision remains below 75%. **PR E2 remains blocked.** Next: either row-level booking-cycle signals beyond title flags, more snapshot history, or AMC metadata — not UI.

**Regenerate:**

```bash
python scripts/build_weekly_leaving_soon_labels.py
python scripts/evaluate_weekly_leaving_soon_baselines.py
python scripts/audit_weekly_leaving_soon_errors.py
```

### PR D5 — AMC metadata audit and booking-shape features (done)

**Scope:** Audit AMC API field availability, persist low-risk metadata on new scrapes (`movieId`, `sellUntilDateTimeUtc`, `genre`, `rating`, `movieUrl` in scrape-log attributes), add 17 anchor-time booking-shape label columns, and evaluate new booking-shape rules. No UI, no PR E replacement, no Wednesday PM scrape, no production model.

**AMC metadata implemented (forward-only on new scrapes):**
- `movieId` → `attributes.movie_id` → footprint `amc_movie_id`
- `sellUntilDateTimeUtc`, `genre`, `rating`, `movieUrl` → scrape-log attributes
- Full fixture: `tests/fixtures/adapters/amc_api_showtime_full.json`
- Audit module: `reel_seattle/analysis/amc_metadata_audit.py`

**Recommended future collection (not implemented):** Movies API `releaseDateUtc`, engagement/event category, now-playing vs coming-soon views, auditorium metadata.

**New booking-shape features (anchor-only, 96 label columns):** `max_show_date_stuck_weeks`, `consecutive_low_footprint_weeks`, `consecutive_no_weekend_weeks`, `lost_weekend_vs_prior_week`, `lost_primetime_vs_prior_week`, `current_weekend_share`, `weekday_only_streak`, `theater_churn_count`, etc.

**Results vs PR D3/D4 (`low_footprint_not_first_week`):**

| Metric | PR D3/D4 baseline | PR D5 best (`low_footprint_and_consecutive_low_ge_2`) |
|--------|-------------------|------------------------------------------------------|
| Test precision | 91.7% | **97.5%** |
| Test recall | 48.9% | 28.9% |
| Test coverage | 21.5% | 11.9% |
| Test FP / FN | 6 / 69 | **1 / 96** |
| Monthly min precision | 52.2% | **47.6%** (worse) |
| Months below 75% | 2 | 1 |
| Stability pass | No | **No** |

**December 2025:** Precision **47.6%** (11 FPs) — **worse than PR D4’s 52.2%**. Stricter consecutive-low rule trades December stability for higher peak precision.

**Normal-first-run booking-shape rule (`normal_booking_shape_leaving`):** 95.1% test precision, 12.2% coverage — promising but still fails stability gate.

**Recommendation:** `needs_more_work` — booking-shape features improve held-out precision but **do not fix December** or pass monthly stability. **PR E2 remains blocked.** Identity-C parent-film analysis completed (`9c1e1d7`); did not improve monthly stability — collect forward `source_film_id` before re-evaluation (see [film-identity-normalization.md](./film-identity-normalization.md)).

### PR Identity-A / B / C — film source identity (done)

**Identity-A (`9785021`):** Variant audit + design doc; no pipeline changes.

**Identity-B (`2534c14`):** Forward-only `source_film_id` / `source_title` in history CSV and `showtimes_current.json`. Legacy rows blank; `showtime_film_key` unchanged.

**Identity-C (`9c1e1d7`):** Analysis-only `parent_film_key` in weekly labels (`--identity-mode title|parent`; `--identity-mode compare` on evaluation). No public artifacts, no frontend, no PR E2 replacement.

**June 2026 parent-mode evaluation (git footprint; title-based grouping dominant because legacy rows lack `amc_movie_id`):**

| Mode | Test precision (best rule) | Monthly min precision |
|------|---------------------------|------------------------|
| `title` (default) | 97.50% | 47.62% |
| `parent` | 97.37% | 47.62% |

Parent grouping did **not** improve monthly stability or held-out FP count (1 each). **PR E2 and PR F/UI remain deferred.** Re-run parent-mode evaluation after **4–8 weeks** of live AMC `source_film_id` / `movieId` on forward scrapes.

**Regenerate:**

```bash
python scripts/build_weekly_leaving_soon_labels.py
python scripts/evaluate_weekly_leaving_soon_baselines.py
python scripts/audit_weekly_leaving_soon_errors.py
```

### Revised roadmap

| PR | Scope | Status |
|----|-------|--------|
| **C** | Horizon-extension labels | **Superseded** for modeling — kept for comparison |
| **D** | `visible_dates_le_1` evaluation | **Invalidated** as ship criterion |
| **E** | Current tautology artifact | **Review-only** — excluded from Pages |
| **C2** | Booking-cycle analysis + weekly labels | **Done** — `eb10198` |
| **D2** | Weekly baseline evaluation | **Done** — `2567db1` |
| **D3** | Richer weekly features + stability analysis | **Done** — `7f87ca0` |
| **D4** | Event/limited-run segmentation + error audit | **Done** — `59b4c03` |
| **D5** | AMC metadata audit + booking-shape features | **Done** — this pass |
| **Identity-A** | Film variant audit + design doc | **Done** — `9785021` |
| **Identity-B** | `source_film_id` / `source_title` in history + current JSON | **Done** — `2534c14` |
| **Identity-C** | `parent_film_key` analysis-only weekly labels | **Done** — `9c1e1d7` |
| **Identity-D** | Emit parent/variant fields in `showtimes_current.json` | Next (if evaluation justifies) |
| **E2** | Replace PR E with weekly rule artifact | **Deferred** — needs monthly stability |
| **F** | UI | **Deferred** until E2 + product review |

**Regenerate PR C2 artifacts:**

```bash
python scripts/analyze_amc_booking_cycle.py
python scripts/build_weekly_leaving_soon_labels.py
```

---

## Appendix — Files inspected

| Path | Purpose |
|------|---------|
| `reel_seattle/adapters/amc.py` | AMC API adapter |
| `reel_seattle/adapters/scrape_log.py` | Daily log format |
| `reel_seattle/adapters/base.py` | `RawShowtime` |
| `daily_processor.py` | History restate, emit |
| `reel_seattle/emit/current.py` | `showtimes_current.json` |
| `reel_seattle/emit/leaving_soon.py` | `leaving_soon_current.json` (PR E) |
| `reel_seattle/history_keys.py` | Key enrichment |
| `reel_seattle/source_freshness.py` | Pipeline metadata |
| `amc_logger.py` | AMC CLI |
| `SCRAPING_README.md` | Pipeline docs |
| `schema/showtime/v1.0.0.json` | Showtime schema |
| `data/history/showtimes_history.csv` | Historical analysis |
| `data/daily_logs/2026-06-29_amc.json` | Sample snapshot |
| `reel_seattle/analysis/amc_footprint.py` | Footprint derivation (PR B) |
| `reel_seattle/analysis/legacy_amc_csv.py` | Legacy CSV → RawShowtime (PR B2) |
| `reel_seattle/analysis/git_amc_snapshots.py` | Git snapshot discovery (PR B2) |
| `scripts/build_amc_film_footprint.py` | Footprint CLI (PR B) |
| `scripts/extract_amc_snapshots_from_git.py` | Git-history footprint CLI (PR B2) |
| `reel_seattle/analysis/leaving_soon_labels.py` | Label derivation (PR C) |
| `scripts/build_leaving_soon_labels.py` | Label CLI (PR C) |
| `reel_seattle/analysis/leaving_soon_eval.py` | Baseline evaluation (PR D) |
| `reel_seattle/analysis/amc_booking_cycle.py` | Booking-cycle timing analysis (PR C2) |
| `reel_seattle/analysis/weekly_leaving_soon_labels.py` | Weekly-extension labels (PR C2) |
| `scripts/analyze_amc_booking_cycle.py` | Booking-cycle CLI (PR C2) |
| `scripts/build_weekly_leaving_soon_labels.py` | Weekly label CLI (PR C2) |
| `scripts/evaluate_leaving_soon_baselines.py` | Evaluation CLI (PR D) |
| `reel_seattle/analysis/special_screening_flags.py` | Granular title flags (PR D3) |
| `reel_seattle/analysis/weekly_leaving_soon_stability.py` | Monthly stability diagnostics (PR D3) |
| `reel_seattle/analysis/weekly_leaving_soon_error_audit.py` | False-positive error audit (PR D4) |
| `reel_seattle/analysis/weekly_leaving_soon_segments.py` | Segment analysis (PR D4) |
| `reel_seattle/adapters/amc_metadata.py` | AMC metadata extraction (PR D5) |
| `reel_seattle/analysis/amc_metadata_audit.py` | AMC metadata audit table (PR D5) |
| `reel_seattle/analysis/weekly_booking_shape.py` | Booking-shape feature derivation (PR D5) |
| `reel_seattle/analysis/weekly_leaving_soon_segments.py` | Segment analysis + segment-aware rules (PR D4) |
| `scripts/audit_weekly_leaving_soon_errors.py` | Error audit CLI (PR D4) |
| `reel_seattle/analysis/weekly_leaving_soon_eval.py` | Weekly baseline evaluation (PR D2/D3) |
| `scripts/evaluate_weekly_leaving_soon_baselines.py` | Weekly evaluation CLI (PR D2) |
| `scripts/build_leaving_soon_current.py` | Current artifact CLI (PR E) |
| `tests/emit/test_leaving_soon.py` | Leaving-soon emit tests (PR E) |
| `tests/analysis/test_leaving_soon_eval.py` | Evaluation tests (PR D) |
| `tests/analysis/test_amc_booking_cycle.py` | Booking-cycle tests (PR C2) |
| `tests/analysis/test_weekly_leaving_soon_labels.py` | Weekly label tests (PR C2) |
| `tests/analysis/test_special_screening_flags.py` | Special-screening flag tests (PR D3/D4) |
| `tests/analysis/test_weekly_leaving_soon_segments.py` | Segment/audit tests (PR D4) |
| `tests/fixtures/adapters/amc_api_showtime_full.json` | Full AMC showtime fixture (PR D5) |
| `tests/analysis/test_amc_metadata_audit.py` | AMC metadata tests (PR D5) |
| `tests/analysis/test_weekly_booking_shape.py` | Booking-shape tests (PR D5) |
| `tests/analysis/test_weekly_leaving_soon_eval.py` | Weekly evaluation tests (PR D2/D3) |
| `tests/analysis/test_leaving_soon_labels.py` | Label tests (PR C) |
| `tests/analysis/test_amc_footprint.py` | Footprint tests (PR B) |
| `tests/analysis/test_legacy_amc_csv.py` | Legacy CSV tests (PR B2) |
| `tests/analysis/test_git_amc_snapshots.py` | Git snapshot tests (PR B2) |
