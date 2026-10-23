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
