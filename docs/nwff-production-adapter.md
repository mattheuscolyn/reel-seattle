# NWFF Production Adapter

**Status:** Production-enabled (P-16H) — scheduled daily + manual workflow  
**Module:** `reel_seattle.adapters.nwff`  
**CLI:** `scripts/scrape_nwff.py`  
**Daily path:** `webscrapetheaters.py` → `data/daily_logs/YYYY-MM-DD_nwff.json`  
**Manual workflow:** `.github/workflows/nwff_manual_scrape.yml` (`NWFF Manual Scrape`)  
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
daily: data/daily_logs/YYYY-MM-DD_nwff.json
    ↓
daily_processor (records[] only; conditional restate)
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
Daily collection uses `FetchContext.run_date` the same way.

## HTTP

* Descriptive User-Agent
* Timeout + transient retries
* Conservative pacing (`sleep_seconds`, default 0.35)
* Each canonical `/films/` page fetched once
* No secrets; no HTML in outputs

## Option C log

Filename: `YYYY-MM-DD_nwff.json` under `data/daily_logs/` (scheduled) or an explicit `--output-dir` (manual).

Contains:

* `independent_source_result`
* `mapping` (status, `restate_safe`, diagnostics)
* `records[]` (RawShowtime)
* scrape-log `stats` / `warnings` / `errors`

Validate with `validate_nwff_scrape_log`. Parser compatibility (no history write) via `prove_indie_parser_compatibility`.

## Restatement (daily_processor)

Final eligibility:

```text
independent_source_result.restate_safe
AND mapping.restate_safe
AND stats.restate_safe
```

(`reconcile_option_c_restate_safe` ANDs these layers when loading.)

* **Safe:** wipe NWFF futures ≥ today for `northwest-film-forum`, insert mapped rows.
* **Unsafe:** preserve prior NWFF futures; do not partial-insert; retain raw log; emit warnings.
* **Valid empty (safe):** may clear future NWFF rows.
* Past rows never removed.
* SIFF / Beacon isolation preserved.

## Statuses

Contract statuses (`success`, `valid_empty`, `partial_failure`, `structural_failure`, `request_failure`) are preserved. Final `restate_safe` comes from mapping and cannot upgrade an unsafe contract.

A valid unsafe log (partial/request/structural) is a successful **artifact**, not an implementation failure. Soft-fail in `webscrapetheaters.py` isolates unexpected NWFF exceptions so SIFF/Beacon/AMC continue.

## CLI (manual)

```bash
# Live
python scripts/scrape_nwff.py \
  --start-date 2026-07-15 --end-date 2026-07-28 \
  --live --output-dir local-output/nwff-live
```

## Rollback

1. Remove or comment NWFF collection in `webscrapetheaters.py` (or skip writing the daily log).
2. Existing NWFF history rows remain archived.
3. Without a safe daily log, processor will not restate NWFF futures (CSV empty / missing JSON guards apply).
4. Keep raw logs under `data/daily_logs/` for diagnosis.
5. Do not remove the theater registry entry unless separately decided.

## Related

* Manual workflow remains available for ad-hoc inspection.
* Production validation: first/second daily runs after P-16H merge.
