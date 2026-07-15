# AMC Source Observation Prototype

Non-production prototype for persisting AMC **movie-product** and **release-group** observations from sanitized Movies API audit data.

**Status:** prototype · local/manual · not public · not canonical · not consumed by production

## Purpose

Establish whether a source-specific observation model is practical before any daily-pipeline integration.

This follows the AMC relationship audit finding that `wwmReleaseNumber` is **useful grouping evidence** (high coverage, no unrelated collisions in the sample) but **not** a dependable automatic identity key (inconsistent sensory linkage; rare multi-product groups).

## Grains

### Movie product

```text
(source, source_film_id)  →  ("amc", AMC movie id)
```

Exact AMC product attached to showtimes (standard, sensory, Q&A, event, mystery, etc.). Product metadata is never inherited from another product.

### Release observation

```text
(source, source_release_id)  →  ("amc", wwmReleaseNumber)
```

Nullable grouping evidence only. Status is always `grouping_evidence_only`.

Shared release IDs do **not** merge products, select a canonical member, or replace `source_film_id`.

### Showtimes (conceptual only)

Showtimes continue to reference the AMC movie product (`source_film_id`). They do not join through a release observation in this prototype.

## Why release IDs are nullable

Audit coverage was high but not universal (e.g. some Fan Faves titles missing `wwmReleaseNumber`). A product observation remains valid without a release ID; no release observation is created for that product.

## Sensory inconsistency (audit evidence)

- *The Odyssey* standard + sensory shared `377232`
- *Moana* standard (`348229`) and sensory (`419382`) used **different** release numbers

The prototype stores that reality; it does not force sensory products onto another product’s release.

## Artifacts

Built under a local ignored directory (recommended):

```text
local-output/amc-source-observations/amc_movie_products.json
local-output/amc-source-observations/amc_release_observations.json
```

Schema files (prototype namespace):

```text
schema/prototypes/amc_movie_products/v1.0.0.json
schema/prototypes/amc_release_observations/v1.0.0.json
```

`schema_version` starts at `1.0.0` for these **new** artifacts while `artifact_status` remains `"prototype"`.

### Provenance

Each record includes:

- `provenance.source_endpoint` = `amc_movies_api`
- `provenance.source_audit` = input path
- `observed_at` = audit `generated_at` when present
- `derived_fields` listing inspection-only fields (category, variation flags, member counts, etc.)

### Presentation categories

Reuse audit-only labels (`standard`, `sensory_friendly`, …). They are source-observation labels, not production identity rules.

## Build locally

Requires a **sanitized** relationship-audit JSON (downloaded artifact or fixture). No API key. No network.

```bash
python scripts/build_amc_source_observations.py \
  --input audit-output/amc_wwm_release_audit.json \
  --output-dir local-output/amc-source-observations

python scripts/validate_amc_source_observations.py \
  --products local-output/amc-source-observations/amc_movie_products.json \
  --releases local-output/amc-source-observations/amc_release_observations.json
```

Fixture input:

```text
tests/fixtures/analysis/amc_source_observations/input_audit.json
```

(Explicitly marked example-only — not production data.)

## Validation rules

- Unique `(source, source_film_id)` / `(source, source_release_id)`
- Release members resolve to product records
- Stats match record counts
- JSON Schema + structural checks via the validate script

## Non-production status

| Question | Answer |
|----------|--------|
| Tracked generated live outputs? | No |
| Public / Pages? | No |
| Canonical film IDs? | No |
| Consumed by daily scrape or SPA? | No |

Outputs under `local-output/` and `data/analysis/` remain gitignored.

## Before daily integration

Would require product approval of:

1. ownership (who writes the catalogs, when),
2. failure modes (API outages must not fail showtimes),
3. storage location separate from showtime history,
4. no automatic merge from `source_release_id`,
5. cockpit/public exposure only if explicitly scoped later.
