# Reel Seattle

A Seattle-area movie planning app: browse current showtimes, plan double features, and explore AMC marathon schedules.

## Features

- **Showtimes** — filter by theater and date; movie cards with poster, runtime, and showtimes
- **Double Feature Planner** — find back-to-back pairs at the same theater
- **Marathon Planner** — AMC same-day marathon explorer (standalone UI in iframe)
- Loads **`public/data/showtimes_current.json`** (14-day window, updated daily)
- Canonical historical archive: **`data/history/showtimes_history.csv`** (not shipped to the browser)

## Development

```bash
npm ci
npm run check:data-freshness
npm run dev
```

Before manual QA, run `npm run check:data-freshness`. It summarizes local `public/data` artifacts and warns when AMC or Marathon data looks stale or empty. Your workspace may be behind the latest GitHub/deployed artifacts — especially AMC showtimes. If warnings appear, pull the latest data files or run `python daily_processor.py` before drawing conclusions about Marathon or AMC behavior.

### Routes

| Path | Page |
|------|------|
| `/` | Showtimes |
| `/double-feature` | Double Feature Planner |
| `/marathon` | Marathon Planner (React shell + iframe) |

The Showtimes page includes a read-only **data status** panel sourced from `pipeline_report.json` (per-source freshness for AMC, SIFF, and Beacon).

Direct loads and refreshes work via **`public/404.html`** (GitHub Pages SPA fallback).

**Marathon paths:** share **`/marathon`** (no trailing slash). The iframe loads the standalone UI at **`/marathon/index.html`**. On static hosts, **`/marathon/`** may serve the standalone planner instead of the React shell — use `/marathon` for nav links.

Production build copies lean data artifacts into `dist/` (not the full history CSV). After building:

```bash
npm run build
npm run check:dist
npm run smoke:frontend
```

Manual browser QA checklist: **`docs/frontend-smoke-check.md`**.

Python pipeline and scraping: see **`SCRAPING_README.md`**.
