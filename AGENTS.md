# AGENTS.md

## Cursor Cloud specific instructions

Reel Seattle is a Seattle-area movie showtimes + planning product. It has three parts, none of which need a database, Docker, or a backend API server:

- **Public Site** (primary): React 19 + Vite SPA. The "backend" is static JSON pre-committed under `public/data/` that the browser fetches at runtime.
- **Developer Data Cockpit** (optional dev tool): a second Vite app configured via `vite.cockpit.config.js`.
- **v2 shell** (local-only prototype): a third Vite app under `v2/` via `vite.v2.config.js`. Never shipped to Pages.
- **Python data pipeline** (batch, not a long-running service): scrapers + `daily_processor.py` that regenerate `public/data/*.json`. Only needed to refresh data; the app runs fine on committed JSON.

### Environment notes

- Node and npm are used for the frontend (`package.json`, lockfile is `package-lock.json`). Node >= 20 is required.
- Python dependencies are installed into a local virtualenv at `.venv/` (the startup update script creates it and installs `requirements-dev.txt`). Use `.venv/bin/python` / `.venv/bin/pytest` directly, or `source .venv/bin/activate` first — the repo docs say `python -m pytest`, but there is no system `python` executable (only `python3`), so run pytest through the venv.
- Creating the venv relies on the `python3-venv` system package (already present in the snapshot). This is a one-time system dependency, not part of the update script.

### Running services

- Public site (dev): `npm run dev` → http://localhost:5173/. Routes: `/` (Showtimes), `/recently-added`, `/planner`.
- Cockpit (optional): `npm run cockpit` → http://127.0.0.1:5174/.
- v2 shell (local-only): `npm run v2` → http://127.0.0.1:5175/. Build: `npm run build:v2` → `dist-v2/`. Allowlisted `/data` for Home adapter (I-02).
- Before manual QA, `npm run check:data-freshness` reports whether local `public/data` artifacts are stale (informational only; never fails).

### Lint / test / build (see `package.json` scripts and `.github/workflows/ci.yml`)

- Lint: `npm run lint`. NOTE: `main` currently has ~28 pre-existing `no-unused-vars` lint errors, and lint is NOT part of CI. Treat lint failures on untouched files as pre-existing.
- Frontend tests: `npm run test:frontend` (Node test runner over `tests/frontend/*.test.mjs`).
- Python tests: `.venv/bin/python -m pytest`.
- Build + verify: `npm run build`, then `npm run check:dist` and `npm run smoke:frontend`.
