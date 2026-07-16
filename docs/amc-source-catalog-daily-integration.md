# AMC Source Catalog — Daily Integration Design

**Status:** Design complete · implementation not started  
**Track:** Data Foundation  
**Last updated:** 2026-07-15  
**Implements later as:** P-14D — Wire AMC source catalog into daily workflow  
**Related:** [amc-source-catalog.md](./amc-source-catalog.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [development-operating-model.md](./development-operating-model.md)

This document is the implementation-ready design for wiring the existing AMC source-catalog refresh stage into Reel Seattle’s daily pipeline as a **late, non-blocking** step.

Do **not** treat this file as authorization to edit production workflows until P-14D is explicitly scoped.

---

## 1. Goal

After showtimes are scraped, processed, validated, and ready to commit:

1. Refresh AMC Movies metadata for active products.
2. Merge into durable internal catalogs.
3. Validate both catalog artifacts together.
4. Promote only fully valid outputs.
5. Include catalog files in the **same** generated-data commit when they change.
6. Never fail the daily job because the catalog stage failed.

Public showtime success remains independent of catalog health.

---

## 2. Recommended workflow placement

Current daily workflow (`.github/workflows/daily_scraping.yml`):

```text
checkout
  → install deps
  → set AMC_API_KEY in GITHUB_ENV
  → python run_daily_scraping.py
      (indie scrape → AMC scrape → daily_processor.py)
  → validate_public_data_artifacts.py
  → validate_history_csv.py --strict
  → intentional git add + commit + push
```

Proposed order after P-14D:

```text
AMC/SIFF/Beacon showtime scraping
    ↓
scrape logs and history processing
    ↓
public showtime artifact generation
    ↓
existing history/public validation
    ↓
AMC catalog refresh and merge          ← new, non-blocking
    ↓
catalog validation                     ← inside orchestration
    ↓
pipeline diagnostics (messages/warnings)
    ↓
single generated-data commit
```

Exact YAML insertion point: **after** both validation steps, **before** the commit/push step.

Do **not** insert the catalog stage inside `run_daily_scraping.py` or `daily_processor.py` for the first wiring. Keep showtime processing unchanged; add a separate workflow step that can warn-and-continue.

---

## 3. Orchestration preference

Prefer a small Python orchestration script over complex shell in YAML:

```text
scripts/run_daily_amc_source_catalog.py
```

Responsibilities:

1. Resolve today’s AMC scrape log.
2. Invoke refresh (`all-active`) into a temporary directory.
3. Merge against prior durable catalog if present (else initialize).
4. Validate products + releases together.
5. Atomically promote to `data/source_catalog/` only on full success.
6. Print sanitized diagnostics to stdout.
7. Exit `0` on catalog soft-failure (with warning text); exit nonzero only for orchestration bugs that the workflow chooses to treat as hard errors — **default soft**.

Existing modules remain the engines:

| Concern | Module / CLI |
|---------|----------------|
| Discovery / Movies fetch / observations | `reel_seattle/source_catalog/amc_refresh.py` · `scripts/refresh_amc_source_catalog.py` |
| Merge / derive / validate | `reel_seattle/source_catalog/amc.py` · update/validate CLIs |
| Daily coordination + promotion | **new** `scripts/run_daily_amc_source_catalog.py` (P-14D) |

YAML should call one command, for example:

```bash
python scripts/run_daily_amc_source_catalog.py \
  --discovery-source auto \
  --policy all-active \
  --work-dir "${RUNNER_TEMP}/amc-source-catalog" \
  --durable-dir data/source_catalog
```

`--discovery-source auto` already prefers the newest `data/daily_logs/*_amc.json`.

---

## 4. Design answers (production decisions)

### 1. Exact command(s)

Primary: one orchestration script (above).

Internally it should reuse library APIs (preferred) or subprocess the existing CLIs with fixed timestamps derived from the run. Avoid duplicating merge logic.

### 2. Active AMC ID source

**Preferred:** today’s committed scrape log, e.g.:

```text
data/daily_logs/YYYY-MM-DD_amc.json
```

resolved via existing `auto` / scrape-log discovery.

**Fallback:** `public/data/showtimes_current.json` only if the scrape log is missing (should be rare after a successful AMC scrape). If neither yields IDs, skip catalog replacement and warn.

### 3. Initial production policy

**`all-active`**

Rationale:

* ~40–60 active AMC products in the Seattle window,
* roughly one minute of paced Movies requests,
* simplest behavior for first rollout,
* easiest to observe and debug,
* avoids stale-threshold edge cases before runtime metrics exist.

Later PR may switch to `stale` with `--stale-after-hours` after measuring change rate and wall time. Document that change in [data-foundation-roadmap.md](./data-foundation-roadmap.md); do not flip casually.

### 4. Existing catalog supply

| Run | Behavior |
|-----|----------|
| First run (no durable files) | Treat as empty catalog; refresh all active IDs; build new products + releases |
| Later runs | Pass `data/source_catalog/amc_movie_products.json` as existing input; releases are always rebuilt from the merged product catalog |

Do **not** require manually committed empty catalog stubs.

### 5. Temporary output directory

Use a runner-local work directory, for example:

```text
$RUNNER_TEMP/amc-source-catalog/
```

or:

```text
local-output/amc-source-catalog-daily/   # gitignored; acceptable for local dry-runs
```

Write:

* `amc_source_catalog_observations.json`
* `amc_movie_products.json`
* `amc_release_observations.json`

Never write half-built files directly to `data/source_catalog/`.

### 6. Promotion to durable paths

Only after paired validation succeeds:

```text
data/source_catalog/amc_movie_products.json
data/source_catalog/amc_release_observations.json
```

Promotion pattern (Linux / GitHub Actions):

1. Write validated artifacts under the work dir.
2. Validate the pair in place.
3. Ensure `data/source_catalog/` exists.
4. Copy/move via temp names in the durable directory, then `os.replace` (atomic on same filesystem):

```text
work/amc_movie_products.json
  → data/source_catalog/amc_movie_products.json.tmp
  → os.replace(.../amc_movie_products.json.tmp, .../amc_movie_products.json)

work/amc_release_observations.json
  → data/source_catalog/amc_release_observations.json.tmp
  → os.replace(...tmp, durable)
```

Promote **both** only when both validations pass. If the second replace fails after the first succeeded, treat as promotion failure: restore from work-dir copies or leave a diagnostic and fail soft without claiming success. Prefer promoting as a two-step replace only when both temp files are staged first, then replace both.

Recommended safer sequence:

1. Stage both `.tmp` files in `data/source_catalog/`.
2. `os.replace` products.
3. `os.replace` releases.
4. If step 3 fails, immediately re-replace products from the still-available work-dir validated copy and emit an error diagnostic.

### 7. Retaining prior good catalogs

On any failure that occurs **before successful paired validation + promotion**:

* do not delete durable files,
* do not overwrite durable files,
* leave prior `data/source_catalog/*.json` untouched.

On total refresh failure with a prior catalog present: retain prior files and warn.

### 8. No catalog files yet

Initialize from empty state in the work directory. Promote both files only after validation. If initialization fails, commit showtimes as today; catalogs simply remain absent until a later successful run.

### 9. Warnings vs errors

| Condition | Severity |
|-----------|----------|
| Missing key, discovery empty, partial product failures, soft orchestration failure | **Warning** (catalog) |
| Invalid output that blocks promotion | **Warning** + retain prior |
| Showtime scrape/processor/validation failure | Existing **error** behavior (unchanged) |
| Accidental attempt to treat catalog failure as showtime failure | Forbidden |

Catalog diagnostics must never rewrite AMC showtime source status.

### 10. Failures that prevent catalog replacement

Any of:

* missing/invalid observation aggregate that cannot be merged,
* merge exception,
* product schema/structural validation failure,
* release schema/structural/cross-artifact failure,
* temp write failure,
* promotion failure,
* missing `AMC_API_KEY` in live daily mode,
* zero usable AMC IDs,

→ **do not replace** durable catalogs.

Product-level Movies failures alone do **not** prevent replacement if the merge+validation of the resulting stubs/successes still passes (non-blocking product errors are represented in-catalog).

### 11. Why catalog failure must not block showtime commit

Showtimes are the public product. Catalogs are internal evidence. Blocking the generated-data commit on Movies metadata would couple public freshness to a secondary enrichment path and reintroduce the exact risk the non-blocking design avoids.

### 12. Intentional staging

Extend the existing workflow `git add` list with **only**:

```text
git add data/source_catalog/amc_movie_products.json
git add data/source_catalog/amc_release_observations.json
```

Never `git add data/source_catalog/` blindly if other files appear later. Never stage work-dir / `local-output/` observations.

### 13. Generated-data commit inclusion

Keep the single commit message pattern:

```text
Daily showtime data update YYYY-MM-DD
```

Catalog files ride along when changed. If only showtimes change, catalogs may be unchanged and simply not appear in the diff. If only catalogs would change (unlikely without a scrape), they still use the same commit step after validations.

`git commit ... || exit 0` remains acceptable when there is nothing to commit.

### 14. No-change catalog output

If refreshed content is byte-identical (or semantically identical after deterministic write) to the prior durable files:

* promotion may rewrite identical bytes or skip replace,
* `git commit` naturally no-ops those paths,
* still emit a success diagnostic with counts.

Deterministic `generated_at` should use the pipeline run timestamp so “no metadata change” still updates `generated_at` / lifecycle fields when products were seen — that is an intentional change and should commit.

### 15. Avoiding Git races with scheduled commits

Unchanged operating-model rules:

* Cursor/human feature work: `git fetch` before push; never discard generated-data commits.
* Daily job: checkout at start; single push at end.
* If push rejects because another push landed: current workflow fails the push step; operators re-run or reconcile. Do not add force-push.
* Do not have the catalog step push independently.

### 16. Temporary directory cleanup

GitHub Actions `$RUNNER_TEMP` is ephemeral; explicit cleanup is optional. For local dry-runs, keep using gitignored `local-output/`. Orchestration may `shutil.rmtree(work_dir)` on success if desired; not required for Actions.

### 17. Secret confinement

* Continue setting `AMC_API_KEY` via the existing workflow env step.
* Only the refresh/orchestration process reads it.
* Never pass the key as a CLI argument.
* Never print headers or raw responses.
* Rely on existing sanitization in the refresh stage (`assert_no_secret_leakage`).

### 18. Workflow log hygiene

Stdout should include counts and sanitized failure categories only, e.g.:

```text
AMC source catalog: 44 active products, 44 selected, 42 success, 2 failed, 0 invalid; promoted
```

or:

```text
AMC source catalog refresh failed; retained previous catalog (reason: missing AMC_API_KEY)
```

Do not dump Movies JSON bodies or request headers into Actions logs.

---

## 5. First-run behavior

When durable files are absent:

1. Discover active AMC IDs from today’s scrape log (`auto`).
2. Fetch all active products (`all-active`).
3. Build a new catalog in the work directory (empty existing).
4. Validate products and releases together.
5. Promote both files only after validation passes.
6. Stage durable paths in the generated-data commit when present.
7. If any catalog step fails: warn, skip promotion, still commit showtimes.

---

## 6. Failure matrix

| Failure | Showtimes succeed? | Replace catalogs? | Prior catalogs remain? | Diagnostic | Workflow exit |
|---------|--------------------|-------------------|------------------------|------------|---------------|
| Missing `AMC_API_KEY` | Yes (if scrape already succeeded) | No | Yes / absent | Warning | Soft continue → commit showtimes |
| No AMC IDs discovered | Yes | No | Yes / absent | Warning | Soft continue |
| One Movies request failure | Yes | Yes, if merge+validate OK | N/A (replaced) | Info/warning counts | Soft continue |
| Multiple Movies failures | Yes | Yes, if merge+validate OK | N/A | Warning counts | Soft continue |
| All Movies requests fail | Yes | Yes only if stub catalog validates; else No | Yes if not promoted | Warning | Soft continue |
| Response-ID mismatch | Yes | Yes if overall validate OK (invalid obs → stub/no bad metadata) | N/A | Counted invalid | Soft continue |
| Malformed response | Yes | Same as mismatch | N/A | Counted invalid | Soft continue |
| Observation artifact invalid | Yes | No | Yes / absent | Warning | Soft continue |
| Product catalog merge failure | Yes | No | Yes / absent | Warning | Soft continue |
| Catalog schema failure | Yes | No | Yes / absent | Warning | Soft continue |
| Release referential-integrity failure | Yes | No | Yes / absent | Warning | Soft continue |
| Temporary file write failure | Yes | No | Yes / absent | Warning | Soft continue |
| Final promotion failure | Yes | No (or restored) | Prior retained / restored | Error/warning | Soft continue |
| Git commit/push conflict | Showtimes + catalogs already prepared locally on runner | N/A | Local runner state discarded after job | Existing push failure | Job fails at push (unchanged) |

**Hard rule:** catalog-stage failures default to **non-zero only inside the orchestration script if explicitly configured**; the workflow step should use `continue-on-error: true` **or** the script exits 0 after printing warnings. Prefer script-exits-0 + clear warning text so the commit step still runs without YAML gymnastics.

Showtime validation failures **before** the catalog step still fail the job as today.

---

## 7. Diagnostics plan

### Initial (no pipeline-report schema change)

Emit stdout messages (and optionally append to existing processor/workflow logs) such as:

```text
AMC source catalog: 44 active, 44 selected, 42 success, 1 failed, 1 invalid; promoted
AMC source catalog refresh failed; retained previous catalog
AMC source catalog: initialized and promoted (first run)
```

Keep catalog messaging **separate** from AMC showtime source status in `pipeline_report.json`. Do not mark AMC showtimes failed because Movies metadata refresh failed.

Optional light touch without schema change: add a free-text string to `pipeline_report.messages[]` if that array is already additive and ignored by the public UI when unknown. Only do this in P-14D if existing consumers tolerate new messages. Otherwise stdout-only is enough for v1.

### Later (structured)

When cockpit or ops needs machine-readable catalog health, add a dedicated `pipeline_report` section (schema bump) with:

* active/selected/success/failed/invalid counts,
* promoted boolean,
* retained_previous boolean,
* policy name,
* duration seconds.

Defer that schema change until the workflow has run stably.

---

## 8. Validation and QC plan for P-14D

### Automated / fixture

* Fixture-mode orchestration end-to-end (no network, no secret).
* First-run initialization (no prior durable files).
* Update of an existing catalog.
* Product-level partial failure still promotes when validation passes.
* Total endpoint failure retains prior files.
* Invalid catalog output blocks promotion.
* Successful atomic promotion.
* Deterministic / no-op staging behavior documented.
* Secret markers absent from outputs and captured logs.
* Schema + cross-artifact validation.

### Workflow / manual QC

* Dry-run command on Actions-like ordering after public/history validation.
* Confirm `git add` lists only the two durable catalog paths (+ existing showtime paths).
* Confirm no `public/data/` shape changes from the catalog step.
* Confirm failed catalog step still allows commit of showtimes in a controlled test (script soft-exit).
* Confirm missing key soft-fails.

### Implementation shape recommendation

Ship P-14D as:

1. `scripts/run_daily_amc_source_catalog.py` (+ library helpers if needed),
2. workflow step after validations with soft-failure behavior,
3. two durable path `git add` lines,
4. focused tests under `tests/source_catalog/`,
5. docs status update in this file and the data-foundation roadmap.

Out of scope for P-14D: cockpit UI, pipeline-report schema bump, stale policy, public SPA, history changes.

---

## 9. Recommended next implementation (P-14D)

**Title:** Wire AMC source catalog into daily workflow

**Likely scope:**

* add `scripts/run_daily_amc_source_catalog.py`,
* invoke after existing showtime validation,
* policy `all-active`,
* merge against prior catalog if present,
* validate in temporary paths,
* atomically promote valid outputs,
* retain prior catalogs on failure,
* emit sanitized diagnostics,
* stage only the two durable catalog paths in the existing generated-data commit,
* no history / public schema / cockpit / SPA changes.

Do not implement P-14D until explicitly tasked.
