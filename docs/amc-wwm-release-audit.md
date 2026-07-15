# AMC wwmReleaseNumber Relationship Audit

Manual, read-only measurement of whether AMC Movies `wwmReleaseNumber` usefully groups distinct AMC movie products / presentations that share an underlying release.

## Why it exists

Showtimes capture AMC `movieId` / `source_film_id` only. IMDb IDs are currently unavailable from the Movies API for sampled titles. A verified response showed multiple presentation products (standard / Q&A / special introduction) sharing one `wwmReleaseNumber`. This audit measures coverage, cardinality, and presentation-variant behavior before any production use.

## How to run

1. GitHub → **Actions** → **AMC Movie Relationship Audit**
2. **Run workflow** (`workflow_dispatch` only)
3. Download artifact `amc-wwm-release-audit` (30-day retention)

Offline:

```bash
python scripts/audit_amc_wwm_release.py \
  --source tests/fixtures/audit/source_wwm_scrape_log.json \
  --offline-fixtures tests/fixtures/audit/amc_movies_wwm \
  --output-dir audit-output
```

Live (requires `AMC_API_KEY` in the environment):

```bash
python scripts/audit_amc_wwm_release.py --source auto --output-dir audit-output
```

The existing **AMC IMDb Coverage Audit** workflow remains available separately.

## Source data

`--source auto` prefers newest `data/daily_logs/*_amc.json`, else AMC `source_film_id` values from `public/data/showtimes_current.json`.

## Interpreting shared release numbers

A shared `wwmReleaseNumber` is source evidence that AMC products may belong to one release group. It is **not** a Reel Seattle canonical film ID and does **not** justify automatic merges or metadata inheritance across products (especially sensory / event / Q&A products).

## Outputs

- `amc_wwm_release_audit.json` — full sanitized report
- `amc_wwm_release_rows.csv` — one row per AMC movie ID
- `amc_wwm_release_groups.csv` — one row per release-number group
- `amc_wwm_release_summary.md` — human summary

## Secrets

Pass `AMC_API_KEY` only via environment / Actions secrets. Never put it on the CLI. Outputs exclude headers and full raw payloads.

## Non-production status

Results are not written into showtimes, history, public artifacts, or the cockpit.
