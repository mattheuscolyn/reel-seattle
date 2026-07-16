# NWFF Production-Compatible Adapter (Manual)

**Status:** Implemented for manual collection (P-16G) — **not scheduled / not restated**  
**Module:** `reel_seattle.adapters.nwff`  
**CLI:** `scripts/scrape_nwff.py`  
**Workflow:** `.github/workflows/nwff_manual_scrape.yml` (`NWFF Manual Scrape`)  
**Mapping:** [nwff-contract-mapping.md](./nwff-contract-mapping.md)  
**Design:** [nwff-production-integration-design.md](./nwff-production-integration-design.md)  
**Last updated:** 2026-07-15

## Pipeline

```text
HTTP (or fixtures)
    ↓
prototype extraction (`build_nwff_result`)
    ↓
IndependentSourceResult v1.0.0 + validation
    ↓
contract→indie mapping (P-16F)
    ↓
Option C scrape-log envelope
    ↓
explicit output directory / Actions artifact only
```

## Entry point

```python
from reel_seattle.adapters.nwff import fetch_nwff, default_nwff_window

result = fetch_nwff(start_date, end_date)  # live
# result.records, result.contract, result.log_envelope, result.restate_safe
```

Offline:

```python
from reel_seattle.adapters.nwff import fetch_nwff_from_fixture_dir
```

## Window

Default inclusive Pacific window: **today .. today+13** (14 days).  
Calendar weeks may over-fetch; accepted showtimes are filtered to the requested dates.

## HTTP

* Descriptive User-Agent
* Timeout + transient retries
* Conservative pacing (`sleep_seconds`, default 0.35)
* Each canonical `/films/` page fetched once
* No secrets; no HTML in outputs

## Option C log

Filename: `YYYY-MM-DD_nwff.json` under an **explicit** output directory (not default `data/daily_logs/` in this task).

Contains:

* `independent_source_result`
* `mapping` (status, `restate_safe`, diagnostics)
* `records[]` (RawShowtime)
* scrape-log `stats` / `warnings` / `errors`

Validate with `validate_nwff_scrape_log`. Parser compatibility (no history write) via `prove_indie_parser_compatibility`.

## Statuses

Contract statuses (`success`, `valid_empty`, `partial_failure`, `structural_failure`, `request_failure`) are preserved. Final `restate_safe` comes from mapping and cannot upgrade an unsafe contract.

A valid unsafe log (partial/request/structural) is a successful **artifact**, not an implementation failure.

## CLI

```bash
# Live
python scripts/scrape_nwff.py \
  --start-date 2026-07-15 --end-date 2026-07-28 \
  --live --output-dir local-output/nwff-live

# Fixture
python scripts/scrape_nwff.py \
  --start-date 2026-07-14 --end-date 2026-07-20 \
  --fixture-dir tests/fixtures/adapters/nwff \
  --output-dir local-output/nwff-fixture
```

## Manual workflow

`workflow_dispatch` only · `contents: read` · no secrets · no commits · uploads `nwff-manual-scrape` artifact (30-day retention).

Optional inputs: `start_date`, `end_date` (empty → CLI defaults to 14-day window).

## Non-goals (deferred to P-16H)

* Scheduled daily scrape
* Writing tracked `data/daily_logs/`
* History restatement
* Public `showtimes_current` / pipeline-report `nwff` source enums
