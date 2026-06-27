# Daily Showtime Scraping System

This system automatically scrapes showtimes from indie theaters and AMC theaters daily, preserving historical data and tracking newly announced movies.

## Files Overview

### Core Scripts
- `webscrapetheaters.py` - Thin CLI wrapper that writes `public/indieshowtimes.csv` via SIFF and Beacon adapters
- `reel_seattle/adapters/siff.py` - SIFF cinema source adapter
- `reel_seattle/adapters/beacon.py` - The Beacon source adapter
- `amc_logger.py` - Thin CLI wrapper that writes `public/showtimes.csv` via the AMC adapter
- `reel_seattle/adapters/amc.py` - AMC API source adapter (fetch, allowlist, legacy CSV conversion)
- `daily_processor.py` - Processes and consolidates daily data
- `run_daily_scraping.py` - Master script that runs everything
- `scripts/marathon/find_marathons.py` - Exports AMC showtimes into `public/marathon/marathon_showtimes.json` for the marathon planner (see `scripts/marathon/README.md`; also runs at end of `daily_processor.py`)

### Data Files (created automatically)
- `public/showtimes.csv` - Latest AMC showtimes
- `public/indieshowtimes.csv` - Latest indie theater showtimes (legacy processor input fallback)
- `data/daily_logs/YYYY-MM-DD_amc.json` - Normalized raw AMC adapter scrape log (processor JSON-first input)
- `data/daily_logs/YYYY-MM-DD_siff.json` - Normalized raw SIFF adapter scrape log
- `data/daily_logs/YYYY-MM-DD_beacon.json` - Normalized raw Beacon adapter scrape log
- `data/history/showtimes_history.csv` - **Canonical** historical showtime data (not shipped to GitHub Pages)
- `public/data/showtimes_current.json` - Lean normalized showtimes for today through today + 14 days (emitted by `daily_processor.py`; loaded by the React app)
- `public/data/pipeline_report.json` - Daily pipeline observability report with per-source freshness (emitted by `daily_processor.py`)
- `public/data/movies_announcements.csv` - Track when movies were first announced
- `public/data/newly_announced.csv` - Movies announced in last 7 days
- `public/data/newly_added_current.json` - Frontend-safe JSON slice of recently announced film+theater pairs in the current showtimes window (emitted by `daily_processor.py`)

**Archive locations:** canonical history is `data/history/showtimes_history.csv`. Per-scrape JSON logs are `data/daily_logs/YYYY-MM-DD_{source}.json`. The obsolete `public/data/daily_logs/` legacy CSV archive is no longer written or committed.
- `data/theaters.json` - **Canonical** theater definitions (edit this file)
- `public/data/theaters.json` - Deployed copy of the registry (synced from `data/theaters.json` by `daily_processor.py`)
- `schema/theaters/v1.0.0.json` - JSON Schema for the registry
- `schema/showtime/v1.0.0.json` - Stub schema for future normalized showtime records
- `schema/showtimes_current/v1.0.0.json` - JSON Schema for `public/data/showtimes_current.json`
- `schema/pipeline_report/v1.0.0.json` - JSON Schema for `public/data/pipeline_report.json`
- `schema/newly_added_current/v1.0.0.json` - JSON Schema for `public/data/newly_added_current.json`

Scrapers use source adapters under `reel_seattle/adapters/` with legacy CSV writers and normalized JSON daily logs under `data/daily_logs/`. The daily processor prefers today's per-source JSON logs when present and falls back to legacy CSV (`public/showtimes.csv`, `public/indieshowtimes.csv`) when absent.

## How It Works

### Daily Process
1. **Scrape indie theaters** - Runs `webscrapetheaters.py`
2. **Scrape AMC theaters** - Runs `amc_logger.py` 
3. **Process data** - Runs `daily_processor.py`
   - Compares new data with historical data
   - Preserves all historical records
   - Tracks when movies were first announced
   - Writes JSON scrape logs under `data/daily_logs/`

### Data Preservation
- **New showtimes**: Added with `first_seen_date = today`
- **Existing showtimes**: Updated with `last_updated = today`
- **Missing showtimes**: Kept in historical data (not deleted)
- **Past showtimes**: Never modified

### New Movie Tracking
- Tracks when each movie was first announced at each theater
- `public/data/newly_announced.csv` contains movies announced in last 7 days
- `public/data/newly_added_current.json` contains the same recent announcements as canonical JSON for the React app (intersected with the current 14-day showtimes window)
- Perfect for "newly announced movies" website features

**Deploy follow-up (after React consumes `newly_added_current.json`):** stop copying `movies_announcements.csv` to `dist/` via `vite.config.js` (it is ~512 KB and not needed in the browser). Consider whether `newly_announced.csv` should remain deployed or become repo-only for debugging.

### Theater registry (authored)

## Python environment

Runtime and development dependencies are pinned in `requirements.txt` and `requirements-dev.txt`.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

### Continuous integration and deploy

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

| Job | Checks |
|-----|--------|
| Python tests | `pytest` (adapters, processor, schemas, marathon export) |
| Frontend | `npm run test:frontend`, `npm run build`, `node scripts/check_dist_artifacts.mjs` |

**Deploy** (`.github/workflows/deploy.yml`) builds the site and publishes `dist/` to GitHub Pages. It runs the same frontend build and artifact guard before deploy.

The artifact guard verifies **`dist/`** contains:

- `404.html` (SPA deep-link fallback)
- `data/showtimes_current.json`, `data/pipeline_report.json`, `data/theaters.json`
- `marathon/marathon_showtimes.json`

and forbids shipping **`dist/data/showtimes_history.csv`** or **`dist/data/daily_logs/`**. Total **`dist/data/`** size must stay under 5 MB.

CI does not run scrapers and does not require secrets. Use these checks for branch protection.

Processor golden fixture tests live in `tests/golden/test_processor.py` with CSV fixtures under `tests/fixtures/processor/`. They run fully offline in temporary directories and do not read or write production history or scrape files.

Indie adapter fixture tests live in `tests/adapters/test_siff.py`, `tests/adapters/test_beacon.py`, and `tests/adapters/test_indie_legacy.py` with HTML fixtures under `tests/fixtures/adapters/`.

Normalized raw JSON scrape log tests live in `tests/adapters/test_scrape_log.py`. Processor JSON-first input tests live in `tests/test_daily_processor_scrape_input.py`.

### JSON schema validation

`reel_seattle/validate.py` validates authored and generated JSON against schemas in `schema/`:

| Document | Schema | When validated |
|----------|--------|----------------|
| `data/theaters.json` | `schema/theaters/v1.0.0.json` | Before emitting `showtimes_current.json` |
| `public/data/showtimes_current.json` | `schema/showtimes_current/v1.0.0.json` | Before writing the file in `daily_processor.py` |
| `public/data/pipeline_report.json` | `schema/pipeline_report/v1.0.0.json` | Before writing the file in `daily_processor.py` |

Validation failures raise `SchemaValidationError` with the schema path and JSON pointer (e.g. `$.showtimes.0.date`) so GitHub Actions logs are actionable.

## Running Manually

### Single Run
```bash
python run_daily_scraping.py
```

### Individual Scripts
```bash
# Just indie theaters
python webscrapetheaters.py

# Just AMC theaters  
python amc_logger.py

# Just process data
python daily_processor.py
```

## Automated Daily Execution

### GitHub Actions (Recommended)
- Automatically runs daily at 6 AM UTC (10 PM PST)
- Requires `AMC_API_KEY` secret in repository settings
- Commits updated data files automatically

### Local Cron Job (Alternative)
```bash
# Add to crontab
0 6 * * * cd /path/to/project && python run_daily_scraping.py
```

## Theater Registry

`data/theaters.json` is the single source of truth for which venues Reel Seattle supports. Each entry describes one physical location (or distinct SIFF screen venue), not a scrape source.

**The registry defines the intended product footprint.** `amc_logger.py` fetches AMC theatres within a 300-mile radius of Seattle, then **filters to enabled AMC registry entries only** (`source == "amc"` and `enabled == true`). Disabled registry theaters (Kitsap, Lakewood) and out-of-scope locations omitted from the registry are skipped. Historical rows for those theaters remain in `showtimes_history.csv`; only future scrape output is limited.

### Editing the registry

1. Change **`data/theaters.json`** only.
2. Run **`python daily_processor.py`** (or wait for the daily workflow) to sync **`public/data/theaters.json`** automatically.
3. Bump `updated_at` to the edit date.
4. Do not change `id` values after showtimes reference them—they are permanent.

### Theater fields

| Field | Purpose |
|-------|---------|
| `id` | Stable kebab-case key (e.g. `amc-pacific-place-11`). Used in future `theater_id` columns and JSON showtimes. |
| `name` | Canonical display name. Must match what should appear in the app and in normalized data. |
| `aliases` | Alternate strings from scrapers or legacy CSV rows. Used for case-insensitive matching when resolving a raw theater name to an `id`. |
| `source` | Which adapter ingests this theater: `amc`, `siff`, or `beacon`. Multiple theaters may share a source (all SIFF venues use `siff`). |
| `source_external_id` | Vendor ID for API calls. **AMC only** for now—set to the AMC API theatre id when known; `null` is a valid placeholder until populated. |
| `enabled` | When `false`, the AMC scraper skips this theater. Other pipeline steps may also skip it in future PRs. |
| `type` | `chain` (multiplex), `indie`, `rep` (repertory/arthouse), or `festival`. For UX and filtering later. |

Optional fields (`city`, `neighborhood`, `timezone`) support future map and “near me” features and do not affect scraping today.

### Currently registered theaters (13)

**AMC — enabled, Seattle metro core (7):** Pacific Place 11, Oak Tree 6, Factoria 8, Alderwood Mall 16, Southcenter 16, Kent Station 14, Woodinville 12.

**AMC — disabled, optional greater Puget Sound (2):** Kitsap 8 (Bremerton), Lakewood Mall 12 (Tacoma area). Set `enabled` to `true` to include in a future Puget Sound expansion.

**SIFF — enabled (3):** Cinema Downtown, Cinema Uptown, Film Center.

**Indie — enabled (1):** The Beacon.

AMC locations that appeared in historical scrapes but are **not** in the registry (e.g. Progress Ridge, Vancouver Mall, Corvallis, Kennewick, River Park Square) were outside the Reel Seattle product scope and were intentionally omitted—not disabled—because they are not plausible extensions of a Seattle-focused app. The AMC scraper no longer collects new showtimes for them.

### AMC allowlist (PR 11) and adapter (PR 15)

`amc_logger.py` delegates to `reel_seattle/adapters/amc.py`, which reads `data/theaters.json` and only writes showtimes for **enabled AMC** entries. The adapter returns structured `RawShowtime` records internally; the CLI converts them to the legacy CSV shape expected by `daily_processor.py`.

### Indie adapters (PR 16) and normalized raw JSON logs (PR 17)

`webscrapetheaters.py` delegates to `reel_seattle/adapters/siff.py` and `reel_seattle/adapters/beacon.py`. Each adapter fetches and parses its site HTML, returns `RawShowtime` records, writes a normalized JSON daily log under `data/daily_logs/YYYY-MM-DD_{source}.json`, and the CLI converts combined records to the legacy indie CSV shape (`public/indieshowtimes.csv`). SIFF venues include SIFF Cinema Downtown, SIFF Cinema Uptown, and SIFF Film Center; Beacon rows use `The Beacon`.

`amc_logger.py` and the indie scraper still write legacy CSV files for at least one release cycle. `daily_processor.py` reads today's JSON logs first when present; missing JSON falls back to CSV. Malformed JSON raises a clear error and does not silently fall back.

Matching order for each AMC API theatre:

1. `source_external_id` when populated in the registry and present on the API record
2. Normalized canonical `name` or `aliases` (case-insensitive, whitespace-collapsed)

Unmatched or disabled theatres are skipped with a summary log line. `source_external_id` values can be populated when an `AMC_API_KEY` discovery run maps API ids to registry names; until then, name matching is used.

Venues not listed here (e.g. Northwest Film Forum, Grand Illusion) are intentionally omitted until a dedicated adapter PR adds them.

## Data Structure

### showtimes_history.csv

**Canonical path:** `data/history/showtimes_history.csv` — read and written by `daily_processor.py`.

**Marathon export (PR 19):** `scripts/marathon/find_marathons.py` reads `public/data/showtimes_current.json`, not history CSV.

**Deploy:** The full history CSV is **not** copied into `dist/` or served to browsers. Canonical history remains in `data/history/showtimes_history.csv` only. The obsolete `public/data/showtimes_history.csv` compatibility copy has been removed and is listed in `.gitignore` so it cannot be accidentally re-committed.

### showtimes_current.json

**Path:** `public/data/showtimes_current.json` — emitted at the end of `daily_processor.py` after history is saved.

This artifact contains normalized showtimes for **today through today + 14 days** (inclusive). The React app loads this file via `src/showtimesAdapter.js` (dev: `/data/showtimes_current.json`, production: `./data/showtimes_current.json`).

Top-level fields:

| Field | Purpose |
|-------|---------|
| `schema_version` | Artifact shape version (`1.0.0`) |
| `generated_at` | Build timestamp (`America/Los_Angeles`) |
| `window` | Inclusive ISO date range covered |
| `sources_included` | Adapter sources present in the window (`amc`, `siff`, `beacon`) |
| `stats` | Counts of showtimes, films, and theaters with showtimes |
| `theaters` | Registry snapshot (enabled theaters, plus any disabled theater with showtimes) |
| `films` | Deduplicated film refs keyed by `showtime_film_key` |
| `showtimes` | Normalized showtime records with stable `id` hashes |

Normalization uses `reel_seattle/normalize/` (ISO dates, 24h times, display times, runtime minutes, format tags, theater resolution). Canceled AMC showtimes are excluded. History CSV columns are unchanged.

Before writing, the emitter validates `data/theaters.json` against `schema/theaters/v1.0.0.json` and the generated artifact against `schema/showtimes_current/v1.0.0.json`. A validation failure aborts `daily_processor.py` and leaves the previous `showtimes_current.json` in place.

The artifact includes a `sources` object with per-adapter freshness (`success`, `stale`, `empty`) and `last_successful_run` dates derived from current-window showtimes or best-available history signals. `sources_included` is retained for backward compatibility.

### pipeline_report.json

**Path:** `public/data/pipeline_report.json` — emitted immediately after `showtimes_current.json`.

Summarizes the daily pipeline run: overall `status`, the current 14-day `window`, per-source counts and freshness (with `warnings` / `errors` arrays for future adapter instrumentation), `totals`, and free-form `messages`.

Source status rules (derived from the current artifact and history scan, not live adapter telemetry):

| Status | Meaning |
|--------|---------|
| `success` | Source has one or more showtimes in the current window |
| `stale` | No current-window showtimes, but matching rows exist in history |
| `empty` | No current-window showtimes and no historical evidence |
| `failed` | Reserved for detected build/validation failures (not inferred from missing scrape data) |

`last_successful_run` is the max `last_seen_at` among current-window rows when status is `success`; otherwise the latest show or `last_updated` date found in history for that source; `null` when there is no evidence.

```csv
Date,Time,Theater,Film,Runtime,isAlmostSoldOut,posterDynamic,isCanceled,premiumFormat,hasTrailers,maximumIntendedAttendance,first_seen_date,last_updated,source,theater_id,showtime_film_key,time_24h
07/11/2025,7:00 PM,SIFF Film Center,Year of the Fox,97,None,https://...,,,,,2024-01-15,2024-01-16,indie,siff-film-center,year-of-the-fox,19:00
```

**Additive keys (Phase 1, PR 10):** `theater_id` and `showtime_film_key` are normalized stable identifiers. They are resolved from `data/theaters.json` and the film title via `reel_seattle/normalize/`. Unresolved theaters (e.g. out-of-scope AMC locations omitted from the registry) or missing film titles leave these columns blank. The React app ignores them.

**Canonical time column (Phase 1, PR 18):** `time_24h` stores machine-readable `HH:MM` derived from legacy `Time` via `reel_seattle/normalize/times.py`. The legacy `Time` column remains the display value used by the current React app. Ambiguous clock values without AM/PM (for example `7:30`) leave `time_24h` blank. `showtimes_current.json` prefers `time_24h` when present and falls back to parsing `Time`.

Backfill existing history with:

```bash
python scripts/migrate_history_keys.py
python scripts/migrate_history_times.py
```

Each migration updates canonical history only.

**Null normalization (Phase 1, PR 12):** Optional history fields such as `Runtime` and `posterDynamic` are cleaned when rows are read or written. Literal sentinels (`None`, `Unknown`, `N/A`, blank) become empty strings in CSV. `showtimes_current.json` uses JSON `null` for unknown optional values (`runtime_min`, `poster_url`, metadata dates, etc.) via `reel_seattle/normalize/`.

**AMC restate:** Each scrape replaces AMC rows for **today and future** in history (dropped showtimes disappear). Past AMC days are never removed.

**Indie restate (PR 13):** SIFF and Beacon are restated independently for **today and future**, mirroring AMC semantics. Source is inferred from the theater registry (`siff` or `beacon`, not generic `indie`). Each source has its own safety guard: if incoming future rows for that source are zero but history has future rows for that source, restate is skipped with an `ERROR:` log. A failed SIFF scrape does not block a valid Beacon restate.

**AMC restate safety guard:** If `public/showtimes.csv` has zero today-and-future rows but history still has AMC forward rows, the processor **skips** AMC restate and preserves existing forward AMC history (logs an `ERROR:` message). This prevents a failed or stale scrape from wiping irreplaceable forward-window data.

### movies_announcements.csv
```csv
Film,Theater,first_announced_date,last_seen_date
Year of the Fox,SIFF Film Center,2024-01-15,2024-01-16
```

### newly_announced.csv
```csv
Film,Theater,first_announced_date,last_seen_date
New Movie,AMC Pacific Place,2024-01-16,2024-01-16
```

### newly_added_current.json
```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-06-26T21:52:58-07:00",
  "days_back": 7,
  "entries": [
    {
      "showtime_film_key": "example-movie",
      "film_title": "Example Movie",
      "theater_id": "amc-pacific-place-11",
      "theater_name": "AMC Pacific Place 11",
      "first_announced_date": "2026-06-26",
      "last_seen_date": "2026-06-26"
    }
  ]
}
```

## Setup for GitHub Actions

1. **Add AMC API Key Secret**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add secret named `AMC_API_KEY` with your AMC API key

2. **Enable Actions**:
   - Go to repository Settings → Actions → General
   - Enable "Allow all actions and reusable workflows"

3. **First Run**:
   - Go to Actions tab
   - Click "Daily Showtime Scraping"
   - Click "Run workflow" to test

## Monitoring

### Check Recent Activity
- View `public/data/newly_added_current.json` for recently announced movies in the current window
- View `public/data/newly_announced.csv` for the full last-7-days announcement CSV slice
- Check `data/daily_logs/` for archived daily data
- Monitor GitHub Actions tab for execution status

### Troubleshooting
- Check individual script outputs in GitHub Actions logs
- Verify `AMC_API_KEY` secret is set correctly
- Ensure all dependencies are installed

## Benefits

- **Historical Preservation**: Never lose past showtime data
- **New Movie Tracking**: Easy to find recently announced movies  
- **Data Integrity**: Track when showtimes were added/removed
- **Scalable**: Easy to add more theaters
- **Automated**: Runs daily without manual intervention
- **Version Controlled**: All data changes tracked in Git 