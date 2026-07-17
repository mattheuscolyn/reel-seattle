# Reel Seattle — Data Artifact Inventory

**Status:** Living document  
**Track:** Data Foundation  
**Purpose:** Clarify which files are canonical, generated, legacy, deployed, or obsolete so daily pipeline work and feature development do not drift.

**Related:** [development-operating-model.md](./development-operating-model.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [SCRAPING_README.md](../SCRAPING_README.md) · [product-roadmap.md](./product-roadmap.md)

---

## 1. Canonical authored data

These files define truth in the repo. Edit intentionally; validate before commit.

| Path | Role | Notes |
|------|------|-------|
| `data/theaters.json` | Theater registry | Authored canonical copy; synced byte-for-byte to `public/data/theaters.json` by `daily_processor.py` / `reel_seattle/registry_sync.py` |
| `data/history/showtimes_history.csv` | Showtime archive | Append-only history; restated today+future per source on each daily run; never delete past rows |
| `schema/*/v1.0.0.json` | JSON Schema contracts | Define public JSON artifact shapes; change only with intentional contract updates |

**Schema files (v1.0.0):**

- `schema/showtimes_current/v1.0.0.json`
- `schema/pipeline_report/v1.0.0.json`
- `schema/newly_added_current/v1.0.0.json`
- `schema/leaving_soon_current/v1.0.0.json`
- `schema/theaters/v1.0.0.json`
- `schema/showtime/v1.0.0.json` — stub-level reference schema
- `schema/source_catalog/amc_movie_products/v1.0.0.json` — durable internal AMC product catalog
- `schema/source_catalog/amc_release_observations/v1.0.0.json` — durable internal AMC release observations

**History CSV columns** are enforced in code (`HISTORY_FIELDNAMES` in `daily_processor.py`), not by a separate schema file.

---

## 2. Generated data

Produced by the pipeline or analysis scripts. Do not hand-edit except emergency repair.

| Path | Producer | Committed? |
|------|----------|------------|
| `public/data/showtimes_current.json` | `reel_seattle/emit/current.py` | Yes — daily |
| `public/data/pipeline_report.json` | `reel_seattle/pipeline_report.py` | Yes — daily |
| `public/data/newly_added_current.json` | `reel_seattle/emit/newly_added.py` | Yes — daily |
| `public/data/leaving_soon_current.json` | `reel_seattle/emit/leaving_soon.py` | Yes — daily (review-only; not shipped to Pages) |
| `public/data/theaters.json` | `reel_seattle/registry_sync.py` | Yes — copy of canonical registry |
| `public/data/movies_announcements.csv` | `daily_processor.py` | Yes — daily |
| `public/data/newly_announced.csv` | `daily_processor.py` | Yes — daily |
| `data/analysis/*` | Offline analysis scripts | No — gitignored |
| `audit-output/*` | Manual audit CLI / workflow artifacts | No — gitignored |
| `schema/ingestion/independent_source_observations/v1.0.0.json` | Internal independent-source observation contract schema | Authored · internal · **not** public |
| `tests/fixtures/adapters/beacon_*.html` | Beacon calendar/film HTML fixtures (Astro-shaped) | Adapter tests · P-19A |
| `docs/beacon-minimal-alignment.md` | Beacon P-19A title/year/identity notes | Documentation |
| `docs/siff-minimal-alignment-design.md` | SIFF P-20A minimal alignment design | Design · not implemented |
| `tests/fixtures/adapters/nwff/` | NWFF HTML fixtures for prototype | Test fixtures · not production data |
| `reel_seattle/ingestion/` | Shared independent-source observation contract | Library · non-production adapters |
| `reel_seattle/prototypes/nwff.py` | NWFF contract emitter prototype | Non-production · local/workflow only |
| `docs/nwff-ingestion-prototype.md` | NWFF non-production prototype guide | Authored |
| `reel_seattle/prototypes/central_cinema.py` | Central Cinema contract emitter prototype | Non-production · local/workflow only |
| `scripts/prototype_central_cinema_ingestion.py` | Central Cinema prototype CLI | Fixture or live read-only |
| `docs/central-cinema-ingestion-prototype.md` | Central Cinema non-production prototype guide | Authored |
| `docs/central-cinema-production-integration-design.md` | Central Cinema production integration design (P-17B) | Authored |
| `docs/central-cinema-contract-mapping.md` | Central Cinema contract→indie mapping (P-17C) | Authored |
| `docs/central-cinema-production-adapter.md` | Central Cinema production adapter (P-17D/E) | Authored |
| `reel_seattle/adapters/central_cinema.py` | Production Central adapter | Daily + manual |
| `scripts/scrape_central_cinema.py` | Manual Central scrape CLI | Live or fixture |
| `.github/workflows/central_cinema_manual_scrape.yml` | Manual Central scrape workflow | workflow_dispatch · read-only |
| `data/daily_logs/YYYY-MM-DD_central_cinema.json` | Option C Central daily scrape log | Tracked generated data |
| `reel_seattle/ingestion/central_cinema_mapping.py` | Central IndependentSourceResult → RawShowtime mapper | Library · offline only |
| `scripts/map_central_cinema_contract_to_indie.py` | Offline Central mapping CLI | No network · no daily_logs |
| `.github/workflows/central_cinema_ingestion_prototype_audit.yml` | Central Cinema prototype audit | workflow_dispatch · read-only |
| `tests/fixtures/prototypes/central_cinema/` | Central Cinema HTML fixtures | Test fixtures · not production data |
| `docs/nwff-production-integration-design.md` | NWFF production integration design (P-16E) | Authored |
| `reel_seattle/ingestion/nwff_mapping.py` | NWFF IndependentSourceResult → RawShowtime mapper | Library · offline / adapter |
| `docs/nwff-contract-mapping.md` | NWFF contract→indie mapping (P-16F) | Authored |
| `docs/nwff-production-adapter.md` | NWFF manual production adapter (P-16G) | Authored |
| `reel_seattle/adapters/nwff.py` | Production NWFF adapter (daily + manual) | Scheduled via `webscrapetheaters.py`; manual CLI/workflow |
| `scripts/scrape_nwff.py` | Manual NWFF scrape CLI | Live or fixture · local/artifact output |
| `.github/workflows/nwff_manual_scrape.yml` | Manual NWFF scrape workflow | workflow_dispatch · read-only |
| `data/daily_logs/YYYY-MM-DD_nwff.json` | Option C NWFF daily scrape log | Tracked generated data |
| `scripts/prototype_nwff_ingestion.py` | NWFF prototype CLI | Fixture or live read-only |
| `local-output/*` | Manual local tool/prototype outputs | No — gitignored |

### Durable AMC source catalog (internal; production-generated)

Contracts and writers described in [amc-source-catalog.md](./amc-source-catalog.md). Daily wiring: [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md).

| Path | Role | Status |
|------|------|--------|
| `schema/source_catalog/amc_movie_products/v1.0.0.json` | Durable product schema | Authored · internal · **not** public |
| `schema/source_catalog/amc_release_observations/v1.0.0.json` | Durable release schema | Authored · internal · **not** public |
| `data/source_catalog/amc_movie_products.json` | Durable product catalog | **Production-generated internal artifact** — written by daily workflow after showtime validation · tracked in generated-data commits · **not** public |
| `data/source_catalog/amc_release_observations.json` | Durable release observations | Same status · derived from the product catalog · **not** public |
| `local-output/amc-source-catalog/*.json` | Offline merge CLI outputs | Local/manual · gitignored · not public |
| `local-output/amc-source-refresh/amc_source_catalog_observations.json` | Normalized refresh-stage observations | Internal generated stage artifact · local/workflow temporary · regenerable · **not** durable SoT · **not** public · **not** committed |
| Runner temp `amc-source-catalog-*` | Daily orchestration work dir | Ephemeral · cleaned up · not committed |
| `tests/fixtures/source_catalog/` | Offline discovery/response fixtures | Test fixtures · not production data |

Do not ship to Pages, SPA, or Developer Data Cockpit. Do not treat as authored canonical film data.

### Prototype AMC source observations (historical; superseded for durable work)

Manual, offline-only prototype described in [amc-source-observation-prototype.md](./amc-source-observation-prototype.md). Retained as a historical reference; durable work should use `schema/source_catalog/` and `reel_seattle/source_catalog/` instead.

| Path | Role | Status |
|------|------|--------|
| `schema/prototypes/amc_movie_products/v1.0.0.json` | Prototype product schema | Authored · superseded for durable work · **not** a public production contract |
| `schema/prototypes/amc_release_observations/v1.0.0.json` | Prototype release schema | Authored · superseded for durable work · **not** a public production contract |
| `local-output/amc-source-observations/*.json` | Built from sanitized audit JSON | Local/manual · not public · not canonical · not workflow-owned |
| `tests/fixtures/analysis/amc_source_observations/` | Example-only fixture inputs | Test fixtures · not production data |

No production process consumes these prototype artifacts. Do not ship to Pages.

---

## 3. Public data artifacts (`public/data/`)

All files under `public/data/` are pipeline outputs or registry copies consumed locally and/or committed for the daily workflow.

| File | Public site use | Pages (`dist/`) |
|------|-----------------|-----------------|
| `showtimes_current.json` | Showtimes + Planner (14-day window) | **Shipped** |
| `pipeline_report.json` | Showtimes data-status panel | **Shipped** |
| `newly_added_current.json` | Recently Added section | **Shipped** |
| `theaters.json` | Theater metadata (via showtimes artifact) | **Shipped** |
| `leaving_soon_current.json` | Review-only model output | **Not shipped** |
| `movies_announcements.csv` | Pipeline input/output tracking | **Not shipped** |
| `newly_announced.csv` | Pipeline intermediate | **Not shipped** |

---

## 4. Deployed Pages artifacts (`dist/`)

`dist/` is **gitignored** and built by `npm run build`. Vite copies `public/` selectively (`vite.config.js` `selectivePublicCopy`).

**Required in `dist/data/`** (enforced by `scripts/check_dist_artifacts.mjs`):

- `dist/data/showtimes_current.json`
- `dist/data/pipeline_report.json`
- `dist/data/newly_added_current.json`
- `dist/data/theaters.json`

**Explicitly forbidden in `dist/`:**

- `dist/data/showtimes_history.csv`
- `dist/data/movies_announcements.csv`
- `dist/data/newly_announced.csv`
- `dist/data/leaving_soon_current.json`
- `dist/data/daily_logs/`

Also required: `dist/404.html`, `dist/marathon/index.html`.

---

## 5. Legacy compatibility files

Still written and committed by the daily scrape; JSON scrape logs are preferred when present.

| Path | Role |
|------|------|
| `public/showtimes.csv` | AMC scrape CSV fallback |
| `public/indieshowtimes.csv` | SIFF + Beacon indie scrape CSV fallback |
| `public/marathon/` | Legacy Marathon redirect shell (still checked in dist) |

Ingest order: `data/daily_logs/*.json` preferred → CSV fallback in `daily_processor.py`.

---

## 6. Daily scrape outputs

**Orchestration:** `run_daily_scraping.py` → `webscrapetheaters.py` + `amc_logger.py` → `daily_processor.py`

**Structured scrape logs (preferred ingest):**

```
data/daily_logs/YYYY-MM-DD_amc.json
data/daily_logs/YYYY-MM-DD_siff.json
data/daily_logs/YYYY-MM-DD_beacon.json
data/daily_logs/YYYY-MM-DD_nwff.json
data/daily_logs/YYYY-MM-DD_central_cinema.json
```

AMC logs use schema `1.0.0` with optional expanded fields under `record.attributes` (P-18A; see [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md)).

**Also updated each daily run:**

- `data/history/showtimes_history.csv`
- All `public/data/*` artifacts listed above
- `public/showtimes.csv`, `public/indieshowtimes.csv`
- `data/theaters.json` (if registry changed)
- `public/marathon/` (when applicable)

**GitHub Action:** `.github/workflows/daily_scraping.yml` (cron 06:00 UTC + `workflow_dispatch`) auto-commits as `Daily showtime data update YYYY-MM-DD`.

---

## 7. Obsolete paths — do not reintroduce

| Path | Why obsolete |
|------|--------------|
| `public/data/showtimes_history.csv` | Canonical history is `data/history/showtimes_history.csv` (gitignored here) |
| `public/data/daily_logs/` | Scrape logs belong in `data/daily_logs/` |

Both paths are gitignored and fail validation if present.

---

## 8. Do not manually edit

Unless doing scoped emergency repair with owner approval:

- `public/data/*.json` — regenerate via `daily_processor.py`
- `public/data/*.csv` (announcements) — regenerate via processor
- `data/history/showtimes_history.csv` — only via processor restate logic
- `public/showtimes.csv`, `public/indieshowtimes.csv` — only via scrapers/processor
- `dist/` — always rebuild with `npm run build`; never commit

**Safe to edit intentionally:**

- `data/theaters.json` (then run processor to sync public copy)
- `schema/*` (with contract tests and emit validation updates)
- Pipeline/emit code

---

## 9. Expected daily pipeline movement

These files **may change on every scheduled scrape** without a human commit:

- `data/history/showtimes_history.csv`
- `data/daily_logs/*.json`
- All committed `public/data/*` artifacts
- `public/showtimes.csv`, `public/indieshowtimes.csv`

Treat `origin/main` advancing with `Daily showtime data update …` commits as normal. Pull or rebase before pushing local work.

---

## 10. Validation gates

| Gate | When | What it checks |
|------|------|----------------|
| `scripts/validate_public_data_artifacts.py` | Daily scrape (pre-commit), CI Python job | Five `public/data/*.json` files exist; JSON Schema via `reel_seattle/validate.py`; `data/theaters.json` byte-matches `public/data/theaters.json`; obsolete paths absent |
| `reel_seattle/validate.py` | On Python emit write | Schema validation at artifact generation |
| `scripts/check_dist_artifacts.mjs` | CI frontend job (`npm run build`) | Required/forbidden `dist/` paths; registry sync; JSON parse |
| `pytest` (`tests/validate/`, `tests/emit/`, golden harness) | CI | Schema and emit contract tests |
| `.github/workflows/ci.yml` | Push/PR to `main` | pytest + validate script + frontend build + dist check |
| `.github/workflows/daily_scraping.yml` | Daily cron | Scrape → processor → validate script → auto-commit |
| `.github/workflows/deploy.yml` | Push + schedule | Build + deploy `dist/` to GitHub Pages |

---

## 11. Recommended Git handling

1. **Do not use `git add .`** — stage intentional paths only.
2. **Separate commit types when possible:** code/docs commits vs daily generated-data commits.
3. **Expect remote movement:** if `origin/main` is ahead after a daily scrape, `git pull --rebase origin main` before pushing local work.
4. **Do not commit `dist/`** — it is gitignored; Pages deploy builds fresh from `public/`.
5. **Do not commit `data/analysis/`** — gitignored modeling outputs.
6. **Do not commit `local-output/` or live audit outputs** — prototype/manual measurement only.
7. **Before pushing data-sensitive work:** run `python scripts/validate_public_data_artifacts.py` locally if `public/data/` changed.
8. **Restore accidental dist dirt:** `git restore dist/` or rebuild; do not commit local build output.

---

## Quick reference — data flow

```
Scrapers (AMC API, SIFF, Beacon)
  → data/daily_logs/*.json  (+ public/*.csv fallbacks)
  → daily_processor.py
  → data/history/showtimes_history.csv
  → reel_seattle/emit/* + pipeline_report + registry_sync
  → public/data/*.json (+ announcement CSVs)
  → npm run build (selective copy)
  → dist/data/ (lean subset → GitHub Pages)
```
