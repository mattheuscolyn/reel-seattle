# AMC IMDb Coverage Audit

Manual, read-only measurement of how often AMC Movies API responses include a usable `imdbId` for distinct AMC `movieId` values already present in Reel Seattle scrape data.

## Why it exists

Showtimes scraping only captures AMC showtime payloads. IMDb IDs live on the separate Movies API. This audit estimates coverage **before** any production persistence or cockpit wiring.

## How to run

1. GitHub → **Actions** → **AMC IMDb Coverage Audit**
2. **Run workflow** (`workflow_dispatch` only; no schedule)
3. Download the artifact named `amc-imdb-coverage-audit` (retained 30 days)

Local offline (no secret):

```bash
python scripts/audit_amc_imdb_coverage.py \
  --source tests/fixtures/audit/source_amc_scrape_log.json \
  --offline-fixtures tests/fixtures/audit/amc_movies \
  --output-dir audit-output
```

Local live (requires `AMC_API_KEY` in the environment, never on the CLI):

```bash
python scripts/audit_amc_imdb_coverage.py --source auto --output-dir audit-output
```

## Source of movie IDs

`--source auto` prefers the newest committed `data/daily_logs/*_amc.json` (`attributes.movie_id`). If none exist, it falls back to distinct AMC `source_film_id` values in `public/data/showtimes_current.json`. The chosen path is recorded in the report.

## Coverage percentages

- **Coverage of parsed movie responses** (`coverage_percent` / `coverage_percent_of_parsed_movies`): valid IMDb IDs ÷ successful HTTP 200 movie responses that were classified as valid, missing, or malformed.
- **Coverage of distinct AMC IDs**: valid IMDb IDs ÷ all distinct requested AMC movie IDs (includes request failures).

Request failures are **not** counted as missing IDs.

## Shared IMDb IDs

The same normalized IMDb ID on multiple AMC movie IDs is reported for observation. It is **not** automatically an error (formats, events, and presentations often have separate AMC ids). Sensory/event/mystery/presentation records must not inherit another record’s IMDb ID in production.

## What this does not do

- Does not write into showtimes, history, public artifacts, or the cockpit
- Does not call TMDB or Letterboxd
- Does not commit audit outputs (use `audit-output/`, gitignored)
- Does not change `daily_scraping.yml`

## Secrets

Pass `AMC_API_KEY` only via environment / GitHub Actions secrets. Never print the key, never put it on the command line, and never include request headers in report output.
