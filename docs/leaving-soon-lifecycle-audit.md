# AMC theatrical-run lifecycle audit

**Status:** Research complete (no model trained, no Leaving Soon UI)  
**Date:** 2026-09-02  
**Branch:** `feature/leaving-soon-lifecycle-audit`  
**Audience:** Maintainers preparing a remaining-days / time-to-event model

This document is the data foundation for estimating:

> How many more calendar days will this AMC product continue to have showtimes anywhere in the enabled Seattle-area AMC network?

It does **not** train that model, does **not** choose UI buckets (Leaving Soon / Last Chance), and does **not** change Planner.

Reproduce:

```text
python scripts/audit_amc_run_lifecycles.py
```

Generated datasets are gitignored under `audit-output/amc-run-lifecycle/`. Library: `reel_seattle/analysis/amc_run_lifecycle.py`. Observation contract: `schema/analysis/amc_run_lifecycle_observations/v1.0.0.json`.

Related: [leaving-soon-model-design.md](./leaving-soon-model-design.md) (older Wednesday-extension target — superseded as the **label**), [amc-source-catalog.md](./amc-source-catalog.md), [data-foundation-roadmap.md](./data-foundation-roadmap.md). The unmerged ingestion change lives on `feature/amc-all-announced-showtimes` and is **not** in this worktree.

---

## 1. Goal and locked product definitions

| Decision | Locked value |
|----------|----------------|
| Question | Remaining theatrical lifetime of the **current AMC run/product** |
| Geography | Aggregated across **enabled Seattle-area AMC** theaters in `data/theaters.json` |
| Per-theater remaining-run | Future extension only; not this audit’s target |
| End of run | Last scheduled AMC showtime **anywhere in that network** for that **source-native product** |
| Specials / rereleases | **Keep** in the historical data; classify separately; do not drop |
| Disappear then return | A meaningful absence starts a new `network_run_sequence`; threshold is empirical (see §6) |
| Site labels | Later, if quality passes. This audit does not optimize bucket cutoffs |
| Old Wednesday-extension label | **Not** the target. Wednesday is a booking-process **feature** (§12) |

Run identity used here:

```text
(product_id, network_run_sequence)
run_id = "{product_id}#{sequence:02d}"
```

- `product_id` is AMC `movieId` / `source_film_id` when present.
- Title slug (`title:{showtime_film_key}`) is **fallback only** and never merges two movie IDs.
- `wwmReleaseNumber` / `source_release_id` is grouping evidence, not the run key.
- Sensory-friendly, Q&A, fan events, and other AMC products stay distinct from the parent title.

---

## 2. Historical data inventory

Measured on this worktree (`as_of` = 2026-09-01).

### Committed JSON daily logs (primary PIT window)

| Item | Value |
|------|--------|
| Path | `data/daily_logs/YYYY-MM-DD_amc.json` |
| Distinct observation dates | **65** |
| Range | **2026-06-29 → 2026-09-01** |
| Missing dates in that span | **0** |
| Logs with `movie_id` in file | **63 / 65** |
| Logs without `movie_id` | **2** (the two earliest: 2026-06-29 and 2026-06-30) |
| Forward booking at T | **Yes** — each log is a scrape snapshot |
| Pre/post-Wednesday | **Yes** in this window (all weekdays present) |
| 14-day fetch ceiling | **Yes** — dated scan, not the unmerged all-announced endpoint |

Scrape timestamps in this window are typically ~02:00–04:00 Pacific, so a Wednesday file is **before** AMC’s usual Wednesday-afternoon booking update.

### Git-recoverable snapshots (broader, mixed quality)

`reel_seattle/analysis/git_amc_snapshots.py` discovery (archive CSV > daily `public/showtimes.csv` > JSON):

| Item | Value |
|------|--------|
| Distinct snapshot dates | **406** |
| Range | **2025-07-11 → 2026-09-01** |
| Missing dates in that span | **12** (including 2026-06-28, the day before JSON logs begin) |
| `archive_csv` | **335** |
| `daily_csv` | **71** |
| JSON under this precedence | Hidden when a same-date CSV artifact exists |

CSV recoveries preserve a forward window at T but **do not** carry `source_film_id`. They are reconstructed / partial, not the preferred TTE observation source.

### Restated history only

`data/history/showtimes_history.csv` freezes **past** AMC rows and **restates today+future** on each scrape. It is excellent for “did a showtime occur on date D?” after D is in the past. It is **unsuitable** as a point-in-time feature snapshot: the forward window is always the latest restate.

This audit joined **180,018** AMC history rows with `show_date <= 2026-09-01`, of which **38,722** matched a snapshot `product_id`. The rest are history-only products (mostly pre-window title identity) and were **not** turned into observation rows.

### `source_film_id` / title-only periods

| Period | Identity |
|--------|----------|
| History / Git CSV through mid-2026 | Title slug; `source_film_id` often blank |
| JSON 2026-06-29 – 2026-06-30 | Title only |
| JSON 2026-07-01 onward (63 logs) | `attributes.movie_id` present |
| Source catalog | Current `source_film_id` + `source_release_id` + presentation category (latest refresh, not as-of T) |

Same title often appears as both `title:…` (early JSON) and a numeric movie ID (later JSON). Those are **not** silently merged.

### Unmerged all-announced ingestion

`feature/amc-all-announced-showtimes` is available in a sibling worktree and is **not merged** here. Historical logs remain 14-day dated scans. Do not treat `announced_horizon_days` as remaining lifetime.

---

## 3. Observation-quality classification

| Class | When | Use for TTE labels? |
|-------|------|---------------------|
| `high_confidence_pit` | JSON snapshot whose announced horizon **exceeds** the legacy 14-day ceiling | Yes, once common after all-announced lands |
| `usable_14day_truncated` | JSON + `source_film_id`, horizon at/under the old ceiling | **Yes** — primary training class today |
| `usable_14day_truncated_title_identity` | JSON without movie ID | Features OK; identity is weak |
| `reconstructed_partial` | Git archive / daily CSV | Footprint reconstruction; not default TTE grain |
| `unsuitable_tte` | History restated forward window used as if it were T | **No** |

This run’s observation rows (n = **3,010**):

| Class | Rows |
|-------|------|
| `usable_14day_truncated` | 2,770 |
| `high_confidence_pit` | 140 |
| `usable_14day_truncated_title_identity` | 100 |

The 140 `high_confidence_pit` rows are snapshots whose farthest announced date is more than 14 days out. They are a minority; most of the window is still 14-day truncated. Low- and high-quality rows are **flagged**, not blended away.

---

## 4. Run identity contract

```text
product_id          = source_film_id  if present
                    | "title:" + showtime_film_key   otherwise
identity_kind       = source_film_id | title_fallback
identity_confidence = high | low
network_run_sequence increments when dark_days >= gap_threshold
run_id              = "{product_id}#{sequence:02d}"
```

`source_release_id` / `wwmReleaseNumber` is stored on the row for analysis. It must not merge sensory-friendly, Q&A, mystery, or event products into a parent movie.

This window:

| Identity | Products |
|----------|----------|
| `source_film_id` | 224 |
| `title_fallback` | 53 |

**Identity on return:** 21 / 31 gaps still carry a movie ID (same AMC product returning). 10 gaps are title-fallback. 18 gaps also have a release ID. Many titles appear under **both** `title:slug` and a later movie ID because capture started mid-window — that is an identity transition, not a theatrical return. FIFA/Telemundo listings can share a title slug across **multiple** movie IDs; those stay separate products.

---

## 5. Gap / return analysis

Occurred calendar = unique show dates `<= as_of` from snapshots, plus history rows for the **same** `product_id`. Dark days between consecutive occurred dates:

`dark_days = (next_date - previous_date).days - 1`

A missed scrape is **not** treated as a theatrical gap. Consecutive JSON coverage in this window is complete (0 missing dates). A fixture test covers the case where days 1–2 are missing as snapshots but were already announced on day 0.

### Distribution (31 gaps, 239 products with occurred dates)

| Bucket | Count | Share of gaps |
|--------|------:|--------------:|
| 1 day | 17 | 55% |
| 2 days | 6 | 19% |
| 3–7 days | 4 | 13% |
| 8–14 days | 0 | 0% |
| 15–21 days | 0 | 0% |
| 22–30 days | 0 | 0% |
| >30 days | 4 | 13% |

| Metric | Value |
|--------|--------|
| Products that ever disappear and return | 26 (11%) |
| Products with repeated returns | 2 |
| Gaps possibly overlapping missing snapshots | 3 |

### By run type

- **Normal first-run:** most 1-day skips (e.g. *Legend of the White Dragon* 2026-08-30 → 09-01; *How to Train Your Dragon* 2026-07-06 → 07-08) plus all four >30-day gaps.
- **Rerelease / anniversary / Ghibli fest:** 1–2 day skips between festival dates (e.g. *Only Yesterday 35th Anniversary* 08-09 → 08-11).
- **Concert / live / Fathom-like:** 1–2 day and a 4-day *KATSEYE: WILD HEARTS* gap (08-16 → 08-21).
- **Accessibility:** sensory-friendly *Spider-Man: Brand New Day* 08-08 → 08-12 (3 dark days).

### >30-day examples are title-fallback × history

| Product | Gap | Reading |
|---------|-----|---------|
| `title:david` | 66d, 88d | Title collision / separate 2026 engagements joined by slug |
| `title:lego-movie` | 157d | Feb engagement then July listing under the same slug |
| `title:how-to-train-your-dragon` | 311d | 2025 history slug vs 2026 product |

These should **not** be read as a normal first-run vanishing for a month and returning under a stable movie ID. Movie-ID products in this window have **no** 8–30 day returns.

### What the distribution says

- **1–2 day gaps** are the majority and look like dark weekdays or festival date pairs, not new engagements.
- **3–7 day gaps** are real but uncommon here (sensory-friendly series, event cinema, one title-fallback 2025 weekly skip).
- **8–30 day returns are absent** among reconstructable movie-ID products in this 65-day PIT window.
- **>30 day** returns in this extract are title-fallback history joins.

---

## 6. Recommended run-segmentation threshold

Default: **`dark_days >= 14`** starts a new `network_run_sequence`.

Sensitivity (same facts / occurred calendar):

| Threshold | Runs | Products split | Median completed length | Suspicious merges | Suspicious splits | Observation labels changed vs 14 |
|----------:|-----:|---------------:|------------------------:|------------------:|------------------:|---------------------------------:|
| 1 | 270 | 26 | 1 | 0 | 24 | 335 |
| 2 | 253 | 11 | 3 | (noisy)* | 9 | 108 |
| 7 | 244 | 3 | 4 | 2 | 1 | 2 |
| **14** | **243** | **3** | **4** | **0** | **0** | — |
| 21 | 243 | 3 | 4 | 0 | 0 | 0 |

\*Threshold-2 “suspicious merges” is inflated by dense history-join calendars (many 1-day dark counts just below 2). It is not a reason to pick 2.

**Why 14, not 7:** 7 and 14 agree on almost every training row (2 observation keys differ). The three products that split at 14 are the title-fallback >30-day history joins, which *should* split. A 7-day threshold would also split a 7-dark-day 2025 *How to Train Your Dragon* slug gap that is not a movie-ID first-run pattern.

**Why not 1 or 2:** they shatter normal films on ordinary dark days and cut median length to 1–3 days.

**Different thresholds by run type?** Event cinema already has median length 1 with few 14+ returns; a tighter event-only threshold is optional later. Evidence in this window is **not** strong enough to add that complexity. Keep one default (14) and keep 7 vs 14 in sensitivity when more history exists.

If later PIT data shows a cluster of genuine 10–20 day movie-ID returns, re-open 14 vs 21. Right now 14 and 21 are identical.

---

## 7. Run-type lifecycle analysis

Classification prefers AMC source-catalog `presentation.category` when present, else title patterns (`classify_run_type` / `classify_product_category`). Catalog category is **current**, not historical-as-of T (`catalog_not_historical=true`).

Completed-run lengths use occurred start/end and **exclude** right-censored runs.

| Run type | Runs | Median days | Mean days | P25 / P75 | One-day share | One-showtime share | Median theaters | Max theaters | Multi-run products |
|----------|-----:|------------:|----------:|-----------|--------------:|-------------------:|----------------:|-------------:|-------------------:|
| probable_normal_first_run | 132 | 8 | 13.1 | 6 / 15 | 6% | 2% | 4.0 | 7 | 3 |
| rerelease_anniversary | 18 | 4 | 5.1 | 3 / 5.8 | 17% | 11% | 3.5 | 4 | 0 |
| anime_event | 1 | 4 | 4.0 | 4 / 4 | 0% | 0% | 4.0 | 4 | 0 |
| concert_live_event | 71 | 1 | 1.9 | 1 / 1 | 76% | 24% | 2.0 | 7 | 0 |
| qa_fan_mystery | 11 | 1 | 1.0 | 1 / 1 | 100% | 0% | 7.0 | 7 | 0 |
| accessibility_special_presentation | 10 | 1 | 1.6 | 1 / 1 | 80% | 50% | 1.5 | 4 | 0 |
| family_holiday / awards_limited / unknown_other_special | 0 | — | — | — | — | — | — | — | — |

**All runs:** 243 (211 completed, 32 right-censored, 29 left-truncated). 239 products; 3 split into multiple sequences at the 14-day default.

**Specials vs first-run:** yes, they are different. First-run median **8 days** and typical 4-theater footprint. Concert/live and Q&A/fan events are **one-day** (Q&A often network-wide, 7 theaters). Accessibility presentations are short and thin (median 1.5 theaters). Rereleases sit in between (median 4 days).

Contraction is not summarized as a single curve here; it is available per observation via `prior_theater_count`, `delta_theater_count`, `lost_theater_since_prior`, and `farthest_show_date_delta`.

---

## 8. Time-to-event target definition

For an eligible observation at T of an active run:

```text
remaining_days(T) = (run_end_date - observation_date).days
```

| Rule | Convention |
|------|------------|
| T | Pacific **calendar date** of `generated_at` (not the clock time) |
| `run_end_date` | Last **occurred** show **date** of that run anywhere in the enabled AMC set |
| Same-day final show | **0** remaining days |
| Intra-day timestamp | **Not** used (historical clocks are incomplete / inconsistent) |
| Observation after that day’s last screening | Still the same calendar-day remaining_days; we do not split intra-day |
| Eligible | Product has ≥1 non-canceled showtime with `show_date >= T` in snapshot T |
| `event_observed` | `true` iff the run is **not** right-censored |
| `right_censored` | Product still active in the last snapshot (`as_of`) on the run’s last sequence |
| Right-censored `remaining_days` | **null** — no fake end date |
| `run_start_date` | First occurred date of that segmented run |

This window: **2,296** observed targets, **714** right-censored observation rows.

---

## 9. Censoring / truncation rules

| Flag | Meaning | Training implication |
|------|---------|----------------------|
| `right_censored` | Run still playing at `as_of` | Keep as censored TTE rows; **never** impute `run_end_date` |
| `left_truncated` | `run_start_date <= dataset_start` (first PIT snapshot date) | Remaining-days label can still be valid; `days_since_run_start` is a lower bound unless history extends the start |
| `historical_horizon_truncated` | `announced_horizon_days >= 13` | Safe as a **feature** of the 14-day fetch; **not** a label of remaining life |
| `announced_beyond_legacy_horizon` | Horizon > 14 | Post-ceiling / all-announced-like visibility |
| `identity_fallback` | Title-only `product_id` | Prefer dropping from first-run survival fits |
| `outcome_quality` | `observed` / `right_censored` / `unreliable_negative_remaining` | Exclude unreliable rows |

**Incomplete because of 14-day truncation:** labels that use later occurred dates are still valid **if** daily JSON exists through the true last show. The ceiling biases **features** (`announced_horizon_days`), not completed-run `remaining_days` inside this 65-day daily window. Runs still active at 2026-09-01 are censored because we do not know their true end.

**Advance-only products** (announced only after `as_of`, no occurred date yet) produce identity rows but no run/observation — 277 snapshot products vs 239 with occurred dates.

---

## 10. Leakage rules

Features at T may use snapshot T and **prior** snapshots of the same run only.

**Safe at T**

- Showtimes / theater count / premium / weekend / prime-time visible in snapshot T
- Announced earliest/farthest dates and horizon in snapshot T
- Prior observation deltas (`lost_theater_since_prior`, `farthest_show_date_delta`, …)
- `days_since_run_start` using occurred dates `<=` the run start (past)
- Title-derived `run_type`
- Identity confidence known at T

**Label-only (future occurred dates allowed)**

- `remaining_days`, `event_observed`, `right_censored`, `run_end_date`, `true_run_length_days`, `outcome_quality`

**Unsafe as features**

- Any snapshot after T
- Final run length / future `last_seen`
- Theater drops learned only after T
- Current source-catalog metadata as if it were as-of T (`catalog_run_type` is descriptive)
- Using `announced_horizon_days` as a stand-in for `remaining_days`

Unit test `test_features_do_not_leak_future_snapshots` freezes day-0 features while extending later snapshots; labels change, features do not.

---

## 11. Proposed modeling-table schema

Grain: **one row per (`observation_date`, AMC run/product)**.

Canonical field list: `OBSERVATION_FIELDNAMES` in `reel_seattle/analysis/amc_run_lifecycle.py` and `schema/analysis/amc_run_lifecycle_observations/v1.0.0.json`.

This run wrote **3,010** rows to gitignored `audit-output/amc-run-lifecycle/observations.csv`.

Suggested first-model filter:

```text
identity_kind = source_film_id
observation_quality in {usable_14day_truncated, high_confidence_pit}
outcome_quality in {observed, right_censored}
```

Do not commit the CSV; regenerate with the audit script.

---

## 12. Wednesday cadence findings

This is **feature / process** analysis, not the label.

| Finding | Evidence in this window |
|---------|-------------------------|
| Snapshots exist all weekdays | 374–486 observation-rows per weekday |
| Enough Tue/Wed coverage to compare | Yes (`enough_pre_post_wednesday_snapshots`) |
| Dominant **farthest-date increase** weekday | **Tuesday** (152 events), not Wednesday (85) |
| Mean extension size | Tuesday **3.5d**, Wednesday 2.1d, Monday 2.0d; weekend ~1d |
| Mean announced horizon by weekday | ~6.5–8.0 days (compressed by the 14-day fetch) |
| First-run vs special | 459 vs 86 extension events (first-run dominate volume) |

**Interpretation:** under a sliding 14-day dated scan, farthest announced date often walks forward **every day** as the fetch window moves. That is not the same as AMC’s Wednesday booking drop. Early-morning scrapes also sit **before** Wednesday afternoon updates, so a true Wednesday extend may first appear Thursday — except the ceiling effect lands on other weekdays first.

Do **not** model “Wednesday extension failure” as the target. After `feature/amc-all-announced-showtimes` is in production logs, re-measure which weekday the **true** farthest date jumps.

---

## 13. Known limitations

1. **65-day PIT JSON window** is short relative to long first-runs; many films are left-truncated or right-censored.
2. **14-day historical fetch** caps horizon features; 140 rows already see past 14 days, but most do not.
3. **All-announced branch is not merged**; this audit does not depend on that code.
4. **Title-fallback × history** creates fake multi-year “returns” (`David`, `The Lego Movie`, `How to Train Your Dragon`).
5. **Early JSON without movie ID** duplicates products as `title:…` then numeric IDs.
6. **Catalog run type is not historical-as-of T.**
7. **Family-holiday / awards-limited** classes are empty in this summer window.
8. **Git CSV snapshots** (2025-07-11 onward) are inventoried but not the default observation grain (no movie ID).
9. **Suspicious-merge heuristic** at low thresholds is noisy once history densifies occurred calendars.
10. **Intra-day remaining time** is out of scope.

---

## 14. Recommendation for the next modeling task

**Yes — with the filters in §11, we can identify the current source-native AMC run and compute remaining days until the true network-wide last occurred show date, without leaking future snapshots into features.**

Remaining-days is a proper time-to-event label: right-censored at `as_of`, left-truncation flagged, 14-day horizon isolated as a feature quality flag.

**Next step (separate task):** fit a survival / TTE model (e.g. Cox, Aalen, or a censored regression on `remaining_days`) on the filtered observation table. Use 14-day run segmentation. Keep specials as a stratum or separate model — their length distribution is not the first-run distribution. Do not ship UI. Do not treat announced horizon as the outcome.

Smallest data upgrade that would materially help: merge/land all-announced showtimes so **future** daily logs stop truncating horizon features, then extend this audit as those logs accumulate.
