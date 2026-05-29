# Movie Marathon Planner

Plans same-day in-theater marathons from **AMC showtimes** in `public/data/showtimes_history.csv` (updated by `amc_logger.py` and `daily_processor.py`).

The planner page loads `marathon_showtimes.json` and computes marathon options in the browser. Users pick **date**, **theater**, **blacklist**, and **preferred** titles on the page and click **Recompute** (no Python rerun required for filter changes).

## Regenerate after scraping

1. Edit `BLACKLIST` and `PREFERRED_MOVIES` in `find_marathons.py` (titles must match the CSV `Film` column exactly).
2. Ensure showtimes history is current (`python run_daily_scraping.py` or wait for the daily GitHub Action).
3. Export:

   ```bash
   npm run marathon
   ```

   This writes `public/marathon/marathon_showtimes.json` and copies `static/index.html` + `static/marathon.js`.

4. Commit `public/marathon/` when you want the live site updated.

`daily_processor.py` runs this export automatically after each daily scrape.

## Deploy

Vite copies `public/marathon/` into `dist/` on build. Live URL: **https://www.reelseattle.com/marathon/**

## Notes

- Only **future** AMC showtimes are exported (today and later).
- `marathon_options_all.json` (`python find_marathons.py --all`) is a legacy full precompute export and is gitignored.
