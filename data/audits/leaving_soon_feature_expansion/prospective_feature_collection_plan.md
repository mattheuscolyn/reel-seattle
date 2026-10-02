# Prospective feature collection

Research only. Do not feed these fields to the production Leaving Soon model until each one has its own history and a later audit.

## Already in the daily logs, not yet a stable model input

| Field | Source | Cadence | Grain | Why | How long before a fair test |
| --- | --- | --- | --- | --- | --- |
| `ticketPrices` adult price | AMC showtimes attribute, daily log from 2026-07-19 | every daily scrape | showtime | Slot quality when the screening count is similar | Already partially usable; keep it on the lifecycle row so a later audit does not re-parse logs |
| `auditorium` and `layoutId` | same | every daily scrape | showtime | Screen identity. Not capacity. Useful only if a capacity table is joined later | Same as price |
| `isAlmostSoldOut`, `isSoldOut` | showtimes | every daily scrape | showtime | Demand flags. In this window they are true on a very small share of showtimes, so they need a longer run before they can be judged | One more season, and only if the true rate rises enough to split films |

`maximumIntendedAttendance` is on the payload and empty in every probed log. Keep the key. Do not invent a capacity.

## Not in the historical record

| Field | Source | Cadence | Grain | Storage | Why | How long |
| --- | --- | --- | --- | --- | --- | --- |
| Seat map or seats remaining, if AMC exposes one outside the showtimes list | A separate, rate-limited read of a purchase or seat endpoint. Confirm it means seats sold before storing it as demand | once per showtime on the day it is first on sale, then T-3, T-1 | showtime | one row: showtime id, observed at, capacity, unavailable seats, source field name | A thin schedule that is selling out is a different film from a thin schedule that is empty | At least one full booking season, roughly three months of paired snapshots, before fitting |
| Auditorium capacity | that same seat response, or a theater layout feed | once per layout id, refreshed when `layoutVersionNumber` changes | auditorium | layout id, seat count | Turns auditorium id into a commitment measure | As soon as the feed exists; capacity itself is stable |
| TMDB `popularity` | TMDB movie details | weekly, for films currently listed at an enabled AMC | film × week | tmdb id, week ending, popularity | Interest that the schedule has not yet reflected | 8 to 12 weekly snapshots before a first look |
| TMDB `vote_count` and `vote_average` | same call | same weekly snapshot | film × week | three numbers beside popularity | Growth in votes during the run | Same window. Do not backfill today's values onto old weeks |

Do not scrape seat maps aggressively. If the only access is a per-showtime purchase call, sample the visible week's showtimes once per snapshot day rather than polling. Store the raw count and the field name so a later audit can tell seats-held from seats-sold.

Estimated size for the research log: one row per showtime per snapshot day is what the daily logs already are. A compact side file of `(showtime id, snapshot date, adult price, auditorium, almost sold out, sold out)` is a few megabytes a month. A weekly TMDB file for the films on screen is a few hundred rows.

## Explicitly rejected for historical scoring

- Today's TMDB popularity, vote count, vote average, revenue, or budget.
- The movies-catalog `attribute_codes` list, which is the set of formats seen by the latest refresh.
- Any current seat map applied to a past week.
