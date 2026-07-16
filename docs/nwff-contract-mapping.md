# NWFF Contract → Indie Mapping

**Status:** Implemented foundation (P-16F) — **not scheduled / not restated**  
**Module:** `reel_seattle.ingestion.nwff_mapping`  
**CLI:** `scripts/map_nwff_contract_to_indie.py` (offline only)  
**Design:** [nwff-production-integration-design.md](./nwff-production-integration-design.md)  
**Last updated:** 2026-07-15 (P-16G)

## Purpose

Convert a validated NWFF `IndependentSourceResult` v1.0.0 into:

1. Legacy-compatible `RawShowtime` records
2. A production-shaped scrape-log envelope (contract + records + mapping diagnostics)
3. A final `restate_safe` recommendation for a future processor (not invoked here)

No HTML parsing and no HTTP requests occur in this module.

## Registry

Canonical entry in `data/theaters.json` (synced to `public/data/theaters.json`):

* `id`: `northwest-film-forum`
* `source`: `nwff` (theater schema enum extended)
* aliases: `NWFF`, `Northwest Film Forum`

`showtimes_current` theater snapshots also accept `source: nwff` so registry embedding validates. Public showtime/`sources_included` enums still exclude `nwff` until P-16H.

## Location policy

Accept only conservatively normalized main-venue labels:

* `northwest film forum`
* `nwff`

Reject (completeness-affecting):

* off-site / partner labels
* missing location
* online / virtual tokens

No silent default to NWFF.

## Identity

| Concept | Rule |
|---------|------|
| Program ID | `source_program_id` slug → `attributes.source_film_id` / `source_program_id` |
| Showtime ID | remains `null` |
| Fallback components | `program + theater + local_date + local_time` in attributes |
| Collision discriminator | occurrence ticket URL (preferred), else preserved start ISO / discriminator |
| Unresolved collision | mapping `unsafe`; no silent drop of conflicting rows |
| Exact duplicate | same composite + same non-empty discriminator → dedupe |

Normalized title is never used as identity. Title changes do not change the slug.

## Field mapping (summary)

| Contract | Legacy / log |
|----------|----------------|
| occurrence `source_title` | `title_raw` (calendar title) |
| program `source_title` | contract + `attributes.program_page_title` |
| `source_program_url` | `source_film_url` |
| occurrence `ticket_url` | `ticket_url_raw` + attributes |
| program ticket | `attributes.program_page_ticket_url` only |
| runtime / year | only when confidently present in program `raw` |
| windows / warnings / rejects | mapping block + stats |

## Log envelope (Option C)

```text
schema_version, generated_at, source
independent_source_result   ← full sanitized contract
mapping                     ← status, restate_safe, warnings, rejects
records[]                   ← RawShowtime dicts
stats / warnings / errors   ← scrape-log compatible
```

## Final restatement safety

```text
final_restate_safe =
  contract.restate_safe
  AND mapping did not fail
  AND no completeness-affecting mapping rejects
  AND no unresolved identity collisions
```

Mapping **cannot** upgrade an unsafe contract to safe. Workshop rejects alone do not make mapping unsafe.

## Offline CLI

```bash
python scripts/map_nwff_contract_to_indie.py \
  --input tests/fixtures/ingestion/nwff_mapping/safe_success.json \
  --output local-output/nwff-mapping/nwff_log.json
```

## Next step

**P-16G complete** for mapping consumers: use `reel_seattle.adapters.nwff` + [nwff-production-adapter.md](./nwff-production-adapter.md).

**P-16H:** scheduled daily integration, tracked `data/daily_logs/`, conditional restatement, pipeline-report source support.
