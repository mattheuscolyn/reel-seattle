# AMC Catalog Refresh Cadence and Inactive-Growth Evaluation (P-21C)

**Status:** Complete (research / measurement only)  
**Track:** Data Foundation  
**Last updated:** 2026-07-17  
**Related:** [amc-source-catalog.md](./amc-source-catalog.md) · [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md)

## Classifications

```text
refresh cadence: Keep all-active daily
inactive growth: Healthy durable accumulation
```

No production refresh-cadence or inactive-retention change is justified from this evaluation.

## Purpose

Answer whether production should keep refreshing every active AMC product on each daily catalog run, and whether inactive-product growth is healthy durable history versus a retention problem — without changing production behavior.

## Evidence window

| Item | Value |
|------|--------|
| Distinct catalog `generated_at` snapshots | 16 (via read-only `git show`) |
| Distinct catalog calendar dates | **3** — `2026-07-15`, `2026-07-16`, `2026-07-17` |
| First snapshot | `2026-07-15T20:48:11-07:00` (`0400daf`) |
| Latest snapshot | `2026-07-17T11:15:14-07:00` (`c5ca543`) |
| Same-day workflow reruns | Many (especially 2026-07-16 / 2026-07-17); **not** independent daily evidence |
| `amc_source_catalog` in pipeline report | Only on latest generated-data commit (`c5ca543`, P-21B) |
| Soft-failure / retained-stale production outcomes | **None observed** in committed catalogs |
| Wall-clock Movies refresh timings | **Not** committed |

Tooling: `python scripts/audit_amc_catalog_cadence.py --from-git`  
Gitignored machine output: `audit-output/amc-catalog-cadence-evaluation/`

## Methodology

* Reconstruct every distinct catalog `generated_at` from git history (no working-tree checkout of old data).
* Compare consecutive snapshots for adds/removes, active→inactive, inactive→active, and **meaningful** product-field changes.
* Meaningful compare fields exclude lifecycle timestamps and `refresh_status` (rewritten every all-active run). Included: title/runtime/rating/synopsis/media/`attribute_codes`/`source_release_id`/schedule-ish fields (see `MEANINGFUL_PRODUCT_FIELDS` in `reel_seattle/analysis/amc_catalog_cadence_audit.py`).
* Model `all-active`, `new-only`, and `stale` (24/48/72h) selection sizes on the latest catalog at ~25h after `generated_at` (approximate next daily run). Stale selection uses existing `last_successful_refresh_at` and the code’s strict `age > threshold` rule.
* Inactive age uses `inactive_since` vs latest `generated_at`.

## Current refresh behavior (from code)

| Topic | Behavior |
|-------|----------|
| Production policy | `all-active` only (`scripts/run_daily_amc_source_catalog.py` rejects other policies) |
| Candidates | All `source_film_id`s discovered active from scrape-log / showtimes-current |
| New IDs | Included (also under `stale` / `new-only` helpers) |
| Inactive products | Retained in catalog; not Movies-refresh candidates unless rediscovered |
| Inactive transition | Driven by **discovery** `active_ids`, not by Movies refresh success |
| Endpoint | `GET https://api.amctheatres.com/v2/movies/{movie_id}` |
| Pattern | Serial lookups; live pacing default **1.0s** between requests |
| Failure | Soft-fail; retain prior valid durable pair (P-14D) |
| Latest request estimate | **39** Movies GETs/run (~38s sleep alone at 1.0s pacing) |

`new-only` and `stale` exist in `amc_refresh.py` but are **not** production daily policies.

## Historical metrics (by catalog calendar date)

Last snapshot of each calendar day (full per-`generated_at` table is in the audit JSON):

| Date | Runs (distinct generated_at) | Total | Active | Inactive | Releases | Multi |
|------|------------------------------|------:|-------:|---------:|---------:|------:|
| 2026-07-15 | 4 | 47 | 47 | 0 | 43 | (see JSON) |
| 2026-07-16 | 8 | 49 | 42 | 7 | 45 | |
| 2026-07-17 | 4 | 50 | 39 | 11 | 46 | 2 |

### Transition totals across all consecutive snapshot pairs

| Metric | Value |
|--------|------:|
| Added products | 3 |
| Removed products | 0 |
| Newly inactive | 11 |
| Reactivated | 0 |
| Zero-churn transitions | 10 / 15 |
| Refresh failures in committed catalogs | 0 (all `refresh_status=success`) |

Notable non-zero churn gaps:

* `2026-07-15T22:47` → `2026-07-16T01:01`: +2 products, +7 inactive (discovery fall-off).
* `2026-07-16T01:01` → `2026-07-16T20:18`: **8** meaningful metadata changes (~19% of active); fields seen: `earliest_showing_utc`, `attribute_codes`, `media`.
* `2026-07-16T23:41` → `2026-07-17T00:58`: +1 product, +4 inactive.
* `2026-07-17T00:58` → `2026-07-17T09:59`: **3** meaningful metadata changes.

Same-day reruns often show **0** meaningful changes after refreshing all actives.

## Refresh change analysis

* Overnight / multi-hour gaps show real Movies metadata churn (schedule, attributes, posters).
* Same-day reruns usually waste ~39–47 API calls with no meaningful field updates.
* Production is scheduled **once daily**; same-day zero-churn is operational noise, not a daily-policy argument by itself.
* Modeled next-run (~25h) selection on latest catalog:

  | Policy | Selected | Approx. reduction vs all-active |
  |--------|---------:|--------------------------------:|
  | all-active | 39 | 0% |
  | new-only | 0 | 100% (unsafe for metadata freshness) |
  | stale 24h | 39 | ~0% (≈ daily all-active given strict `>`) |
  | stale 48h | 0 | 100% at +25h (would skip until age exceeds 48h) |
  | stale 72h | 0 | 100% at +25h |

* Correctness risks of changing now: delayed attribute/media/schedule updates; weak multi-week churn statistics; no failure-pressure evidence.
* **Classification: Keep all-active daily.** Volume is modest; discovery already owns lifecycle; overnight churn is non-trivial; evidence window is too short to design a safer stale-N production policy.

## Inactive-growth analysis

| Metric | Latest |
|--------|--------|
| Inactive count / share | 11 / 50 (**22%**) |
| With release ID | 10 |
| Without release ID | 1 |
| Age buckets | 4 &lt; 1d; 7 in 1–3d; none ≥7d yet |
| Reactivations | 0 |
| Removals | 0 |
| Growth shape | Step-ups on discovery days (0→7→11); stable within same-day reruns |

Projection: with only ~2 days of inactivity onset, **do not** treat a monthly rate as established. Qualitatively, inactive share will rise as titles leave the 14-day showtime window while products are retained forever — that is intentional durable history, not duplication.

**Classification: Healthy durable accumulation.** Prefer monitoring thresholds over retention/deletion design.

## Data-quality findings (latest catalogs)

| Check | Count |
|-------|------:|
| Duplicate `source_film_id` | 0 |
| Invalid timestamp ordering | 0 |
| `inactive_since` before `first_seen_at` | 0 |
| `last_successful_refresh_at` after `last_refreshed_at` | 0 |
| Active with inconsistent inactivity | 0 |
| Products missing release observation | 0 |
| Release members missing product | 0 |
| Unexpected product loss across history | 0 |
| Schema validation errors | 0 |

No separate repair task is required from this evaluation.

## Proposed monitoring thresholds (no alerting shipped)

Numeric values are **provisional** (short window):

| Metric | Revisit if |
|--------|------------|
| Inactive product count / share | ≥ 200 **or** inactive ≥ 60% |
| Distinct catalog calendar dates | ≥ 14 (enough overnight gaps to reassess stale-N) |
| Refresh failed/invalid share | &gt; 5% of selected in a run, or `retained_previous` twice in 7 days |
| Overnight unchanged-active rate | ≥ 0.95 across ≥ 10 distinct overnight gaps |
| Estimated Movies requests / run | ≥ 150 active refresh candidates |

## Tooling

| Path | Role |
|------|------|
| `reel_seattle/analysis/amc_catalog_cadence_audit.py` | Pure analysis module |
| `scripts/audit_amc_catalog_cadence.py` | CLI (`--from-git` / `--snapshots-dir`) |
| `tests/analysis/test_amc_catalog_cadence_audit.py` | Focused tests |
| `audit-output/amc-catalog-cadence-evaluation/` | Gitignored JSON/MD run output |

No workflow integration. No AMC API calls. No Cockpit dependency.

## P-18B threshold (rechecked)

* Qualifying expanded AMC dates: **`2026-07-17` only**
* Count: **1**
* Files: `data/daily_logs/*_amc.json`
* **Still blocked** (need ≥3). P-18B not started.

## Recommendation

1. **Keep** production `all-active` daily refresh.
2. **Do not** open a stale-policy implementation task yet.
3. **Passive gate:** re-run this audit after ≥14 distinct catalog calendar dates **or** when a monitoring threshold trips.
4. Optional later (only if thresholds trip): narrowly scoped **design** task for stale-N — not implementation.
