# Canonical film pipeline order (production)

## Scheduled jobs

| UTC | Workflow | Role |
|-----|----------|------|
| 06:00 | `daily_scraping.yml` | Ingest showtimes, normalize/parent identity, **attach public `film_id`**, emit + validate + publish `showtimes_current.json` |
| 08:00 | `film_enrichment.yml` | Build/validate/publish `film_enrichment_current.json` from durable confirmed catalog |
| manual | `film_identity_match.yml` | Live TMDB matching → catalog / review queue (not every daily run) |

## Daily showtime path (must retain nullable `film_id`)

1. scrape / ingest (`run_daily_scraping.py` → `daily_processor.py`)
2. normalize titles + screening qualifiers / parent identity (`analysis/film_identity.py` in emit)
3. resolve film identity from durable catalog + reviewed decisions (`attach_public_film_ids` in `write_showtimes_current`)
4. emit `public/data/showtimes_current.json` (nullable `films[].film_id`)
5. validate (`scripts/validate_public_data_artifacts.py`, includes attach regression gate)
6. commit/publish showtimes (+ related public data)

Live TMDB search is **not** required on every daily run. Enrichment is **intentionally independent** so TMDB outages never block showtimes.

## Regression gate

If the identity catalog has confirmed TMDB matches and current showtimes have attachable source aliases, but public films contain **zero** `film_id` values, validation fails. Partial coverage is allowed.
