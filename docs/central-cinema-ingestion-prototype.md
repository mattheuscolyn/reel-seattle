# Central Cinema Ingestion Prototype

**Status:** Non-production prototype (P-17A); production integration **designed** (P-17B) — not enabled  
**Module:** `reel_seattle.prototypes.central_cinema`  
**CLI:** `scripts/prototype_central_cinema_ingestion.py`  
**Contract:** IndependentSourceResult **v1.0.0**  
**Design:** [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md)  
**Last updated:** 2026-07-16

## Boundary

```text
Central-specific discovery and parsing
    ↓
IndependentSourceResult v1.0.0
```

This prototype does **not** write theater registry entries, daily logs, history, public artifacts, or pipeline-report enums.

## Calendar discovery

Source: `https://central-cinema.com/calendar/`

* Discovers links whose canonical path begins with `/movie/`
* Canonicalizes protocol/host (`www` vs bare), trailing slash, drops query/fragment
* Deduplicates by slug
* Preserves calendar link text vs schema.org title (warn on mismatch)
* Non-`/movie/` links are ignored

Structural proof requires an affirmative calendar shell (`#q-app`, “Explore Movies”, movie links, or calendar title markers). Zero regex matches alone is not valid empty.

## Program identity

```text
source_program_id = canonical /movie/ slug
```

Example: `faceslashoff`  
Title is never identity.

## Movie-page authority

Each unique movie page is fetched **once** and is authoritative for:

* schema.org Movie metadata (`itemprop`)
* checkout showtime links
* showing IDs and ticket URLs

Showtimes are **not** taken from calendar display text.

## Schema.org metadata

Parsed by `itemprop` inside the Movie itemtype:

* `name` → exact `source_title`
* `description` → sanitized paragraphs under `raw`
* `genre`, `contentRating`, `countryOfOrigin`
* `inLanguage` or `originalLanguage`
* `duration` → runtime minutes when unambiguous
* `actor` / `director` / `author` / `producer` arrays
* `image`
* `dateCreated` → **raw only**, never release year

Optional `copyrightYear` may populate `raw.release_year` when credible.

## Description sanitization

Reuses `sanitize_description_html` (HTML unescape, preserve `<p>` / `<br>`, strip markup, normalize NBSP). Stored as `description_text` + `description_paragraphs` under program `raw`. Screening notes (e.g. Hecklevision) remain prose in `raw` — no presentation-attribute extraction in P-17A.

## Showtimes

Checkout URLs:

```text
/checkout/showing/{slug}/{numeric_id}
```

* `source_showtime_id` = numeric segment (string)
* `showtime_strategy` = `source_showing_id`
* Visible link text supplies date/time
* Ticket URL = checkout URL
* `source_occurrence_url` = movie page URL
* Exact duplicate checkout links dedupe
* Conflicting duplicate showing IDs → unsafe

## Year inference

When the visible date omits a year, choose the **unique** year whose resolved date falls inside the requested inclusive window (using scrape date as context). Supports December→January rollover. Zero or multiple candidates → reject/warn (ambiguous year is completeness-affecting).

## Theater ID

Planned non-production ID: `central-cinema`  
Validated via `fixture_theater_ids(include_planned=True)`. **Not** in `data/theaters.json`.

## Completeness

| Status | When |
|--------|------|
| `success` | Calendar + all movie pages OK; window complete; `restate_safe=true` |
| `valid_empty` | Structure OK; all pages OK; zero in-window showtimes; proof present |
| `partial_failure` | Required page/showing parse failure; `restate_safe=false` |
| `structural_failure` | Calendar/movie schema structure missing |
| `request_failure` | Calendar request failed |

Malformed checkout showings (bad ID/date/time) are completeness-affecting.

## CLI

```bash
# Offline
python scripts/prototype_central_cinema_ingestion.py \
  --start-date 2026-12-28 --end-date 2027-01-10 \
  --fixture-dir tests/fixtures/prototypes/central_cinema \
  --output-dir local-output/central-cinema-prototype

# Live read-only
python scripts/prototype_central_cinema_ingestion.py \
  --start-date 2026-07-16 --end-date 2026-07-29 \
  --live --output-dir local-output/central-cinema-prototype
```

Outputs (gitignored under `local-output/`):

* `central_cinema_independent_source_result.json`
* `central_cinema_prototype_summary.json`

## Manual workflow

Optional: `.github/workflows/central_cinema_ingestion_prototype_audit.yml`  
`workflow_dispatch` only, `contents: read`, no secrets, no commits, artifact upload.

## Known limitations

* Calendar is a SPA shell; discovery relies on server-rendered Explore Movies links.
* No production venue/off-site labels observed on movie pages in initial live sample — unknown locations are not defaulted.
* Trailer extraction out of scope.
* Contract v1.0.0 was sufficient; no revision required for P-17A.

## Production prerequisites (future)

See [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md) and [central-cinema-contract-mapping.md](./central-cinema-contract-mapping.md).

1. **P-17C** — Registry entry + offline contract→indie mapping — **Complete**
2. **P-17D** — Production-compatible adapter + manual workflow — **Complete** ([central-cinema-production-adapter.md](./central-cinema-production-adapter.md))
3. **P-17E** — Scheduled daily ingestion + conditional restatement

Chosen production source key: `central_cinema`. Showing IDs are mandatory. Theater ID: `central-cinema`. Do not enable scheduled Central until P-17E is explicitly scheduled.
