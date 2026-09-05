# Leaving Soon production v1

**Status:** First production use of `amc_remaining_run_survival_v1`  
**Ship-gate:** `promising_continue` — production use does **not** mean the model is final or perfectly calibrated  
**Active model:** `data/models/leaving_soon/active.json`  
**Related:** [leaving-soon-survival-model-v1.md](./leaving-soon-survival-model-v1.md) (offline backtest), [amc-all-announced-showtimes.md](./amc-all-announced-showtimes.md), [data-artifact-inventory.md](./data-artifact-inventory.md)

This document is the production contract. It does not retrain the model and does not change Planner.

---

## 1. Production objective

Generate current AMC **run-level** remaining-run predictions on the successful daily scrape, persist an immutable date-stamped snapshot for prospective evaluation, and publish a **bucketed** public `leaving_soon_current.json` that feeds the existing v2 Leaving Soon Home shelf and Explore collection.

Public Pages (`dist/`) still skip this file. v2 (`dist-v2`) allowlists it.

## 2. Model version

`amc_remaining_run_survival_v1`

Never use a bare `v1` label as the production identifier.

Family: regularized logistic discrete-time hazard (21-day horizon, L2, 14-dark-day run segmentation, specials retained as features, source-native AMC identities in the freeze).

## 3. Frozen training cutoff

Daily inference **does not refit**. The freeze used:

| Split | Cutoff |
|-------|--------|
| Train | observation dates ≤ **2026-07-27** |
| Validation (Platt + thresholds) | ≤ **2026-08-14** |
| Label as-of | **2026-09-01** |

Logs after the label as-of date are not used to change v1 weights. Future improvement requires an explicit v2 freeze and promotion.

## 4. Inference feature contract

Canonical builder: `covariate_dict` / `survival_from_hazards` in `reel_seattle/analysis/leaving_soon_survival.py`.

Production inference (`leaving_soon_inference.py`) reconstructs current 14-dark-day runs from the latest AMC all-announced PIT plus prior observations, then calls the same `covariate_dict`. No remaining-days / run-end / future outcome fields are model inputs.

`feature_schema_version`: `1.0.0`.

## 5. Model artifact format

Sklearn-free JSON at `data/models/leaving_soon/amc_remaining_run_survival_v1.json`:

- `model_version`, `feature_schema_version`, `training_data_cutoff`, `calibration_method`
- `columns` (order), `continuous_idx`, `scaler_mean`, `scaler_scale`
- `coefficients`, `intercept`, `horizon_days=21`, `bin_size`
- `platt_7d` / `platt_14d` (`coefficient`, `intercept`)
- frozen validation thresholds
- `checksum_sha256` over canonical JSON excluding the checksum field

Runtime evaluation is a sigmoid over standardized continuous features. scikit-learn stays a **dev/export** dependency (`requirements-dev.txt`), not a daily-job requirement.

Active pointer: `data/models/leaving_soon/active.json`.

## 6. Prediction snapshot schema

`data/model_predictions/leaving_soon/YYYY-MM-DD.json` — one record per current AMC run/product.

Includes identity, observation metadata, model version, calibrated `p_end_within_{3,7,14,21}d`, median/expected remaining days, eligibility flags, public bucket (if any), weak-segment flags.

**Does not include future outcomes.** Re-running the same observation is deterministic for a frozen model + frozen source log.

## 7. Public artifact schema

`public/data/leaving_soon_current.json` — schema `schema/leaving_soon_current/v1.1.0.json`.

Backward-compatible with the old heuristic 1.0.0 object (optional model fields). Production writer emits `schema_version: 1.1.0` plus `leaving_soon_bucket`, `model_version`, `sort_rank`.

Does **not** expose feature vectors or user-facing exact remaining days.

## 8. Bucket thresholds

Frozen from the **validation** operating points stored in the model artifact (not invented at publish time):

| Public bucket | Rule | Frozen v1 value |
|---------------|------|-----------------|
| `last_chance` | calibrated P(end within 7 days) ≥ validation **95% precision** 7-day threshold | **0.878987** |
| `leaving_soon` | else if calibrated P(end within 14 days) ≥ validation **90% precision** 14-day threshold | **0.812992** |
| none | otherwise | — |

Held-out backtest context (do not overclaim): 7-day PR-AUC ~0.925, Brier ~0.084, uncensored remaining-days MAE ~1.37, concordance ~0.903. The validation 90% 7-day threshold fell to ~84.1% precision on test; the 95% 7-day threshold held at ~92.5% test precision. That is why `last_chance` uses the 95% 7-day point.

## 9. Ranking logic

Internal snapshots keep exact probabilities.

Public order (stable):

1. highest P(end within 7 days)
2. then highest P(end within 14 days)
3. then lower predicted median remaining days
4. title / source film id / run id

Exact remaining days are ranking/internal only.

## 10. Special-presentation eligibility

Internal snapshots score **all** eligible-identity current runs, including concerts, Q&A, accessibility, anime, awards, and unknown specials.

The **public** Leaving Soon list is limited to theatrical-like run types:

- `probable_normal_first_run`
- `rerelease_anniversary`
- `family_holiday`

Event-like run types are `public_eligible=false` with `special_presentation_excluded`. Title-fallback identities are ineligible even internally.

## 11. Safe failure behavior

If the latest AMC log is not trustworthy, **do not publish a new public badge list**. Keep the previous `leaving_soon_current.json` on disk. Still write a date-stamped internal snapshot with `skipped=true` when a log exists.

Skip reasons include:

- `collection_mode_not_all_announced_future`
- `restate_safe_false`
- `incomplete_theater_fetch` (`theaters_failed > 0`)
- `stale_source_snapshot` (observation date older than 2 days)
- `model_load_failure:*`

Low-quality partial data must not mint new Leaving Soon badges.

## 12. Workflow / cadence

Same GitHub Action as Daily Showtime Scraping (`.github/workflows/daily_scraping.yml`).

Order inside `daily_processor.py` after showtimes_current:

1. Latest all-announced AMC log is already committed by the scrape
2. Frozen inference
3. Internal `YYYY-MM-DD.json` snapshot
4. Public artifact only if the snapshot is not skipped
5. Existing validate + git commit of showtimes and, when present, snapshots + public Leaving Soon file

No separate `workflow_run` clock. Failed scrapes never reach inference. Successful scrapes that fail the quality gate skip public publish.

## 13. Prospective evaluation design

`scripts/evaluate_leaving_soon_prospective.py` joins historical snapshots to later realized run ends.

It can score matured 7/14-day precision/recall, Brier, calibration bins, remaining-days MAE, and first-run vs rerelease / prediction-date cohorts.

Recent snapshots are skipped until enough time has passed. Outcomes never flow into daily prediction. Outcomes never retrain v1.

## 14. Known v1 weaknesses

- Rereleases and mid-footprint (about 3–4 theaters) are weaker segments
- Historical training through 2026-09-02 is largely 14-day-capped PIT; first confirmed all-announced PIT is **2026-09-03**
- Public showtimes UI remains a shorter horizon than raw AMC all-announced data
- Validation 90% 7-day threshold did not hold on test; production therefore uses the more conservative 95% 7-day point for `last_chance`
- The model is **not** a guarantee a film will leave, and missing badges are **not** a guarantee a film will stay

## 15. How v2 will be promoted

1. Train/backtest a candidate offline (do not overwrite v1 JSON)
2. Compare to frozen v1 on held-out and prospective snapshots
3. Approve explicitly
4. Write `data/models/leaving_soon/amc_remaining_run_survival_v2.json`
5. Point `data/models/leaving_soon/active.json` at v2
6. Keep v1 artifact and all prior prediction snapshots unchanged

## 16. First all-announced data boundary: 2026-09-03

High-confidence production inference requires `stats.collection_mode = all_announced_future` and `stats.restate_safe = true`. The first confirmed all-announced PIT observation is **2026-09-03**.

## 17. Production use is not a final model

Shipping this path means Reel Seattle can generate versioned, evaluable predictions and a conservative public shelf. It does **not** mean the remaining-run model is finished, well-calibrated in every segment, or licensed to display exact days or probabilities to users.
