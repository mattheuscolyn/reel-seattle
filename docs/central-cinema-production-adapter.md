# Central Cinema Production Adapter

**Status:** Manual / non-scheduled (P-17D) — **not** daily-enabled  
**Module:** `reel_seattle.adapters.central_cinema`  
**CLI:** `scripts/scrape_central_cinema.py`  
**Manual workflow:** `.github/workflows/central_cinema_manual_scrape.yml` (`Central Cinema Manual Scrape`)  
**Mapping:** [central-cinema-contract-mapping.md](./central-cinema-contract-mapping.md)  
**Design:** [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md)  
**Last updated:** 2026-07-16 (P-17D)

## Pipeline

```text
HTTP (or fixtures)
    ↓
prototype extraction (`build_central_cinema_result`)
    ↓
IndependentSourceResult v1.0.0 + validation
    ↓
contract→indie mapping (P-17C)
    ↓
Option C scrape-log envelope
    ↓
manual artifact only (explicit output dir / Actions artifact)
```

No second parser. No HTML→`RawShowtime` shortcut. Prototype, contract, and mapper remain distinct layers.

## Entry point

```python
from reel_seattle.adapters.central_cinema import fetch_central_cinema, default_central_cinema_window

result = fetch_central_cinema(start_date, end_date)  # live
# result.records, result.contract, result.log_envelope, result.restate_safe
```

Offline:

```python
from reel_seattle.adapters.central_cinema import fetch_central_cinema_from_fixture_dir
```

## Window

Default inclusive Pacific window: **today .. today+13** (14 days).  
CLI may override `--start-date` / `--end-date`. Accepted showtimes are filtered to the exact requested window. Not a 365-day legacy window.

## HTTP

* Descriptive User-Agent
* Timeout + transient retries
* Conservative pacing (`--sleep-seconds`, default 0.35)
* Calendar fetched once per run
* Each canonical `/movie/` page fetched once
* No auth, cookies, or browser automation

## SPA structural validation

Preserved from the prototype:

* calendar request succeeded
* non-empty body
* `#q-app` / Explore Movies shell
* canonical `/movie/` discovery
* movie-page schema.org Movie presence

**Zero discovered `/movie/` links** → `structural_failure` / `restate_safe=false` (not automatic valid empty).  
**Valid empty** requires inspected movie page(s) with zero in-window accepted showtimes and affirmative proof.

## Status semantics

| Status | Meaning |
|--------|---------|
| `success` | Complete window; safe when mapping also safe |
| `valid_empty` | Affirmative empty after page inspection |
| `partial_failure` | Required movie-page failure or completeness-affecting reject |
| `structural_failure` | Shell/discovery/schema failure, including zero-link discovery |
| `request_failure` | Calendar HTTP failure |

Mapping may downgrade safety; it never upgrades an unsafe contract.

## Option C log

Filename: `YYYY-MM-DD_central_cinema.json` under an **explicit** output directory only.

Envelope: full sanitized contract + mapping diagnostics + `records[]` + stats. No HTML, headers, secrets, or local paths. Does **not** default to `data/daily_logs/` (P-17E).

Validate with `validate_central_cinema_scrape_log`. Parser proof: `prove_indie_parser_compatibility` (no history write). Narrow allowlist: `raw_showtimes_to_legacy_rows("central_cinema")` for manual validation only.

## CLI

```bash
# Live
python scripts/scrape_central_cinema.py \
  --live \
  --start-date 2026-07-20 \
  --end-date 2026-08-02 \
  --output-dir local-output/central-cinema-live

# Fixture
python scripts/scrape_central_cinema.py \
  --start-date 2026-12-28 \
  --end-date 2027-01-10 \
  --fixture-dir tests/fixtures/prototypes/central_cinema \
  --output-dir local-output/central-cinema-fixture
```

Omit dates to use the default 14-day Pacific window. Valid unsafe artifacts may exit 0 when structurally valid and clearly reported.

## Manual workflow

* `workflow_dispatch` only
* `contents: read`
* No secrets, commits, PRs, or schedule
* Runs focused tests → live scrape → Option C validation → uploads artifact (`central-cinema-manual-scrape`, 30-day retention)
* Valid unsafe source results upload successfully; invalid logs fail validation

## Parser compatibility

`load_scrape_daily_log_payload` reads `records[]`. Legacy conversion recovers slug, numeric showing ID, exact title, unambiguous AM/PM times, and canonical theater. History and restatement are not invoked.

## Non-production status

P-17D does **not**:

* modify `daily_scraping.yml` or `webscrapetheaters.py`
* write tracked `data/daily_logs/`
* restate Central history
* add Central to public/pipeline-report showtime source enums

## Prerequisites for P-17E

1. Scheduled daily collection + tracked `YYYY-MM-DD_central_cinema.json`
2. Conditional restatement when `restate_safe`
3. History / public / pipeline-report source support
4. First and second production QC runs

## Live validation findings

Recorded in the P-17D completion report (two live runs; at least one via GitHub Actions). Monitor SPA zero-link structural failures, page fetch failures, malformed checkouts, and showing-ID conflicts before scheduling.
