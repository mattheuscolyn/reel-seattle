# Movie Marathon Planner

Plans same-day in-theater marathons from **AMC showtimes** in `public/data/showtimes_current.json` (emitted by `daily_processor.py`).

The planner page loads `marathon_showtimes.json` and computes marathon options in the browser. Users pick **date**, **theater**, **blacklist**, and **preferred** titles on the page and click **Recompute** (no Python rerun required for filter changes).

## Regenerate after processing

1. Edit `BLACKLIST` and `PREFERRED_MOVIES` in `find_marathons.py` (titles must match `film_title` in the current artifact exactly).
2. Ensure `public/data/showtimes_current.json` is current (`python daily_processor.py` or wait for the daily GitHub Action).
3. Export:

   ```bash
   npm run marathon
   ```

   This writes `public/marathon/marathon_showtimes.json` and copies `static/index.html` + `static/marathon.js`.

4. Commit `public/marathon/` when you want the live site updated.

`daily_processor.py` runs this export automatically after each daily run.

## Deploy

Vite copies `public/marathon/` into `dist/` on build.

**React app routes**

| URL | Purpose |
|-----|---------|
| `/marathon` | Marathon tab in the main Reel Seattle app (iframe shell) |
| `/marathon/index.html` | Standalone marathon planner loaded inside the iframe |

Share **`/marathon`** (no trailing slash) for the main app tab. On static hosts (GitHub Pages), **`/marathon/`** may serve the standalone `index.html` from the marathon directory instead of the React shell — nav links use `/marathon` to avoid that.

## Notes

- Only **AMC** showtimes from the current 14-day window are exported.
- Canceled showtimes and rows without `runtime_min` are skipped.
- Dates in `marathon_showtimes.json` remain `MM/DD/YYYY` for marathon UI compatibility.
- `marathon_options_all.json` (`python find_marathons.py --all`) is a legacy full precompute export and is gitignored.
