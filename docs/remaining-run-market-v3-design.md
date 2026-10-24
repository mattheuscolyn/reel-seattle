# Remaining Run market feature generator v3

**Status: research-only replacement, not deployed.**

## What was rebuilt

`reel_seattle/analysis/remaining_run_market_features.py` provides two stable entry points:

- `build_market_snapshot(screenings, snapshot, upcoming_friday, dataset_start, theater_ids, approved_product_aliases)`: build full market film records at one historical booking snapshot.
- `build_historical_market_rows(screenings, theater_observations, ...)`: select one minimum forecast date per AMC source product/week, and reconstruct its entire market feature vector from the original ledger filtered to that date.

The generator takes source `Screening` objects, not old theater forecast rows. **None of the old theater feature values is copied into the market generator.** Historical theater rows are used only to select a comparable forecast date; the evaluator separately attaches matching original outcome labels to test on the same cohort.

### Feature units and provenance

- `current_week_screenings`, `market_screenings`: same market-wide film-week count, identical by invariant.
- `screenings_per_show_date`, `distinct_show_dates`, `weekend_share`, `premium_share`, `prime_share`, `wow_pct_change`, `decline_from_peak`: from all eligible AMC theaters for the **same film ID and snapshot**.
- `market_theater_count`, `strongest_theater_screenings`, `weakest_theater_screenings`, `share_theaters_declining`: from theaters with that film scheduled on the same snapshot.
- `share_of_market`, `rank_in_market`, `market_week_vs_baseline`: denominators and ranks across the **entire eligible AMC market** on that date.
- The market scorer's `FEATURES` list removes `share_of_theater`, `rank_in_theater`, and `theater_week_vs_baseline` and replaces them with actual market-grain definitions.
- Historical showtimes first seen later than the selected cutoff cannot enter a market feature. Known removals are handled by source `still_listed` semantics. No previously announced film is assumed to have actually played; market feature history is *observed booking history*.
- Until product identities receive explicit reviewed aliases, separate AMC source-product IDs remain separate, **even with identical titles**. This intentionally errs on the side of not merging a fan event into an ordinary screening.

`segment_provenance` flags that historic category source versions are still not fully provable as of that date. Candidate weights are research-only, and complete snapshot coverage remains a downstream training/publishing prerequisite.

## Reproducible verification

```bash
python -m pytest -q tests/analysis/test_remaining_run_market_features.py tests/analysis/test_evaluate_remaining_run_market_v3.py
python -m scripts.evaluate_remaining_run_market_v3
```

Isolated workflow: `.github/workflows/remaining_run_market_v3.yml`. JSON report: `data/audits/remaining_run_market_v3_backtest.json`. It contains the candidate's exact model feature list and serialized weights; probability roundtrip is checked against the in-process predictions. It does **not** edit active model pointers, production inference, or public forecast artifacts.

## Historical replay — data as-of Oct 23, 2026

Compared **619 matched film/week rows**, trained on 337 provisional legacy market rows, evaluated on **192 strictly corroborated resolved market holdout records** from 122 films, on identical selected forecast dates and corrected labels.

| Metric | Original hybrid generator | Pure market v3 |
|---|---:|---:|
| Four-class log loss (lower is better) | 0.8602 | **0.7011** |
| Brier (sum over 4 buckets, lower is better) | 0.4040 | **0.3945** |
| Final-week PR-AUC (higher is better) | 0.9067 | **0.9233** |
| Top-class accuracy | **72.4%** | 70.3% |
| Mean P(final week) | 70.0% | 50.4% |
| Actual share of final-week outcomes | 57.8% | 57.8% |

Paired film-clustered bootstrap delta **−0.1591** log loss, 600 draws; 95% interval **[−0.3386, +0.0057]**. The interval includes zero. Exploratory segments: ordinary runs 0.8878→0.8279, special events 0.5158→0.3227, and rereleases 1.0199→0.5220 (only 13 rerelease examples). Improvements remain exploratory on the same repeatedly examined historical cohort.

The new generator corrects a **semantic modeling defect**, irrespective of whether retrospective metric improvements reproduce.

## Remaining gates before activation

1. Verify historical feature inputs' completeness and past-tense ledger rules at each selected date, including future cancellation timestamps and catalog category changes.
2. Approve an explicit map of truly equivalent AMC product IDs; do not merge by title or confuse a special event with the standard release.
3. Define a **market-specific** first-publication / forecast-date selection, instead of inheriting earliest individual-theater milestones. Persist exact `as_of`, source snapshot coverage, and feature version with every prediction.
4. Collect a **new untouched chronological/prospective cohort** after the current as-of date. Evaluate all 4 probability buckets, segment calibration, log loss, Brier, urgency ranking, and stability.
5. Train and serialize one versioned market model against those feature names and update live inference **only after** a predeclared, successful promotion gate. Preserve the old shadow and production model as rollback choices.

**Decision: keep PR draft and research-only.** In particular, never load v3 features into the existing v1 market model weights or claim historical-benchmark performance proves prospective improvement.
