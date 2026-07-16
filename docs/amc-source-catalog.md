# AMC Source Catalog (Durable)

Durable, internal AMC source-catalog contracts and offline merge/derive logic.

**Status:** Durable internal generated artifact — schema and offline writer implemented; workflow integration pending

**Not public.** Do not expose through `public/data/`, GitHub Pages, the SPA, or the Developer Data Cockpit.

## Purpose

Persist AMC **movie-product** evidence and derived **release-observation** grouping evidence with explicit lifecycle and refresh state.

This catalog is source-specific evidence for future matching work. It is not authored canonical film data.

## Artifact paths

Intended production paths (written once workflow integration begins):

```text
data/source_catalog/amc_movie_products.json
data/source_catalog/amc_release_observations.json
```

Classification:

* generated
* durable
* internal
* source-specific evidence
* tracked once workflow integration begins
* not authored canonical data
* not public
* not currently written by production

Local offline tool output should use a gitignored directory such as `local-output/amc-source-catalog/`.

## Schemas

```text
schema/source_catalog/amc_movie_products/v1.0.0.json
schema/source_catalog/amc_release_observations/v1.0.0.json
```

`schema_version` is `1.0.0`. These schemas do **not** use `artifact_status: "prototype"`.

Prototype schemas under `schema/prototypes/` remain as historical references and are superseded for durable work. See [amc-source-observation-prototype.md](./amc-source-observation-prototype.md).

## Grains

### Movie product

```text
(source, source_film_id)  →  ("amc", AMC movie id)
```

Each AMC movie product remains distinct (standard, sensory-friendly, Q&A, introductions, events, mystery screenings, rereleases, concerts, other specials).

### Release observation

```text
(source, source_release_id)  →  ("amc", wwmReleaseNumber)
```

`source_release_id` is nullable grouping evidence only. It must never:

* merge products
* replace `source_film_id`
* become a canonical Reel Seattle film key
* cause metadata inheritance between products

Relationship status is always `grouping_evidence_only`.

## Lifecycle timestamps

| Field | Meaning |
|-------|---------|
| `first_seen_at` | First observed in AMC showtime/source data |
| `last_seen_at` | Most recent observed presence in active source data |
| `last_refreshed_at` | Most recent Movies API attempt |
| `last_successful_refresh_at` | Most recent successful parsed Movies response |
| `inactive_since` | First timestamp at which the product was no longer active; null while active |
| top-level `generated_at` | Artifact write time |

Do not overload these fields. Selective observation history may be added later if operationally needed; this version relies on Git history plus lifecycle timestamps (no append-only history artifact, no unbounded `recent_changes`).

## Refresh states

| Status | Meaning |
|--------|---------|
| `pending` | Product known; successful Movies metadata not yet applied (or skipped without prior success) |
| `success` | Last refresh produced usable metadata |
| `stale` | Prior success exists, but a later refresh failed |
| `failed` | Refresh failed and no prior successful metadata exists |
| `invalid` | Refresh returned unusable/malformed metadata |

## Presentation classifier versioning

`presentation.category` and `presentation.is_special_presentation` are derived. `presentation.classifier_version` is required so classifier updates are not confused with AMC API changes.

## Provenance

Lightweight object distinguishing observed vs derived values:

* `metadata_source` = `amc_movies_api`
* `observation_source` = `amc_showtimes`
* `last_input_kind` = e.g. `sanitized_movies_observation`
* `derived_fields` lists derived paths such as presentation fields

No field-level provenance infrastructure yet. No `canonical_film_id` / `match_status` in this version.

## Offline observation input

Normalized shape (not coupled permanently to audit envelopes):

```json
{
  "source_film_id": "83988",
  "observed_title": "The Odyssey : Sensory Friendly Screening",
  "observed_at": "2026-07-15T00:00:00-07:00",
  "movies_fetch": {
    "attempted_at": "2026-07-15T01:00:00-07:00",
    "status": "success",
    "metadata": {}
  }
}
```

`movies_fetch.status` values: `success`, `failed`, `invalid`, `pending`, `skipped`.

## Merge semantics

1. **New product + successful metadata** — create full product; set seen/refresh timestamps; status `success`.
2. **New product without success** — create stub with film ID + observed title; status `pending` / `failed` / `invalid` as appropriate.
3. **Existing + successful metadata** — replace allowlisted snapshot with current values, including empty/null as current state.
4. **Existing + failed refresh** — retain last successful metadata; update `last_refreshed_at`; set `stale` / `failed` / `invalid`; preserve `last_successful_refresh_at`.
5. **Active IDs** — products in the active set get `inactive_since = null`; observed products update `last_seen_at`.
6. **Absent from active set** — retain the record; set `inactive_since` only if currently null; do not update `last_seen_at`; do not delete.
7. **Reactivation** — reappearing products clear `inactive_since`.
8. **Release ID change** — accept new ID on successful refresh; rebuild releases from the final product catalog.
9. **Duplicates** — identical observations dedupe; conflicting duplicates for the same film ID in one run fail clearly.

## Inactive retention

Durable products remain when they leave the active showtime window. Use lifecycle state and `inactive_since`; do not delete or age out products in this module.

## Release derivation

Pure deterministic rebuild from the **complete** product catalog:

* include all products with non-null release IDs (including inactive)
* retain singleton groups
* never place null-release products into releases
* do not read a prior release artifact as merge input
* compute observed-value collections, variation flags, categories, and stats

## CLI usage

Initialize / update (offline):

```bash
python scripts/update_amc_source_catalog.py \
  --existing-products path/to/amc_movie_products.json \
  --observations path/to/observations.json \
  --active-ids path/to/active_ids.json \
  --generated-at 2026-07-15T12:00:00-07:00 \
  --output-dir local-output/amc-source-catalog
```

Omit `--existing-products` to initialize an empty catalog.

Validate:

```bash
python scripts/validate_amc_source_catalog.py \
  --products path/to/amc_movie_products.json \
  --releases path/to/amc_release_observations.json
```

No network access. No `AMC_API_KEY`.

## Validation

Structural checks plus JSON Schema validation for both artifacts, including:

* unique product / release IDs
* refresh status and classifier version
* timestamp ordering where meaningful
* stats consistency and deterministic ordering
* cross-artifact membership and release-ID agreement

Validators never modify inputs.

## Current offline-only status

This task does **not**:

* call the AMC API
* wire into `daily_scraping.yml` / `daily_processor.py`
* write tracked live files under `data/source_catalog/`
* expose the catalog publicly

## Future workflow integration boundary

Expected later (out of scope here): a non-blocking late stage in the daily scrape refreshes active products, writes these durable artifacts in the same generated-data commit, and never blocks showtime success. That stage should call this offline merge library after producing observation inputs.

## Library entrypoint

```text
reel_seattle/source_catalog/amc.py
```

CLIs:

```text
scripts/update_amc_source_catalog.py
scripts/validate_amc_source_catalog.py
```
