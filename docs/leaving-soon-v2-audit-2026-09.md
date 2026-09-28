# Leaving Soon v2 audit — September 2026

**Status:** analysis only. Production `amc_remaining_run_survival_v1`, `active.json`, public thresholds, and `leaving_soon_current.json` are unchanged.

## Executive summary

- Prospective v1 was scored on stored snapshots from **2026-09-04** through **2026-09-28** (25 days). Evaluation as-of is **2026-09-27**.
- Mature public-eligible predictions: **514** at 7 days and **311** at 14 days. Immature rows were left out of every denominator.
- 7-day PR-AUC **0.873**, Brier **0.151**, precision **0.847** at the frozen last-chance threshold.
- 14-day PR-AUC **0.967**, Brier **0.091**, precision **0.939** at the frozen leaving-soon threshold.
- Public `last_chance` precision **0.818**, recall **0.514** (n=514).
- Public `leaving_soon` precision **0.911**, recall **0.489** (n=311).
- Recommendation: **`RECALIBRATE_V1`**. Frozen v1 holdout 7-day PR-AUC 0.921 / 14-day 0.981. Retrained survival A holdout 7-day PR-AUC 0.930 / 14-day 0.982. Prospective last_chance precision 0.818 and leaving_soon precision 0.911. Prospective last-chance precision is below the frozen 95% validation target. Raising the threshold can push that top bin back toward 95% precision, but 7-day scores clump near 0.944, so recall falls sharply and the under-confident middle is not recovered. Retrained survival, a regime flag, and dropping horizon_at_ceiling each move holdout PR-AUC by about 0.01. Histogram boosting is higher at 7 days and flat at 14 days; it stays a diagnostic. Do not promote the candidate.

## 1. Prospective v1 metrics

Scores are the probabilities written into `data/model_predictions/leaving_soon/` on that day. They were not recomputed from later features.

| Horizon | Eligible | Mature | Base rate | Precision | Recall | Specificity | F1 | PR-AUC | ROC-AUC | Brier | ECE | Coverage | FP | FN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | 748 | 671 | 0.259 | 0.972 | 0.397 | 0.996 | 0.563 | 0.867 | 0.954 | 0.078 | 0.029 | 0.106 | 2 | 105 |
| 7 | 748 | 547 | 0.501 | 0.847 | 0.566 | 0.897 | 0.678 | 0.873 | 0.895 | 0.151 | 0.120 | 0.335 | 28 | 119 |
| 14 | 748 | 328 | 0.750 | 0.939 | 0.878 | 0.829 | 0.908 | 0.967 | 0.919 | 0.091 | 0.043 | 0.701 | 14 | 30 |
| 21 | 748 | 104 | 0.885 | 1.000 | 0.935 | 1.000 | 0.966 | 0.999 | 0.990 | 0.029 | 0.022 | 0.827 | 0 | 6 |

Eligible counts are stored predictions whose horizon can be scored. Mature counts are the rows that enter precision and recall. The 21-day window only includes the earliest snapshot days.

### Public buckets

| Bucket | Rule | n | Precision | Recall | FP | FN | Coverage |
|---|---|---:|---:|---:|---:|---:|---:|
| last_chance | public last_chance, end within 7 days | 514 | 0.818 | 0.514 | 28 | 119 | 0.300 |
| leaving_soon | public leaving_soon, end within 14 days | 311 | 0.911 | 0.489 | 11 | 117 | 0.395 |
| any_public_flag_14d | either public flag, end within 14 days | 311 | 0.934 | 0.869 | 14 | 30 | 0.685 |

### Calibration bins (7-day)

| Bin | n | Mean predicted | Mean observed |
|---|---:|---:|---:|
| 0.0-0.2 | 244 | 0.032 | 0.127 |
| 0.2-0.4 | 26 | 0.300 | 0.731 |
| 0.4-0.6 | 21 | 0.489 | 0.762 |
| 0.6-0.8 | 38 | 0.703 | 0.789 |
| 0.8-1.0 | 218 | 0.919 | 0.817 |

### Calibration bins (14-day)

| Bin | n | Mean predicted | Mean observed |
|---|---:|---:|---:|
| 0.0-0.2 | 63 | 0.065 | 0.143 |
| 0.2-0.4 | 9 | 0.278 | 0.556 |
| 0.4-0.6 | 8 | 0.508 | 0.500 |
| 0.6-0.8 | 15 | 0.707 | 0.667 |
| 0.8-1.0 | 233 | 0.909 | 0.936 |

## 2. Segments

Public-eligible matured rows only. 7-day metrics use the frozen last-chance threshold.

| Family | Segment | n | Base rate | Precision | Recall | PR-AUC | FP | FN |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| first_week | first_week | 231 | 0.489 | 0.747 | 0.496 | 0.788 | 19 | 57 |
| first_week | later_weeks | 280 | 0.461 | 0.882 | 0.519 | 0.893 | 9 | 62 |
| footprint | 1_theater | 153 | 0.745 | 0.840 | 0.596 | 0.859 | 13 | 46 |
| footprint | 2_theaters | 67 | 0.836 | 0.811 | 0.536 | 0.886 | 7 | 26 |
| footprint | 3_4_theaters | 91 | 0.560 | 0.733 | 0.431 | 0.797 | 8 | 29 |
| footprint | 5plus_theaters | 200 | 0.105 | 1.000 | 0.143 | 0.699 | 0 | 18 |
| footprint_class | low_footprint | 220 | 0.773 | 0.831 | 0.576 | 0.864 | 20 | 72 |
| footprint_class | non_low_footprint | 291 | 0.247 | 0.758 | 0.347 | 0.766 | 8 | 47 |
| lost_primetime | kept_primetime | 491 | 0.456 | 0.803 | 0.491 | 0.821 | 27 | 114 |
| lost_primetime | lost_primetime | 20 | 0.900 | 0.929 | 0.722 | 0.983 | 1 | 5 |
| lost_weekend | kept_weekend | 454 | 0.471 | 0.826 | 0.509 | 0.845 | 23 | 105 |
| lost_weekend | lost_weekend | 57 | 0.491 | 0.737 | 0.500 | 0.788 | 5 | 14 |
| regime | all_announced_era | 511 | 0.474 | 0.815 | 0.508 | 0.838 | 28 | 119 |
| run_age | age_0_6 | 231 | 0.489 | 0.747 | 0.496 | 0.788 | 19 | 57 |
| run_age | age_14_27 | 105 | 0.467 | 0.969 | 0.633 | 0.954 | 1 | 18 |
| run_age | age_28_plus | 64 | 0.328 | 0.750 | 0.571 | 0.820 | 4 | 9 |
| run_age | age_7_13 | 111 | 0.532 | 0.857 | 0.407 | 0.886 | 4 | 35 |
| run_type | normal_first_run | 480 | 0.463 | 0.858 | 0.464 | 0.858 | 17 | 119 |
| run_type | rerelease | 31 | 0.645 | 0.645 | 1.000 | 0.937 | 11 | 0 |
| showtime_volume | shows_1_5 | 119 | 0.908 | 0.929 | 0.852 | 0.950 | 7 | 16 |
| showtime_volume | shows_21_50 | 79 | 0.342 | 0.571 | 0.148 | 0.503 | 3 | 23 |
| showtime_volume | shows_51_plus | 164 | 0.012 | 0.000 | 0.000 | 0.050 | 3 | 2 |
| showtime_volume | shows_6_20 | 149 | 0.705 | 0.643 | 0.257 | 0.688 | 15 | 78 |
| theater_delta | theater_count_declined | 38 | 0.632 | 0.933 | 0.583 | 0.953 | 1 | 10 |
| theater_delta | theater_count_not_declined | 473 | 0.461 | 0.801 | 0.500 | 0.818 | 27 | 109 |
| weekday | Friday | 88 | 0.500 | 0.600 | 0.068 | 0.771 | 2 | 41 |
| weekday | Monday | 62 | 0.484 | 0.762 | 0.533 | 0.825 | 5 | 14 |
| weekday | Saturday | 91 | 0.516 | 0.895 | 0.362 | 0.806 | 2 | 30 |
| weekday | Sunday | 90 | 0.511 | 0.793 | 0.500 | 0.803 | 6 | 23 |
| weekday | Thursday | 61 | 0.344 | 0.800 | 0.571 | 0.891 | 3 | 9 |
| weekday | Tuesday | 61 | 0.475 | 0.757 | 0.966 | 0.786 | 9 | 1 |
| weekday | Wednesday | 58 | 0.431 | 0.960 | 0.960 | 0.997 | 1 | 1 |

Lowest-precision segments with n≥12:

- showtime_volume / shows_51_plus: precision 0.000, recall 0.000, n=164
- showtime_volume / shows_21_50: precision 0.571, recall 0.148, n=79
- weekday / Friday: precision 0.600, recall 0.068, n=88
- showtime_volume / shows_6_20: precision 0.643, recall 0.257, n=149
- run_type / rerelease: precision 0.645, recall 1.000, n=31

Lowest-recall segments with n≥12:

- showtime_volume / shows_51_plus: recall 0.000, precision 0.000, n=164
- weekday / Friday: recall 0.068, precision 0.600, n=88
- footprint / 5plus_theaters: recall 0.143, precision 1.000, n=200
- showtime_volume / shows_21_50: recall 0.148, precision 0.571, n=79
- showtime_volume / shows_6_20: recall 0.257, precision 0.643, n=149

## 3. False positives and false negatives

7-day public last-chance false positives: **28**. False negatives: **119**.
14-day untagged-or-not-caught false negatives (no public flag): **30**.

### False-positive pattern counts (7-day last chance)

- low_footprint: 20
- rerelease: 11
- mid_footprint: 8
- booking_horizon_matches_endpoint: 3
- short_booking_but_run_continued: 3
- temporary_theater_loss: 1

### False-negative pattern counts (7-day, not last chance)

- booking_horizon_matches_endpoint: 119
- low_footprint: 72
- mid_footprint: 29

### Sample false positives

| Film | Date | Bucket | P7 | Median days | Max booked | Actual end | Remaining | Theaters | Horizon | Run type |
|---|---|---|---:|---:|---|---|---:|---:|---:|---|
| Cars: 20th Anniversary | 2026-09-08 | last_chance | 0.944 | 0.0 | 2026-09-09 | 2026-09-17 | 9 | 4 | 1 | rerelease_anniversary |
| Ghost in the Shell 30th Anniversary | 2026-09-20 | last_chance | 0.944 | 1.0 | 2026-09-23 | None | None | 2 | 3 | rerelease_anniversary |
| Mighty Mary | 2026-09-15 | last_chance | 0.944 | 1.0 | 2026-09-16 | 2026-09-23 | 8 | 1 | 1 | probable_normal_first_run |
| Dear You | 2026-09-08 | last_chance | 0.944 | 1.0 | 2026-09-09 | 2026-09-23 | 15 | 1 | 1 | probable_normal_first_run |
| Dear You | 2026-09-15 | last_chance | 0.944 | 1.0 | 2026-09-16 | 2026-09-23 | 8 | 1 | 1 | probable_normal_first_run |
| PAW Patrol: The Dino Movie | 2026-09-15 | last_chance | 0.944 | 2.0 | 2026-09-16 | 2026-09-24 | 9 | 2 | 1 | probable_normal_first_run |
| Mirzapur | 2026-09-08 | last_chance | 0.944 | 2.0 | 2026-09-09 | 2026-09-16 | 8 | 1 | 1 | probable_normal_first_run |
| Ghost in the Shell 30th Anniversary | 2026-09-19 | last_chance | 0.943 | 2.0 | 2026-09-23 | None | None | 2 | 4 | rerelease_anniversary |
| Hanuman Ansh | 2026-09-15 | last_chance | 0.943 | 2.0 | 2026-09-16 | 2026-09-23 | 8 | 1 | 1 | probable_normal_first_run |
| Teenage Sex and Death at Camp Miasma | 2026-09-08 | last_chance | 0.943 | 2.0 | 2026-09-09 | 2026-09-17 | 9 | 1 | 1 | probable_normal_first_run |
| Cars: 20th Anniversary | 2026-09-07 | last_chance | 0.943 | 2.0 | 2026-09-09 | 2026-09-17 | 10 | 4 | 2 | rerelease_anniversary |
| Cars: 20th Anniversary | 2026-09-06 | last_chance | 0.942 | 2.0 | 2026-09-09 | 2026-09-17 | 11 | 4 | 3 | rerelease_anniversary |

### Sample false negatives

| Film | Date | P7 | P14 | Median days | Max booked | Actual end | Remaining | Theaters | Horizon | Run type |
|---|---|---:|---:|---:|---|---|---:|---:|---:|---|
| The Uprising | 2026-09-18 | 0.013 | 0.610 | 13.0 | 2026-09-23 | 2026-09-24 | 6 | 6 | 5 | probable_normal_first_run |
| The Uprising | 2026-09-19 | 0.016 | 0.815 | 11.0 | 2026-09-23 | 2026-09-24 | 5 | 6 | 4 | probable_normal_first_run |
| Akira | 2026-09-11 | 0.016 | 0.825 | 11.0 | 2026-09-16 | 2026-09-17 | 6 | 5 | 5 | probable_normal_first_run |
| The Uprising | 2026-09-20 | 0.021 | 0.882 | 10.0 | 2026-09-23 | 2026-09-24 | 4 | 6 | 3 | probable_normal_first_run |
| Akira | 2026-09-12 | 0.026 | 0.898 | 10.0 | 2026-09-16 | 2026-09-17 | 5 | 5 | 4 | probable_normal_first_run |
| The End of Oak Street | 2026-09-10 | 0.030 | 0.904 | 9.0 | 2026-09-16 | 2026-09-16 | 6 | 5 | 6 | probable_normal_first_run |
| If I Go Will They Miss Me | 2026-09-18 | 0.030 | 0.904 | 9.0 | 2026-09-24 | 2026-09-24 | 6 | 3 | 6 | probable_normal_first_run |
| Onslaught | 2026-09-11 | 0.039 | 0.909 | 9.0 | 2026-09-16 | 2026-09-17 | 6 | 5 | 5 | probable_normal_first_run |
| Finding Emily | 2026-09-04 | 0.040 | 0.909 | 9.0 | 2026-09-09 | 2026-09-10 | 6 | 5 | 5 | probable_normal_first_run |
| Akira | 2026-09-13 | 0.043 | 0.910 | 9.0 | 2026-09-16 | 2026-09-17 | 4 | 5 | 3 | probable_normal_first_run |
| Akira | 2026-09-14 | 0.045 | 0.910 | 9.0 | 2026-09-16 | 2026-09-17 | 3 | 5 | 2 | probable_normal_first_run |
| The Sun Never Sets | 2026-09-04 | 0.047 | 0.910 | 9.0 | 2026-09-09 | 2026-09-10 | 6 | 3 | 5 | probable_normal_first_run |

## 4. Pre/post September 3 feature regime

Capped-PIT rows: **3300**. All-announced rows: **1389**.
Pearson correlation of announced horizon vs realized remaining days: capped PIT **0.556** (n=3143), all-announced **0.768** (n=859).

| Feature | Pre mean | Post mean | Pre 7d AUC | Post 7d AUC | Pre ceiling share | Post ceiling share |
|---|---:|---:|---:|---:|---:|---:|
| announced_horizon_days | 7.638 | 7.199 | 0.941 | 0.916 | 0.232 | 0.179 |
| farthest_show_date_delta | 0.355 | 0.243 | 0.611 | 0.512 | 0.000 | 0.001 |
| days_with_announced_showtimes | 4.122 | 5.001 | 0.738 | 0.800 | 0.035 | 0.047 |
| showtime_count | 67.255 | 56.176 | 0.778 | 0.831 | 0.468 | 0.510 |
| theater_count | 3.546 | 3.695 | 0.702 | 0.716 | 0.000 | 0.000 |
| showtimes_per_active_day | 9.856 | 8.244 | 0.747 | 0.762 | 0.217 | 0.225 |
| weekend_showtime_count | 19.398 | 17.441 | 0.757 | 0.807 | 0.264 | 0.284 |
| weekend_share | 0.261 | 0.310 | 0.630 | 0.614 | 0.000 | 0.000 |
| prime_time_showtime_count | 24.107 | 23.377 | 0.784 | 0.830 | 0.318 | 0.356 |
| prime_share | 0.458 | 0.446 | 0.538 | 0.578 | 0.000 | 0.000 |
| premium_format_count | 5.403 | 2.453 | 0.539 | 0.532 | 0.048 | 0.041 |
| premium_format_share | 0.023 | 0.025 | 0.537 | 0.530 | 0.000 | 0.000 |
| delta_theater_count | -0.023 | -0.060 | 0.529 | 0.543 | 0.000 | 0.000 |
| delta_showtime_count | -0.875 | -1.505 | 0.604 | 0.596 | 0.107 | 0.062 |
| lost_theater_since_prior | 0.033 | 0.051 | 0.518 | 0.532 | 0.000 | 0.000 |
| lost_weekend_coverage | 0.050 | 0.062 | 0.522 | 0.528 | 0.000 | 0.000 |
| lost_prime_time_coverage | 0.018 | 0.026 | 0.517 | 0.530 | 0.000 | 0.000 |
| days_since_run_start | -0.203 | 3.880 | 0.696 | 0.704 | 0.108 | 0.185 |
| observations_since_run_start | 10.860 | 16.929 | 0.661 | 0.604 | 0.309 | 0.548 |
| horizon_at_ceiling | 0.232 | 0.179 | 0.671 | 0.661 | 0.000 | 0.000 |

`announced_horizon_days` stays the strongest single feature after the collection change (direction-agnostic 7-day AUC about 0.92). `horizon_at_ceiling` only eased from a mean of about 0.23 to 0.18, and removing it (candidate D) does not change holdout PR-AUC. The ceiling flag is redundant with the raw horizon, not a feature that should be treated as newly decisive. The share-at-least-13 column is the rate of values ≥ 13; for 0/1 flags that rate stays near zero and the mean is the rate.

Booking horizon plus footprint matches or slightly exceeds the full survival model on the holdout. Trajectory features alone are weak. Longer announced horizon correctly lowers the hazard (coefficient about -2.5). `lost_weekend_coverage` has a negative coefficient, which is suspicious: losing weekend showtimes should not by itself predict a longer run.

False positives are mostly low-footprint and rerelease titles whose booked horizon was 1–3 days and whose calibrated P7 sat on the same ~0.944 ceiling. Only a handful continued because the next booking week had not been published (`short_booking_but_run_continued`). Blank actual end dates are runs still open at the evaluation as-of; once the horizon has elapsed they count as not ended.

False negatives are the opposite cliff. Films whose announced horizon was already within about two days of the true end still had P7 around 0.01–0.05, so they missed `last_chance`. That tag is not evidence AMC hid the next week. Wide releases (5+ theaters, 51+ showtimes) almost never end inside 7 days; the few `last_chance` calls there were false alarms. Family/holiday rows were not materially present in the public matured set. Event and special runs are scored internally and excluded from the public buckets.

The 2026-09-28 snapshot is the day with zero public flags. It recorded `active_runs: 0` with `skipped: false`, so the empty shelf is an empty inference input, not a threshold that rejected every film. Other days flagged several titles; max P7 sits near 0.944 and max P14 near 0.913, which is why small threshold moves do not change who is listed.

## 5. Candidate models on the later holdout

Train ≤ 2026-08-14, validation through 2026-09-02, holdout 2026-09-03 → 2026-09-27 (1389 rows). No random split.

Candidate C (train only on all-announced rows): **not_fit: the mature all-announced block is the holdout, so training on it would leak**. Mature 14-day all-announced rows: 1064.

| Model | 7d n | 7d PR-AUC | 7d Brier | 14d n | 14d PR-AUC | 14d Brier | Concordance | MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| frozen_v1 | 1213 | 0.921 | 0.090 | 1064 | 0.981 | 0.067 | 0.908 | 1.941 |
| retrained_survival_A | 1213 | 0.930 | 0.083 | 1064 | 0.982 | 0.062 | 0.917 | 1.850 |
| retrained_survival_B_regime | 1213 | 0.930 | 0.083 | 1064 | 0.982 | 0.062 | 0.916 | 1.853 |
| retrained_survival_D_no_ceiling | 1213 | 0.930 | 0.083 | 1064 | 0.982 | 0.061 | 0.917 | 1.847 |
| logistic_7d | 1213 | 0.931 | 0.075 |  |  |  |  |  |
| hgb_7d_diagnostic | 1213 | 0.961 | 0.054 |  |  |  |  |  |
| logistic_14d |  |  |  | 1064 | 0.977 | 0.073 |  |  |
| hgb_14d_diagnostic |  |  |  | 1064 | 0.983 | 0.055 |  |  |

### Ablation on the same holdout (uncalibrated PR-AUC)

| Spec | 7d PR-AUC | 7d Brier | 14d PR-AUC | 14d Brier |
|---|---:|---:|---:|---:|
| booking_horizon | 0.891 | 0.123 | 0.966 | 0.093 |
| footprint | 0.799 | 0.168 | 0.929 | 0.133 |
| trajectory | 0.588 | 0.232 | 0.839 | 0.205 |
| booking_horizon_plus_footprint | 0.936 | 0.074 | 0.985 | 0.056 |
| footprint_plus_trajectory | 0.805 | 0.155 | 0.942 | 0.120 |
| full | 0.930 | 0.078 | 0.982 | 0.060 |

Largest |coefficients| on retrained survival A:

- showtimes_per_active_day: -3.2952
- announced_horizon_days: -2.5230
- period: 1.8071
- days_since_run_start: -1.5377
- lost_weekend_coverage: -1.3512
- period_0: -1.1795
- is_special: -1.0563
- period_1: -0.8233
- period_14: 0.7659
- grp_first_run: -0.7573
- has_weekend: -0.7544
- period_13: 0.7141

## 6. Threshold tradeoffs

Frozen production thresholds stay in place. These rows are prospective operating points on matured public-eligible snapshots.

| Target | Horizon | Threshold | Precision | Recall | Predicted positive |
|---|---:|---:|---:|---:|---:|
| 0.9 | 7 | 0.944 | 0.900 | 0.184 | 50 |
| 0.95 | 7 | 0.944 | 0.952 | 0.163 | 42 |
| 0.975 | 7 | 0.944 | 1.000 | 0.049 | 12 |
| 0.85 | 14 | 0.069 | 0.850 | 0.991 | 267 |
| 0.9 | 14 | 0.373 | 0.900 | 0.943 | 240 |
| 0.95 | 14 | 0.911 | 0.953 | 0.790 | 190 |

### Days with zero public flags

- {'observation_date': '2026-09-28', 'skipped': False, 'eligible': 0, 'public_eligible': 0, 'last_chance': 0, 'leaving_soon': 0}

Daily public flag counts:

| Date | Public eligible | Last chance | Leaving soon only | Max P7 | Max P14 |
|---|---:|---:|---:|---:|---:|
| 2026-09-04 | 33 | 3 | 19 | 0.944 | 0.913 |
| 2026-09-05 | 33 | 7 | 15 | 0.944 | 0.913 |
| 2026-09-06 | 35 | 13 | 12 | 0.944 | 0.913 |
| 2026-09-07 | 35 | 14 | 11 | 0.944 | 0.913 |
| 2026-09-08 | 34 | 22 | 7 | 0.944 | 0.913 |
| 2026-09-09 | 31 | 15 | 5 | 0.944 | 0.913 |
| 2026-09-10 | 29 | 6 | 11 | 0.944 | 0.913 |
| 2026-09-11 | 27 | 1 | 16 | 0.940 | 0.913 |
| 2026-09-12 | 27 | 2 | 16 | 0.943 | 0.913 |
| 2026-09-13 | 27 | 7 | 11 | 0.944 | 0.913 |
| 2026-09-14 | 27 | 7 | 11 | 0.944 | 0.913 |
| 2026-09-15 | 27 | 15 | 3 | 0.944 | 0.913 |
| 2026-09-16 | 27 | 10 | 8 | 0.944 | 0.913 |
| 2026-09-17 | 32 | 9 | 13 | 0.944 | 0.913 |
| 2026-09-18 | 29 | 2 | 17 | 0.942 | 0.913 |
| 2026-09-19 | 32 | 11 | 13 | 0.944 | 0.913 |
| 2026-09-20 | 29 | 10 | 11 | 0.944 | 0.913 |
| 2026-09-21 | 28 | 9 | 11 | 0.944 | 0.913 |
| 2026-09-22 | 28 | 16 | 4 | 0.944 | 0.913 |
| 2026-09-23 | 29 | 16 | 4 | 0.944 | 0.913 |
| 2026-09-24 | 29 | 9 | 10 | 0.944 | 0.913 |
| 2026-09-25 | 23 | 1 | 14 | 0.943 | 0.913 |
| 2026-09-26 | 23 | 2 | 13 | 0.944 | 0.913 |
| 2026-09-27 | 23 | 4 | 11 | 0.944 | 0.913 |
| 2026-09-28 | 0 | 0 | 0 | n/a | n/a |

## 7. Timing-date error

Error is bounded presentation date minus actual final show date, in days. Positive bias means the published date is later than the true end.

| Slice | n | MAE | Median AE | Signed bias | ±1 | ±2 | ±3 | ±7 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| last_chance | 150 | 2.447 | 1.000 | 0.180 | 0.700 | 0.800 | 0.833 | 0.927 |
| leaving_soon | 123 | 3.089 | 2.000 | -0.976 | 0.358 | 0.553 | 0.699 | 0.919 |
| normal_first_run | 421 | 2.720 | 2.000 | 0.349 | 0.485 | 0.658 | 0.762 | 0.945 |
| rerelease | 27 | 1.704 | 0.000 | -1.704 | 0.815 | 0.815 | 0.815 | 0.815 |
| all_realized_public | 448 | 2.658 | 1.000 | 0.225 | 0.504 | 0.667 | 0.766 | 0.938 |

## 8. Run-gap audit

Production still starts a new run at 14 dark days. Counts below exclude gaps that fall entirely on missing snapshot days.

- Return in 1–3 days: **25**
- Return in 4–7 days: **4**
- Return in 8–14 days: **0**
- Return after 14 days: **5**
- Gaps that may be missing snapshots: **3**

Returns of 1–13 days remain one run. The 8–14 day pile is the group most likely to hide a genuinely separate booking. This audit does not change the 14-day rule.

## 9. Recommendation

**`RECALIBRATE_V1`**

Frozen v1 holdout 7-day PR-AUC 0.921 / 14-day 0.981. Retrained survival A holdout 7-day PR-AUC 0.930 / 14-day 0.982. Prospective last_chance precision 0.818 and leaving_soon precision 0.911. Prospective last-chance precision is below the frozen 95% validation target. Raising the threshold can push that top bin back toward 95% precision, but 7-day scores clump near 0.944, so recall falls sharply and the under-confident middle is not recovered. Retrained survival, a regime flag, and dropping horizon_at_ceiling each move holdout PR-AUC by about 0.01. Histogram boosting is higher at 7 days and flat at 14 days; it stays a diagnostic. Do not promote the candidate.

The candidate JSON, when written, lives at `data/models/leaving_soon/candidates/amc_remaining_run_survival_v2_candidate.json` with `do_not_promote: true`. `active.json` still points at v1.

## Reproduction

```text
python scripts/audit_leaving_soon_v2.py
python scripts/evaluate_leaving_soon_v1_prospective.py
python scripts/train_leaving_soon_v2_candidate.py
```

Generated JSON for this run is gitignored under `audit-output/leaving-soon-v2/`.

