# AMC Source Catalog — Daily Integration

**Status:** Implemented · production-generated internal artifact via daily workflow (non-blocking)  
**Track:** Data Foundation  
**Last updated:** 2026-07-15  
**Implementation:** P-14D — Wire AMC source catalog into daily workflow  
**Related:** [amc-source-catalog.md](./amc-source-catalog.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [development-operating-model.md](./development-operating-model.md)

This document is the integration contract for the AMC source-catalog stage in Reel Seattle’s daily pipeline.

---

## 1. Goal

After showtimes are scraped, processed, validated, and ready to commit:

1. Refresh AMC Movies metadata for active products.
2. Merge into durable internal catalogs.
3. Validate both catalog artifacts together.
4. Promote only fully valid outputs.
5. Include catalog files in the **same** generated-data commit when they change.
6. Never fail the daily job because the catalog stage failed.

Public showtime success remains independent of catalog health.

---

## 2. Actual workflow placement (shipped)

`.github/workflows/daily_scraping.yml`:

```text
checkout
  → install deps
  → set AMC_API_KEY in GITHUB_ENV (scrape)
  → python run_daily_scraping.py
  → validate_public_data_artifacts.py
  → validate_history_csv.py --strict
  → python scripts/run_daily_amc_source_catalog.py   ← non-blocking (exit 0 on soft-fail)
  → intentional git add (incl. durable catalog paths if present) + commit + push
```

---

## 3. Orchestration

```text
scripts/run_daily_amc_source_catalog.py
reel_seattle/source_catalog/amc_daily.py
```

Coordinates existing refresh + merge + validate + atomic promotion.

Default policy: **`all-active`**.

Discovery: `--discovery-source auto` prefers **today’s Pacific-date** `data/daily_logs/YYYY-MM-DD_amc.json` when present, else existing auto fallback. The scrape log is the full announced-future AMC snapshot ([amc-all-announced-showtimes.md](./amc-all-announced-showtimes.md)); do not discover daily active IDs from the 14-day public artifact.

Exit contract:

* `0` — promoted **or** expected catalog soft-failure (missing key, discovery empty, validation/promotion failure, all-failed retain, etc.)
* nonzero — invalid CLI usage or unexpected programmer error
* `--fail-hard` maps soft-failures to nonzero (local only; not used in daily YAML)

---

## 4. All-failed Movies refresh behavior (chosen)

When a **prior durable catalog exists** and **every selected Movies fetch fails or is invalid** (zero successes):

* **retain prior catalogs** (do not promote),
* emit a warning diagnostic,
* continue the daily workflow.

On first run with nothing to retain, a validated stub catalog may still be promoted if merge+validation succeed.

---

## 5. Atomic promotion

1. Build + validate in a temp work directory.
2. Stage `.tmp` siblings beside durable paths; backup existing to `.bak`.
3. `os.replace` products, then releases.
4. If releases replace fails, restore products from `.bak` (or remove half-promoted first-run products).
5. Clean `.tmp` / `.bak`.
6. Delete the work directory.

---

## 6. Diagnostics

Stdout only for P-14D (no pipeline-report schema change). Examples:

```text
AMC source catalog: 44 active, 44 selected, 42 refreshed, 2 failed, 0 invalid
AMC source catalog: 44 products (42 active, 2 inactive), 41 release groups
AMC source catalog warning: all Movies refreshes failed; retained previous catalog
AMC source catalog error: generated catalog validation failed; no files promoted
```

Never print secrets, headers, or full API payloads.

---

## 7. Generated-data staging

Explicit paths only (when present):

```text
data/source_catalog/amc_movie_products.json
data/source_catalog/amc_release_observations.json
```

Temporary observations and work-dir files are never staged.

---

## 8. No-change / timestamp behavior

Successful runs advance `generated_at` and lifecycle refresh timestamps when products are refreshed. That churn is intentional and may appear in the daily generated-data commit even when allowlisted metadata is unchanged.

---

## 9. Failure isolation (summary)

| Failure | Showtimes | Catalog promotion |
|---------|-----------|-------------------|
| Missing API key | Continue | No; retain prior / skip init |
| No AMC IDs | Continue | No |
| Partial Movies failures | Continue | Yes if merge+validate OK |
| All Movies failures (prior exists) | Continue | **No — retain prior** |
| Invalid / inconsistent prior | Continue | No; retain |
| Validation / promotion failure | Continue | No; retain/restore |

Fixture coverage: `tests/source_catalog/test_amc_source_catalog_daily.py`.
