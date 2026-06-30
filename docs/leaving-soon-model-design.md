# Leaving Soon — Predictive Feature Design & Data Audit

**Status:** PR B complete (`edbf473`); PR C blocked pending AMC daily-log history  
**Date:** 2026-06-30  
**Audience:** Maintainers evaluating whether to ship an AMC “Leaving Soon” signal

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
  → reel_seattle/adapters/amc.py (AMC API v2 fetch, 14-day window)
  → data/daily_logs/YYYY-MM-DD_amc.json (normalized RawShowtime snapshot)
  → public/showtimes.csv (legacy AMC CSV, past + current/future)
  → daily_processor.py (merge into history, emit JSON)
  → data/history/showtimes_history.csv (canonical history)
  → public/data/showtimes_current.json (frontend, 14-day window)
```

| Stage | Location | Role |
|-------|----------|------|
| AMC fetch | `reel_seattle/adapters/amc.py` | Paginated `GET /v2/theatres/{id}/showtimes/{date}` for each enabled theater, 14 days |
| Raw snapshot | `data/daily_logs/YYYY-MM-DD_amc.json` | Per-scrape normalized records + `generated_at` |
| Legacy CSV | `public/showtimes.csv` | AMC-only; past rows retained, future restated |
| Canonical history | `data/history/showtimes_history.csv` | All sources; **not** shipped to browser |
| Frontend artifact | `public/data/showtimes_current.json` | Built by `reel_seattle/emit/current.py` |
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

- `tests/fixtures/adapters/amc_api_showtime_full.json` — one redacted full showtime object for adapter tests
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
| `data/daily_logs/` (≥8–12 weeks retained) | **Yes** — primary path |
| Going forward + backfill | Commit daily logs; optionally backfill from git history |

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

### What stays out of `public/data/`

Do **not** ship model scores to the browser until PR E passes evaluation. Keep modeling artifacts under `data/analysis/` or `analysis/` (gitignored via `.gitignore`).

---

## 9. Staged PR roadmap

| PR | Scope | Status |
|----|-------|--------|
| **A** | Design audit (`docs/leaving-soon-model-design.md`) | **Done** |
| **B** | `scripts/build_amc_film_footprint.py` + tests | **Done** |
| **C** | Historical label builder + leakage checks | **Blocked** — need ≥8–12 weeks of AMC daily logs |
| **D** | Baseline + logistic regression backtest report | Pending |
| **E** | `public/data/leaving_soon_current.json` emitter (only if §7 gates pass) | Pending |
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
| **With 8–12 weeks of snapshots** | Reasonable first backtest |
| **With 6+ months** | Better calibration and segment stability |

### Biggest blockers / risks

1. **AMC restate overwrites forward snapshots in history** — trajectory is lost unless daily logs are used.
2. **Sparse daily log history in repo today** — only recent logs locally; need sustained daily commits or git history backfill.
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

**PR C:** `scripts/build_leaving_soon_labels.py` — build Wednesday-extension labels from footprint CSV + daily logs, with explicit leakage guards and event-film exclusion flags.

**Prerequisite:** Accumulate **≥8–12 weeks** of `data/daily_logs/*_amc.json` in git (daily Actions commits) so labels and backtests are meaningful. Re-run `python scripts/build_amc_film_footprint.py` after each batch of new logs.

**Provisional ship bar (not approval to ship UI):** ≥75% precision on a high-confidence Leaving Soon bucket in held-out backtest weeks (see §7).

---

## 12. Milestone status & PR C readiness

### Current milestone (2026-06-30)

| Item | State |
|------|--------|
| PR A design audit | Done |
| PR B footprint derivation | **Done** — commit `edbf473`, pushed; CI + Pages deploy passed |
| PR C label builder | **Not started** — blocked on snapshot history |
| Generated outputs | `data/analysis/` gitignored; not committed |

**Blocker:** As of PR B landing, only **one** `data/daily_logs/*_amc.json` file is in the repo. Label building and backtesting need roughly **8–12 weeks** of daily AMC snapshots (via scheduled Actions commits).

**Optional later:** Second **Wednesday PM** AMC scrape to align labels with schedule-extension timing (see §8).

### PR C readiness checklist

Revisit when daily logs have accumulated — do **not** start PR C until the checks below pass:

- [ ] `git ls-files 'data/daily_logs/*_amc.json' | wc -l` ≥ **56** (~8 weeks) or ≥ **84** (~12 weeks)
- [ ] Snapshot dates span the target window without large gaps (spot-check for failed scrapes)
- [ ] `python scripts/build_amc_film_footprint.py` succeeds and row count grows with new logs
- [ ] Footprint output includes multiple `snapshot_date` values (not a single-day trivial run)
- [ ] Team agrees provisional ship bar (§7: ≥75% precision on high-confidence bucket) still applies

**Regenerate footprint after new logs:**

```bash
python scripts/build_amc_film_footprint.py
# output: data/analysis/amc_film_footprint_daily.csv (gitignored)
```

**When ready:** implement `scripts/build_leaving_soon_labels.py` (PR C), then PR D backtest before any UI work.

---

## Appendix — Files inspected

| Path | Purpose |
|------|---------|
| `reel_seattle/adapters/amc.py` | AMC API adapter |
| `reel_seattle/adapters/scrape_log.py` | Daily log format |
| `reel_seattle/adapters/base.py` | `RawShowtime` |
| `daily_processor.py` | History restate, emit |
| `reel_seattle/emit/current.py` | `showtimes_current.json` |
| `reel_seattle/history_keys.py` | Key enrichment |
| `reel_seattle/source_freshness.py` | Pipeline metadata |
| `amc_logger.py` | AMC CLI |
| `SCRAPING_README.md` | Pipeline docs |
| `schema/showtime/v1.0.0.json` | Showtime schema |
| `data/history/showtimes_history.csv` | Historical analysis |
| `data/daily_logs/2026-06-29_amc.json` | Sample snapshot |
| `reel_seattle/analysis/amc_footprint.py` | Footprint derivation (PR B) |
| `scripts/build_amc_film_footprint.py` | Footprint CLI (PR B) |
| `tests/analysis/test_amc_footprint.py` | Footprint tests (PR B) |
