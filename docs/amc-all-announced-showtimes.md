# AMC All Announced Future Showtimes

**Status:** Implemented  
**Track:** Data Foundation  
**Last updated:** 2026-09-02  
**Related:** [leaving-soon-model-design.md](./leaving-soon-model-design.md) · [amc-source-catalog.md](./amc-source-catalog.md) · [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md) · [SCRAPING_README.md](../SCRAPING_README.md)

Reel Seattle collects **every currently announced future AMC showtime** for enabled Seattle-area AMC theaters. Collection horizon and public viewing horizon are separate.

This is ingestion/raw-preservation work for later theater-capacity and Leaving Soon modeling. It does not implement the Leaving Soon model or any Leaving Soon UI.

## Contract

| Layer | Horizon | Location |
|-------|---------|----------|
| **Collection / modeling snapshot** | All currently announced future AMC performances | `data/daily_logs/YYYY-MM-DD_amc.json` |
| **History restate** | Today and all future AMC rows from that snapshot | `data/history/showtimes_history.csv`, `public/showtimes.csv` |
| **Public / frontend artifact** | Today through today + 14 days | `public/data/showtimes_current.json` via `reel_seattle/emit/current.py` `WINDOW_DAYS` |

Daily AMC snapshots preserve the full announced future schedule, including far-advance major releases and isolated event screenings. The SPA continues to read the 14-day public artifact unless a later product task expands that viewing window.

## Why not a 14 / 35 / 42-day fetch window

The previous adapter looped `GET /v2/theatres/{id}/showtimes/{date}` for each enabled theater across a fixed `DAYS_AHEAD = 14` calendar window.

That missed:

- Major releases whose tickets are on sale well beyond two weeks
- Isolated event / anniversary / special screenings with empty dates in front of them
- Source-catalog products whose only announced showtimes sat past the old boundary (they looked inactive)

AMC does **not** guarantee that empty calendar dates imply “nothing later exists.” Consecutive-empty-date stop rules are therefore forbidden.

## Discovery mechanism

Documented AMC Showtimes API:

```text
GET /v2/theatres/{theatre-number}/showtimes?page-number=1&page-size=100
```

AMC describes this as returning **all future showtimes for the specified theatre**. Responses are HAL collections (`count`, `_embedded.showtimes`, `_links.next`). Reel Seattle paginates with `page-size=100` (API max) and follows `_links.next`.

Production fetch is **one paginated collection per enabled theater**, not a date scan.

### Strategies considered

| Strategy | Completeness | Request volume | Notes |
|----------|--------------|----------------|-------|
| **A. Movies views then performances** | Uncertain | High | `now-playing` / `coming-soon` / `advance` are national product lists. `hasScheduledShowtimes` is a boolean. `earliestShowingUtc` is often the sentinel `1900-01-01`. `showtimesUrl` is a website URL, not an API showtimes collection. Would miss isolated events not listed in those views and would not replace per-theater performances. |
| **B. Undated theater showtimes collection (chosen)** | Documented complete for “all future showtimes” | Low | One paginated collection per enabled theater. Isolated later events appear on later pages, not behind empty dates. |
| **C. Theater/date scan with a large ceiling** | Only up to the ceiling | High | Old architecture scaled poorly; cannot prove isolated events beyond the ceiling. |
| **D. Hybrid discovery + date fetches** | No better than B | Higher | Movie-id filters on the theater showtimes endpoint still require knowing every product ID first. |

Movies API remains the **source-catalog metadata** path (`GET /v2/movies/{movieId}`). It is not the showtime discovery path.

## Request / runtime implications

Old effective maximum: **today through today + 14 days**, ~7 enabled theaters × 15 dates × (1 + pages) dated requests, with 1s sleep between days.

New: **~7 enabled theaters**, each paginated at up to 100 showtimes/page, 1s sleep between theaters (not between pages). Typical request count should be *lower* than the 14-day date scan even when farther-future rows are included.

`showtime_request_count`, `showtime_page_count`, `earliest_show_date`, and `farthest_show_date` are recorded on the daily log `stats` object.

## Failure semantics

| Outcome | `stats.restate_safe` | History |
|---------|----------------------|---------|
| Every enabled theater collection succeeded (including valid empty) | `true` | Restate today+future from the snapshot, unless incoming future count is 0 while history still has future AMC rows (legacy empty-incoming guard) |
| Any theater HTTP/pagination failure, incomplete `count`, runaway page guard, or empty theatres list | `false` | **Skip restate.** Existing future AMC history is preserved. Partial records remain in the scrape log for inspection. |

Successful zero-showtime results are distinct from errors: `restate_safe=true` with `records_fetched=0`. The processor still refuses to wipe known future rows when incoming future count is 0.

## Source-catalog lifecycle

Daily catalog discovery prefers **today’s AMC scrape log**, not `showtimes_current.json`.

A movie product stays **active** when it appears in that scrape log, even if its only announced showtimes are beyond the public 14-day viewing window.

`showtimes_current.json` remains a fallback discovery source for catalog tooling. It cannot see far-future-only products; production daily integration must keep using the scrape log.

## Safety ceiling

There is **no product date horizon** on AMC collection.

The only remaining cap is `MAX_SHOWTIME_PAGES_PER_THEATER = 200` (20,000 showtimes at page-size 100). That is a runaway-pagination guard. Hitting it is treated as an incomplete fetch (`restate_safe=false`), not as “AMC has no later showtimes.”

`FetchContext.window_end` is `9999-12-31` for the shared adapter contract and is **not** used to truncate AMC records.

## Observation-date boundary (model training)

Two different clocks:

| Boundary | Meaning |
|----------|---------|
| **Code deployment** | The commit on `main` that first contains this adapter (`collection_mode=all_announced_future` in production `amc_logger.py` / `run_daily_scraping.py`) |
| **First all-announced snapshot** | The first **successful** `data/daily_logs/YYYY-MM-DD_amc.json` whose `stats.collection_mode` is `all_announced_future` and `stats.restate_safe` is true |

Do **not** mark historical PIT logs (through the 2026-09-02 dated-scan era) as all-announced retroactively. Lifecycle-audit and survival-model v1 tables were built from that 14-day-capped history.

Until the first successful post-merge scrape exists, treat the code as deployed and the observation series as still waiting for its first all-announced point-in-time.

## Leaving Soon / capacity modeling later

Far-future advance bookings in daily snapshots let a later model distinguish:

- “AMC has not announced next week’s normal schedule yet”
- “AMC has already announced substantial future capacity for another release”

Do not infer leaving-soon from public 14-day emptiness alone. Use the raw snapshot plus observation time (`generated_at`), show datetime, `source_film_id` / `movie_id`, `source_showtime_id`, theater identity, and retained AMC metadata.
