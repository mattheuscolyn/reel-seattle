# Leaving Soon Phase 2: observation and label provenance

Status: **investigation only**. No changes to production Leaving Soon, frozen models, training thresholds, or public forecasts.

## Why this exists

Two separate causes can degrade historical forecasts:

1. **Observation gaps:** no completed AMC snapshot was collected on October 13–18, 2026. Missing does not mean a film left theaters. A gap can affect both historical feature windows and the evidence used to resolve 0/1/2/3+ week outcomes.
2. **Historical lookahead:** `build_booking_cycles` computes each earlier Friday's "typical Friday volume" using all occurred Fridays in the final data, including later weeks. Because the volume determines 50/80/95% schedule-publication dates, the history replay can select a forecast snapshot with information that did not exist then.

The first was already recognized in issue #151. The second is a separate, deterministic source-code finding and needs a point-in-time replay, not a higher publication threshold.

## Reproducible audit

From the repository root, with development requirements installed:

```sh
python -m pytest -q tests/analysis/test_leaving_soon_phase2_evidence.py
python -m scripts.audit_leaving_soon_phase2_evidence
```

Reports are written to `data/audits/leaving_soon_phase2_evidence.json` and `data/audits/leaving_soon_phase2_rows.csv`. The PR-only workflow also uploads these as artifacts and prints a numerical summary in its log. These reports are *not* the prediction feed.

### Each historical observation retains

- Cohort, film and theater, observation date, week being predicted, original label and censoring status.
- Whether the observation snapshot itself was complete.
- Missing/incomplete snapshot days in the *potential* label-evidence window (through week 3).
- Missing/incomplete days since the film's approximate first show, which can affect historical trajectory features.
- `untrusted_observation`, `potential_gap_exposure`, `unresolved_censored`, or `coverage_clear_not_label_verified`.

These are **exposure categories**, not ground-truth corrections. Resolved and censored rows are counted independently. The feature lookback is an approximation, not a per-feature origin audit. In particular, `coverage_clear_not_label_verified` must not be presented as a clean-labeled training sample without additional event-level checks.

### Booking-cycle counterfactual

For each theater/week, compare the current all-time Friday baseline against a strict chronological one computed only from completed show dates **before** that week. Reconstruct the 50/80% threshold crossing from that historical baseline and note:

- Weeks where a later Friday entered the original baseline.
- Weeks where the baseline changes.
- Weeks where the 80%-publication date changes.
- Weeks where the actual prepublication **feature snapshot** changes.
- Examples with both original and chronological values.

A changed feature snapshot is direct evidence that a retrospective training example would have been scored at a different time. This is not proof that the user's live prediction was wrong.

## What we must establish before modifying labels or retraining

1. Reconstruct publication baselines **as-of** each forecast, not as-of the final data export. Maintain the original benchmark unchanged as an experiment control.
2. Trace each candidate example to the set of completed source snapshots used in each feature, including removal and cancellation information; test for feature invariance under later snapshots.
3. Reconstruct film×theater engagements around October 12 and October 19. Check whether confirmed endings are supported by theater-wide schedule coverage, rather than interpreting the absence of six scrapes as film departures.
4. For gap-exposed labels: establish verified exits or continue censoring. Never label a skipped snapshot as a disappearance.
5. Compare the old versus point-in-time-safe training cohorts with identical chronological holdout dates, and report counts, log loss, calibration, ranking, and confidence intervals. Do not interpret the 0.727 frozen holdout and 0.858 rolling holdout as causal proof of the outage.

This audit deliberately stops short of retraining or publishing. Only after evidence classification and genuine label validation should a new model be tested against the frozen one.


## Individual run endings: schedule-level corroboration

The separate read-only verifier runs as part of the same Phase 2 workflow:

```sh
python -m pytest -q tests/analysis/test_leaving_soon_run_endings.py
python -m scripts.audit_leaving_soon_run_endings
```

Its outputs are:

- `data/audits/leaving_soon_run_endings.json` (summary including unique-run counts)
- `data/audits/leaving_soon_run_endings_rows.csv` (all model training observations, with original labels and theater/market verdicts)
- `data/audits/leaving_soon_distinct_run_endings_rows.csv` (one row **per distinct theatrical engagement**: separates real runs from repeated film-week forecasts)

For a previously **resolved** exit in bucket 0/1/2, corroboration requires:

1. The claimed final show was actually listed on an AMC snapshot marked `complete`, captured no later than that show date.
2. The full claimed first *absent* programming week has elapsed as of the dataset's as-of date.
3. No skipped/incomplete AMC daily observations between the last show and the beginning of that absent week.
4. A `complete` observation taken after the last show and by the first day of the claimed absent week lists a broad following theater schedule: five distinct dates, eight or more screenings, and two or more other film IDs. This is an explicit, conservative **minimum published-schedule heuristic**, not an AMC-certified assertion that every seat/program was fully announced.
5. The film is absent from the claimed empty week at the relevant theater (or, for a market label, across the market).
6. No contradictory later shows belong to the same segmented theatrical run. Near-term separate engagements are reported for human review.

For a 3+ bucket, the verifier requires an **elapsed** third-week showtime that was listed in a completed AMC observation before the screening date. A merely future-announced screening is not scored as a completed outcome.

For market-level exit evidence, the corresponding next week must have the same publication corroboration at **every theater previously involved in that film's market engagement**. The theater- and market-level verdicts are intentionally separate.

An existing censored observation is left censored. A contradictory or unverifiable label remains unchanged in the source data; the audit reports evidence and reasons for later decisions. A status of `supported_exit` is **not** confirmation of ticket attendance or AMC-issued closing dates. Source snapshot-status completeness applies at the AMC-feed level rather than theater-by-theater HTTP response; stronger theater-specific provenance is future work.

Run-level status is assessed on the original 14-day gap segmentation, and an engagement that restarts after a sufficiently long break can legitimately be a *new* run. The verifier records a nearby future engagement instead of assuming no later re-release can ever occur.

## Phase 2c: corrected run-end definition and reconstructed labels

A reproducible, versioned **research-only candidate label dataset** is generated by:

```sh
python -m pytest -q tests/analysis/test_reconstruct_remaining_run_labels.py
python -m scripts.reconstruct_remaining_run_labels
```

The outputs are:

- `data/audits/leaving_soon_reconstructed_labels.json` (schema version, quality tier and cohort counts)
- `data/audits/leaving_soon_reconstructed_labels_rows.csv` (original + chronological examples, at theater and market grains, old and corrected bucket, censoring and provenance)

### Correct label semantics

The 14-dark-day engagement segmentation remains a **distinct-run definition**, unchanged and auditable. The weekly forecast target counts from the upcoming Friday to the **last Fri–Thu programming week with an elapsed screening in the same engagement**:

```
0 = no continuation into the next programming week
1 = last playing week is next Fri–Thu
2 = last playing week is the following Fri–Thu
3 = the run reaches at least a third future Fri–Thu
```

Importantly: an *empty intervening programming week does not terminate a run* when the film subsequently plays before the segmentation threshold creates a new engagement. The old `additional_programming_weeks` function counted uninterrupted positive weeks instead, so an off-week followed by a resumption caused mislabels. **The frozen research implementation and its benchmark remain unchanged**; new labels are side-by-side candidate evidence, not a silently rewritten experimental benchmark.

A resolved 0/1/2 target requires evidence of a terminal showing, a fully elapsed first subsequent empty week, adequate other-film publication at the affected theater(s), and no unavailable AMC observations in the critical end-evidence interval. This is a conservative *corroboration* heuristic, not AMC-sanctioned schedule completeness. 3+ requires a witnessed **elapsed** third-week showing. Otherwise keep `corrected_censored=1` and any independently witnessed survival as `corrected_known_weeks`; do not impute a finish.

### Source quality tiers

- **strict**: historical feature snapshot and required schedule evidence are backed by AMC snapshots explicitly labeled `complete`.
- **provisional_legacy**: early AMC logs recorded positive schedules but did not record a formal `restate_safe` outcome. Their snapshot status is `unknown`, with positive record counts and `restate_safe_missing_with_records` reason. These can support **provisional** historical labels, not strict ground truth.
- **unresolved**: still censored, future schedule not yet elapsed, incomplete/missing evidence, or unverified terminal/following-week schedule.

A late complete snapshot **cannot retroactively prove a historical feature snapshot was complete**. Prior missing snapshot dates remain missing. No model is refitted or publicly updated by this audit.

### Live replay over data ending Oct 22, 2026

| Historical selection | Theater examples | Strict | Provisional legacy | Unresolved | Different label vs original |
|---|---:|---:|---:|---:|---:|
| Original publication selection | 2,248 | 707 | 1,386 | 155 | 104 |
| Strict chronological publication selection | 2,075 | 707 | 1,213 | 155 | 104 |

Both original and chronological selections have six **resolved but incorrect** theater buckets from interrupted programming weeks. The other 98 differences in each are resolved-to-censored changes. Market labels have **14** changed resolved buckets and 56 resolved-to-censored changes (70 differences total). The corrected market evidence is stricter because every previously involved AMC theater must show credible following-week program availability.

On the chronology-corrected 2,075 theater observations, **1,920** have a resolved candidate label and **155** remain censored. However, the early **723 training** and **490 validation** examples all fall into the **provisional legacy** tier; none has a formally complete observation snapshot under the currently recorded statuses. This distinction prevents us from presenting rolling performance on early examples as independently verified ground truth.

The sidecar rows are not yet a training-ready clean feature dataset. Before promoting/retraining, establish historical pre-publication feature provenance and release a deliberate new model/version evaluated on comparable chronological dates and calibration. The original 0.727 benchmark must remain as frozen control, not be overwritten by new outcome semantics.
