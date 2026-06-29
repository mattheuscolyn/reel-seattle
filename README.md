# Reel Seattle

A Seattle-area movie planning app: browse current showtimes and plan same-theater movie schedules with the unified **Planner**.

## Features

- **Showtimes** — filter by theater and date; movie cards with poster, runtime, and showtimes; compact **Recently added** preview with link to the full list
- **Recently added** (`/recently-added`) — full list of newly announced films currently showing (linked from Showtimes; not in main nav)
- **Planner** — unified same-theater planner for 2–4 films or max-mode marathons (AMC, SIFF, Beacon); supports required, preferred (`preferred=...`), and excluded films; **Share lineup** on each result card copies or natively shares a readable schedule summary plus the current filter URL
- Legacy **`/marathon`** bookmarks redirect to **`/planner?count=max`** with optional localStorage filter migration
- Loads **`public/data/showtimes_current.json`** (14-day window, updated daily)
- Canonical historical archive: **`data/history/showtimes_history.csv`** (not shipped to the browser)

## Development

```bash
npm ci
npm run check:data-freshness
npm run dev
```

Before manual QA, run `npm run check:data-freshness`. It summarizes local `public/data` artifacts and warns when AMC data looks stale or empty. Your workspace may be behind the latest GitHub/deployed artifacts — especially AMC showtimes. If warnings appear, pull the latest data files or run `python daily_processor.py` before drawing conclusions about Planner or AMC behavior.

### Routes

| Path | Page |
|------|------|
| `/` | Showtimes (includes compact Recently added preview) |
| `/recently-added` | Full Recently added list (linked from Showtimes; not in main nav) |
| `/planner` | Unified Planner (primary planning route) |
| `/double-feature` | Redirects to `/planner?count=2` with mapped query params |
| `/marathon` | Redirects to `/planner?count=max` (migrates saved Marathon film filters from localStorage when present) |

Legacy Double Feature and Marathon routes are hidden from the main nav but remain reachable by direct URL for bookmarks. Both redirect into the unified Planner.

The Showtimes page includes a read-only **data status** panel sourced from `pipeline_report.json` (per-source freshness for AMC, SIFF, and Beacon).

Direct loads and refreshes work via **`public/404.html`** (GitHub Pages SPA fallback).

**Marathon retired (PR 66B-2):** `/marathon` and `/marathon/` redirect into Planner max mode. A static redirect stub lives at `public/marathon/index.html` for GitHub Pages deep links. The legacy iframe app and `marathon_showtimes.json` export have been removed.

**Double Feature retired (PR 67A–67B):** `/double-feature` redirects to `/planner?count=2` with supported legacy query params migrated (`date`, `theaters`, `start`, `movies`, `exclude`). The legacy `end` param is intentionally not migrated because Double Feature’s per-showtime end filter is not equivalent to Planner’s finish-by schedule filter. Legacy UI, engine, and utility modules have been removed; redirect migration code lives in `legacyDoubleFeatureUrlMigration.js` and `plannerUrlState.js`.

**Planner CSS (PR 68):** Planner UI uses neutral `.planner-*` class names. Double Feature remains only as a redirect/migration compatibility route.

Production build copies lean data artifacts into `dist/` (not the full history CSV). After building:

```bash
npm run build
npm run check:dist
npm run smoke:frontend
```

Manual browser QA checklist: **`docs/frontend-smoke-check.md`**.

Python pipeline and scraping: see **`SCRAPING_README.md`**.
