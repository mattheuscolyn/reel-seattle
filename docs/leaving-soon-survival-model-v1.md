# AMC remaining-run survival model v1

**Status:** Offline backtest complete — **not** production, **not** UI, **not** a Leaving Soon artifact replacement  
**Date:** 2026-09-02  
**Branch:** `feature/leaving-soon-survival-model-v1`  
**Base:** `53ee67647de21f8e54d4ee2e11998cfd6fb7873e` (`feature/leaving-soon-lifecycle-audit`)  
**Ship-gate recommendation:** `promising_continue`

This document reports the first serious remaining-run time-to-event model for enabled Seattle-area AMC theaters.

Product question:

> For each currently active AMC theatrical run in the enabled Seattle-area AMC network, estimate how many calendar days remain until that run's final AMC show date anywhere in the network.

It does **not** change Planner, does **not** replace `leaving_soon_current.json`, and does **not** add frontend badges.

Reproduce:

```text
python scripts/train_leaving_soon_survival.py
python scripts/evaluate_leaving_soon_survival.py --observations-csv audit-output/leaving-soon-survival-v1/lifecycle/observations.csv
```

Library: `reel_seattle/analysis/leaving_soon_survival.py`. Generated outputs are gitignored under `audit-output/leaving-soon-survival-v1/`. Observation contract: `schema/analysis/amc_run_lifecycle_observations/v1.0.0.json`.

Related: [leaving-soon-lifecycle-audit.md](./leaving-soon-lifecycle-audit.md) (authoritative data contract), [amc-all-announced-showtimes.md](./amc-all-announced-showtimes.md) (current AMC collection vs historical 14-day PIT), [leaving-soon-model-design.md](./leaving-soon-model-design.md) (older Wednesday-extension **label**, superseded), [amc-source-catalog.md](./amc-source-catalog.md).

---

## 1. Modeling objective

| Decision | Locked value |
|----------|----------------|
| Target | Network-wide AMC run remaining lifetime |
| Formula | `remaining_days(T) = (run_end_date - observation_date).days` |
| Same-day final show | **0** remaining days |
| Run end | Last **occurred** AMC show date anywhere in the enabled Seattle-area AMC network for that source-native product/run |
| Geography | All enabled Seattle-area AMC theaters, aggregated |
| Per-theater remaining-run | Out of scope |
| Run identity | `run_id = product identity + network run sequence`; 14 dark days starts a new run |
| Primary identity | AMC `source_film_id` / movie ID |
| Title fallback | Excluded from the **primary** fit |
| Specials | Kept; stratified / encoded; not dropped |
| Censoring | Active runs at historical `as_of` are right-censored; no fake end dates |
| Old Wednesday-extension label | **Not** the target. Wednesday is a calendar/process feature |

The model estimates a discrete-time hazard at observation *T* using only features available in that point-in-time snapshot, then converts the hazard path into a survival curve, near-term exit probabilities, and a median remaining-days point estimate.

---

## 2. Dataset / filter contract

The lifecycle observation table was regenerated from committed lifecycle-audit code (`reel_seattle/analysis/amc_run_lifecycle.py`) on this worktree (`as_of` = **2026-09-01**).

### Regenerated table (unfiltered)

| Item | Value |
|------|--------|
| Rows | **3010** |
| Unique runs | **239** |
| Observed events | **2296** |
| Right-censored rows | **714** |
| Left-truncated rows | **47** |
| Horizon-truncated rows | **626** |
| Normal first-run rows | **1821** |
| Special rows | **1189** |
| Identity | `source_film_id` 2910 / `title_fallback` 100 |
| Observation quality | `usable_14day_truncated` 2770, `high_confidence_pit` 140, `usable_14day_truncated_title_identity` 100 |
| Date range | 2026-06-29 → 2026-09-01 (JSON PIT window) |

This matches the lifecycle audit (~3,010 rows). Title-fallback rows are the early JSON days without movie ID plus any residual title identity.

### Primary fit filter

Applied in order. Rows are never dropped silently; `filter_accounting.json` records each step.

| Step | Dropped | Remaining |
|------|--------:|----------:|
| all_observations | 0 | 3010 |
| not_source_film_id_identity | 100 | 2910 |
| title_fallback_or_title_prefix | 0 | 2910 |
| observation_quality_not_pit | 0 | 2910 |
| outcome_not_observed_or_censored | 0 | 2910 |
| uncensored_missing_remaining_days | 0 | 2910 |

Primary cohort after filter:

| Item | Value |
|------|--------|
| Rows | **2910** |
| Unique runs | **186** |
| Observed events | **2196** |
| Right-censored rows | **714** (all preserved) |
| Left-truncated rows | **0** (title-only early window dropped) |
| Horizon-truncated rows | **609** |
| Normal first-run | **1762** |
| Special | **1148** (concert 692, rerelease 249, Q&A/fan 108, accessibility 99) |
| Observation quality | `usable_14day_truncated` 2770 / `high_confidence_pit` 140 |
| Date range | 2026-07-01 → 2026-09-01 |

Special presentations stay in the primary fit. The 100 title-fallback rows are the only exclusion. Broader Git-recovered 2025 snapshots were **not** mixed into the primary table; they remain a lower-confidence sensitivity universe (see §16) and were not treated as extra statistical power.

---

## 3. Temporal split

Time-based only. No random row split.

Rows are assigned by **`observation_date`**:

```text
train:  observation_date <= 2026-07-27
val:    2026-07-27 < observation_date <= 2026-08-14
test:   observation_date > 2026-08-14
```

Cut dates were chosen so each split has enough **observed events** inside a ~two-month source-native window, with test as the newest held-out block. Thresholds and Platt calibrators are fit on validation only. Test is untouched until those choices are frozen.

| Split | Rows | Runs | Observed | Censored | First-run | Special | Dates |
|-------|-----:|-----:|---------:|---------:|----------:|--------:|-------|
| Train | 1209 | 109 | 1106 | 103 | 725 | 484 | 2026-07-01 → 2026-07-27 |
| Val | 838 | 103 | 682 | 156 | 499 | 339 | 2026-07-28 → 2026-08-14 |
| Test | 863 | 80 | 408 | 455 | 538 | 325 | 2026-08-15 → 2026-09-01 |

**Split semantics**

- A later observation never enters an earlier split.
- The same `run_id` **may** appear in more than one split at different dates (`run_overlap_train_val=42`, `run_overlap_val_test=64`). That is expected for panel data.
- Features at *T* are point-in-time. They do not include future snapshots, `run_end_date`, `remaining_days`, or last-seen fields.
- Labels use complete retrospective follow-up through `as_of=2026-09-01`. A train observation of a run that later ends in the test window therefore knows the eventual end date as a **label**, not as a feature. That is standard TTE labeling, not snapshot leakage.
- Binary 7/14-day labels drop right-censored rows whose follow-up is shorter than the horizon (`binary_outcome` returns `None`).

The recent high-confidence source-native JSON window is short. A three-way split is still usable for near-term exit risk, but it is **not** a long-horizon lifetime panel. We did not invent a second high-power Git-title dataset to pad the test set.

---

## 4. Baselines

All baselines are fit on **train** and scored on val/test.

1. **Run-age-only** — empirical median remaining lifetime in age buckets.
2. **Current-footprint heuristic** — inverted theater/showtime/horizon score (high footprint → longer remaining).
3. **Kaplan–Meier segment** — KM by first-run vs special (plus age bucket when populated).
4. **Adapted Leaving Soon rule** — `low_footprint_not_first_week` (`theater_count <= 2` and `days_since_run_start >= 7`). This is a binary flag mapped to near-term exit, not a lifetime model.

Validation, end-within-7-days:

| Baseline | Precision | Recall | PR-AUC | Brier | Remaining MAE | Concordance |
|----------|----------:|-------:|-------:|------:|--------------:|------------:|
| Age-only | 0.000 | 0.000 | n/a* | 0.263 | 6.02 | 0.52 |
| Footprint heuristic | 0.267 | 1.000 | 0.53 | 0.592 | 5.83 | 0.65 |
| KM segment | 0.336 | 0.518 | 0.68 | 0.200 | 5.83 | 0.59 |
| Low-footprint not first week | 0.855 | 0.214 | 0.95† | 0.216 | 6.02 | 0.52 |
| **Primary logistic (val, raw @0.5)** | **0.794** | **0.914** | **0.929** | **0.058** | **2.40** | **0.87** |

\* Age-only almost never predicts remaining &lt; 7 days, so the 7-day PR curve is degenerate.  
† The old rule’s PR-AUC is high because the rare positives it fires are often true, but recall is 0.21 — it is a narrow flag, not a ranking model.

Test remaining-days MAE: age-only 4.74, footprint 4.21, KM 5.42 vs primary **1.37**. The discrete-time model beats useful simple baselines on ranking, calibration-sensitive Brier, and remaining-day error. It is not “always survives.”

---

## 5. Discrete-time survival formulation

**Choice: daily bins, 21-day modeled horizon.**

AMC books weekly, so weekly hazard is statistically tempting. Empirically we kept **daily** bins because:

- the product target is remaining **days**, including same-day (0) and one-night specials;
- weekly bins smear day-0 concerts into a 0–6 day bucket;
- the primary window has enough person-period rows for a regularized daily logistic;
- `--bin-size 7` remains supported for sensitivity.

Each observation expands to person-period rows:

- Observed event at remaining days *r*: `event=1` in the bin containing *r*, `event=0` in earlier bins.
- Events beyond the horizon contribute only `event=0` through the last bin (horizon-censored).
- Right-censored rows contribute `event=0` only for bins **fully elapsed** before follow-up. Incomplete bins are omitted. `T == as_of` emits no periods. No fake end dates.

Hazard model:

```text
h(t | x_T) = P(run ends in bin t | survived t-1, features at observation T)
S(k) = Π_{t=0..k} (1 - h(t))
P(end within D days) = 1 - S(D-1)
```

Primary family: **L2-regularized logistic regression** (`sklearn.linear_model.LogisticRegression`, `C=1.0`, `random_state=42`). Continuous features (including `period`) are standardized with `StandardScaler` **fit on train person-periods only**.

Survival curves are clipped to `[0, 1]` and forced monotone non-increasing.

**Tail:** if survival stays above 0.5 through day 21, `median_remaining_days` is unset and `median_beyond_horizon=true`. Expected remaining days is the discrete sum of survival through the horizon (a lower bound when mass remains past day 21). Do not treat that expectation as an unbounded lifetime.

Dependency: `scikit-learn>=1.4,<2` in `requirements-dev.txt` only (analysis/CI). No dedicated survival library.

---

## 6. Feature set

Features are constructed from the observation at *T*. Forbidden inputs (`run_end_date`, `remaining_days`, `event_observed`, `last_seen_*`, outcome quality, etc.) are asserted out of the covariate dict.

| Family | Features used |
|--------|----------------|
| Lifecycle / age | `days_since_run_start`, `observations_since_run_start`, `left_truncated`, `is_first_week` |
| Current footprint | theater/showtime counts, showtimes per active day, announced days, announced horizon, weekend/prime/premium counts and shares, `has_weekend`, `low_footprint`, `horizon_at_ceiling` |
| Trajectory | deltas vs prior observation, lost theater / weekend / prime flags, farthest-date movement, `missing_prior` |
| Run type | `is_special`, grouped dummies `first_run` / `rerelease` / `event_or_special`, interactions `is_special × theater_count` and `is_special × run_age` |
| Calendar | `days_to_wednesday` (weekday numeric is in the covariate dict but was not in the fitted column list; ablation shows calendar adds nothing) |
| Discrete time | `period` plus period dummies 0..20 |

**Unavailable / not built (do not invent fragile versions):**

- Network or theater **capacity share** and competing-film slot occupancy. The lifecycle grain is run×date, not a reconstructed screen-level capacity table.
- Known future major-release load beyond what is already in the same PIT AMC schedule.
- Holiday proximity (summer-only window; not worth a one-off calendar table).
- True post-ceiling announced horizon (blocked on `feature/amc-all-announced-showtimes` landing in **future** logs).

Missing prior-observation deltas are 0 with `missing_prior=1`.

---

## 7. Special-presentation treatment

Specials are **kept**. They are not a tiny per-category model zoo.

Compared:

- **A. Pooled logistic** with run-type group dummies + special×footprint/age interactions (primary).
- **B. Stratified KM baseline** (first-run vs special) and test-set metrics by `run_type_group`.

Separate intercepts via group dummies are in the primary model. Tiny per-taxonomy models (anime event has 2 unfiltered rows) were not trained.

The point is to stop one-night concerts from teaching “all low-footprint films die tonight.” Test 7-day precision is high on `event_or_special` (0.90) and weaker on **rereleases** (0.58) — see §12. First-run remains the product-critical segment (test 7-day PR-AUC 0.89, precision 0.83 at the 90% val threshold).

---

## 8. Primary results

Primary model: regularized discrete-time logistic, daily bins, 21-day horizon, Platt calibration of 7/14-day probabilities on **validation**.

| Metric | Val (raw @0.5) | Val (Platt @0.5) | Test (Platt + val 90% threshold) |
|--------|----------------|------------------|----------------------------------|
| End-within-7 PR-AUC | 0.929 | 0.929 | **0.925** |
| End-within-7 ROC-AUC | 0.971 | 0.971 | 0.952 |
| End-within-7 Brier | 0.058 | **0.054** | 0.084 |
| End-within-7 precision / recall | 0.794 / 0.914 | 0.864 / 0.868 | 0.841 / 0.851 |
| Concordance (median remaining) | 0.871 | 0.871 | **0.903** |
| Remaining MAE / median AE (uncensored) | 2.40 / 1.0 | same | **1.37 / 1.0** |

Test remaining-day error is only on **uncensored** events (n=402). Censored rows are not given fake ends.

The model clearly beats age, footprint, and KM baselines on 7-day ranking, Brier, concordance, and remaining-day MAE.

---

## 9. Near-term 7/14-day results

Evaluable binary labels require observed end or follow-up covering the horizon. Test 7-day n=682 (base rate **0.355**). Test 14-day n=499 (base rate **0.792**).

That 14-day base rate is high because the held-out window is short, many specials end quickly, and many surviving wide first-runs are still censored (excluded from the 14-day binary when follow-up &lt; 14). **Do not over-read 14-day precision.**

| Horizon | Split | Base rate | Precision | Recall | PR-AUC | ROC-AUC | Brier | Lift |
|---------|-------|----------:|----------:|-------:|-------:|--------:|------:|-----:|
| 7 | Val calibrated @0.5 | 0.263 | 0.864 | 0.868 | 0.929 | 0.971 | 0.054 | 3.29 |
| 7 | Test @ val 90% thr 0.653 | 0.355 | 0.841 | 0.851 | 0.925 | 0.952 | 0.084 | 2.37 |
| 14 | Val calibrated @0.5 | 0.551 | 0.863 | 0.883 | 0.941 | 0.929 | 0.105 | 1.56 |
| 14 | Test @ val 90% thr 0.805 | 0.792 | 0.962 | 0.896 | 0.985 | 0.949 | 0.070 | 1.22 |

---

## 10. Precision / coverage operating points

Thresholds chosen on **validation** for ≥90% and ≥95% precision, then applied unchanged to test.

| Horizon | Val target | Val threshold | Val P / R | Test P / R |
|---------|------------|--------------:|-----------|------------|
| 7 | ≥90% | 0.653 | 0.904 / 0.814 | **0.841 / 0.851** (90% **did not hold**) |
| 7 | ≥95% | 0.883 | 0.954 / 0.655 | **0.925 / 0.715** (held) |
| 14 | ≥90% | 0.805 | 0.901 / 0.792 | 0.962 / 0.896 |
| 14 | ≥95% | 0.912 | 0.953 / 0.608 | 0.986 / 0.739 |

A false “Leaving Soon” badge is worse than a miss. The product-relevant 7-day ≥90% point **failed to transfer**. The stricter 7-day ≥95% point did transfer at useful recall (~0.72). Until a later window confirms ≥90% transfer, this is not a ship-ready badge threshold.

---

## 11. Calibration

Raw 7-day probabilities on validation were slightly over-confident in the middle bins (e.g. predicted 0.52 vs observed 0.30 in 0.4–0.6).

**Platt / sigmoid** calibrators were fit on validation labels only (separate 7-day and 14-day). Isotonic was **not** used: the mid-probability bins are small; isotonic would overfit.

After Platt, validation 7-day reliability is close:

| Bin | Mean predicted | Mean observed |
|-----|----------------|---------------|
| 0.0–0.2 | 0.022 | 0.026 |
| 0.2–0.4 | 0.314 | 0.286 |
| 0.4–0.6 | 0.503 | 0.452 |
| 0.6–0.8 | 0.709 | 0.692 |
| 0.8–1.0 | 0.919 | 0.922 |

Test 7-day (after Platt) still over-predicts a bit in 0.6–1.0 (0.73 vs 0.59; 0.92 vs 0.87). Usable, not perfect. Brier improved on val (0.058 → 0.054). Calibrators were never fit on test.

---

## 12. Stability analysis

Test 7-day metrics at threshold 0.5 unless noted. Weak segments are not hidden.

**Run type**

| Segment | n | Precision | Recall | PR-AUC | Remaining MAE |
|---------|--:|----------:|-------:|-------:|--------------:|
| event_or_special | 214 | 0.899 | 0.982 | 0.964 | 0.89 |
| first_run | 538 | 0.828 | 0.766 | 0.893 | 1.66 |
| rerelease | 111 | **0.578** | 1.000 | 0.972 | 2.56 |

Rereleases are the weak precision segment: the model is trigger-happy. First-run is acceptable but not badge-safe at a 90% target. Specials are “easy” one-night / short-run events — they inflate aggregate metrics.

**Run age**

| Bucket | n | Precision | Recall | MAE |
|--------|--:|----------:|-------:|----:|
| 0–6 days | 646 | 0.794 | 0.920 | 1.31 |
| 7–13 | 125 | 0.955 | 0.808 | 1.96 |
| 14+ | 92 | 0.733 | 0.786 | 0.60 |

**Theater footprint**

| Bucket | n | Precision | Recall |
|--------|--:|----------:|-------:|
| 1 theater | 154 | 0.888 | 0.952 |
| 2 | 203 | 0.903 | 0.942 |
| 3–4 | 269 | **0.631** | 0.774 |
| 5+ | 237 | 0.811 | 0.811 |

Mid-footprint (3–4 theaters) is the hard band — neither obvious one-nighters nor wide holds.

**Calendar month**

Test is almost entirely **2026-08** (n=831). September is 32 rows at the `as_of` edge (no 7-day events). There is **no** multi-month stability evidence. Summer-only data cannot speak to holiday platforming or January collapse.

---

## 13. Ablation study

Same logistic family, validation 7-day:

| Feature set | PR-AUC | Brier | Remaining MAE | Concordance |
|-------------|-------:|------:|--------------:|------------:|
| Age only | 0.416 | 0.199 | 5.29 | 0.62 |
| + footprint | **0.905** | 0.064 | 2.23 | 0.87 |
| + trajectory | 0.920 | 0.056 | 2.05 | 0.87 |
| + run type | 0.930 | 0.058 | 2.38 | 0.87 |
| + calendar | 0.929 | 0.058 | 2.40 | 0.87 |

**Footprint is the model.** Age alone is not competitive. Trajectory adds a small ranking/Brier gain. Run-type encoding slightly helps 7-day PR-AUC (and is required so specials do not poison first-run). Calendar (`days_to_wednesday`) adds nothing in this window. Capacity/competition was not ablated because those features were not built.

Reel Seattle should maintain footprint + modest trajectory + run-type flags. It should not maintain a large calendar/capacity feature shop for this v1.

---

## 14. Feature interpretation

Standardized logistic coefficients (sign = **higher exit hazard**). Period dummies omitted below; later bins generally raise hazard, as they should.

**Lower hazard (survive longer)**

| Feature | Coef |
|---------|-----:|
| showtimes_per_active_day | −3.02 |
| announced_horizon_days | −2.37 |
| lost_weekend_coverage | −1.54 |
| prime_time_showtime_count | −1.44 |
| has_weekend | −1.08 |
| theater_count | −1.05 |
| days_since_run_start | −0.59 |

**Higher hazard (exit sooner)**

| Feature | Coef |
|---------|-----:|
| is_special × theater_count | +0.68 |
| observations_since_run_start | +0.47 |
| days_with_announced_showtimes | +0.40 |
| delta_showtime_count | +0.29 |
| lost_theater_since_prior | +0.27 |
| is_first_week | +0.25 |

Answers, with caution:

- **Does shrinking theater count raise exit hazard?** Yes directionally (`theater_count` −1.05; `lost_theater_since_prior` +0.27). Magnitude is real for theater count; lost-theater is smaller.
- **Does losing weekend showtimes matter?** `has_weekend` is protective. The `lost_weekend_coverage` coefficient is **negative** and should **not** be trusted — likely collinear with remaining weekend count / horizon. Do not write product copy from that sign.
- **Does run age dominate?** No. Age-only ablation is weak; `days_since_run_start` is modestly protective (older surviving runs in this summer window are often still holding). Age is not “older ⇒ dying.”
- **Do capacity constraints help?** Not estimated; features unavailable.
- **How much does run type matter?** Modest on ablation, essential for segment honesty. Specials are easy; rereleases are the failure mode.
- **Does announced horizon help despite 14-day truncation?** Yes as a **current booking depth** signal (`−2.37`), and `horizon_at_ceiling` is a small positive hazard flag. It is **not** remaining lifetime. See §16.

HGB was not used for primary explanation. Permutation importance was not computed for v1 because the logistic coefficients plus ablation already isolate footprint as the driver; impurity importance is not reported.

---

## 15. Conformal / uncertainty feasibility

Lightweight split-conformal interval on **uncensored validation residuals** of predicted median remaining days (`alpha=0.20`).

| Item | Value |
|------|--------|
| Val uncensored n | 631 |
| 80% residual half-width | **4 days** |
| Test uncensored empirical coverage | 0.93 (n=402) |
| `defensible` | **0** |

Formal coverage is **not claimed**. Right-censoring invalidates naive residual conformal: long survivors never enter the residual set, so the interval is an uncensored-event interval, not a remaining-lifetime interval for active runs. Probability-threshold conformal risk control was not built.

Output of this phase: **not yet defensible; collect more data.** A 4-day half-width is also too wide for a “last chance this weekend” badge.

---

## 16. Data limitations

### 14-day historical fetch ceiling

Most PIT logs were collected under the old dated 14-day AMC scan. `announced_horizon_days` near 13–14 often means “fetch window is full,” not “AMC booked exactly two weeks.”

Test split:

| Slice | n | 7-day events | 7-day PR-AUC | Notes |
|-------|--:|-------------:|-------------|--------|
| At/near 14-day ceiling | 130 | **0** | n/a | Still fully booked; model correctly low-risk (Brier ~0) |
| Below ceiling | 733 | almost all 7-day exits | 0.926 | Where the model actually works |

Horizon features are informative as a **truncation-aware booking-depth** signal. They are not a trustworthy remaining-life proxy while the source is capped.

**Current collection** now uses the undated all-announced AMC endpoint ([amc-all-announced-showtimes.md](./amc-all-announced-showtimes.md)). This v1 backtest was fit on **historical** PIT logs that were still mostly 14-day-capped. Do not reclassify those observations as all-announced. Future training rows start only at the first successful post-integration daily log with `collection_mode=all_announced_future`.

### Other limits

- ~2 months of source-native movie-ID PIT JSON. Long first-runs are right-censored; left-truncation in the primary filter is 0 only because title-era early days were dropped.
- Title/history collisions were excluded (100 rows), not modeled.
- Catalog run-type is not a historical-as-of-T field (lifecycle audit limitation).
- Summer-only: no holiday platforming, no January dump.
- Same-run overlap across splits is documented; features still do not peek forward.
- Git-recovered 2025–2026 CSV snapshots were inventoried in the lifecycle audit (~406 dates) but are mixed quality / title-keyed. They were **not** used as a second primary model. Padding with them would fake power.

---

## 17. Comparison to old binary Leaving Soon rules

The old target was “fails to extend past next Wednesday.” That label is **retired**. Wednesday remains `days_to_wednesday` (unused by ablation).

The shipped-adjacent heuristic `low_footprint_not_first_week` on this remaining-days task:

- Validation 7-day: precision 0.86, recall **0.21**.
- Test 7-day: precision 0.73, recall **0.13**.
- Remaining-day MAE identical to age-only (~6 / ~4.7): it does not predict lifetime.

It is a conservative binary flag for tiny late-run footprints, not a remaining-days model. The discrete-time model dominates on recall, ranking, Brier, and MAE. It does **not** yet beat that flag on a **transferred** ≥90% 7-day precision operating point.

Production `leaving_soon_current.json` is unchanged.

---

## 18. Ship / no-ship recommendation

**`promising_continue`**

Not `ready_for_prospective_shadow_test`. Not production UI. Not a replacement for current Leaving Soon artifacts.

| Gate | Result |
|------|--------|
| Beats simple baselines | **Yes** (PR-AUC, Brier, MAE, concordance) |
| Near-term probabilities reasonably calibrated | **Mostly**, after Platt; test still a bit hot in the top bins |
| High-precision op with useful coverage | **Partial.** 7-day ≥95% held (P=0.925, R=0.72). 7-day ≥90% **failed** on test (P=0.841) |
| Segment / month stability | **Not good enough.** Rereleases P=0.58; 3–4 theater P=0.63; only one real test month |
| No obvious target leakage | **Yes** by construction and tests |
| Reproducible | **Yes** (`seed=42`, committed scripts, gitignored artifacts) |

`needs_more_data` is the secondary diagnosis: two summer months of 14-day-capped PIT cannot support a badge. `needs_model_rework` is **not** indicated — footprint-driven daily logistic is the right v1 shape.

---

## 19. Exact next step

1. Keep accumulating **source-native daily JSON logs** after the all-announced production cutover (need a longer panel, including a non-summer stretch).
2. Do **not** retrofit this v1 backtest by pretending historical 14-day-capped PIT rows had full announced depth. Train future models on post-boundary logs.
3. Re-run this experiment (`scripts/train_leaving_soon_survival.py`) with the same filter/split discipline. Require the 7-day ≥90% validation threshold to **hold on a later test window**, and report first-run and rerelease separately.
4. Only then consider a **prospective shadow** that scores live snapshots and waits for actual AMC run ends — still no UI.
5. Do not ship Leaving Soon UI or replace production Leaving Soon artifacts. Do not touch Planner.

---

## Reproduce / artifacts

```text
python scripts/train_leaving_soon_survival.py
```

Writes gitignored `audit-output/leaving-soon-survival-v1/`:

| File | Contents |
|------|----------|
| `model_config.json` | Seed, horizon, bin size, columns |
| `split_summary.json` | Filter accounting + split counts |
| `filter_accounting.json` | Drop reasons |
| `baseline_metrics.json` | Age / footprint / KM / old rule |
| `primary_metrics.json` | Logistic val/test |
| `hgb_metrics.json` | Optional HGB benchmark |
| `operating_points.json` | Val-chosen 90/95% thresholds |
| `coefficients.json` | Standardized logistic weights |
| `ablation.json` | Feature-family ladder |
| `stability.json` | Segment tables |
| `calibration` (inside primary metrics) | Reliability bins |
| `conformal.json` | Residual-interval feasibility |
| `truncation_sensitivity.json` | Ceiling vs below-ceiling |
| `prediction_sample.csv` | Sample scored rows |
| `lifecycle/observations.csv` | Regenerated observation table |

Do not commit trained binaries or these CSVs.

Optional HGB (`HistGradientBoostingClassifier`, max_depth=3): val 7-day PR-AUC 0.931 vs logistic 0.929; test remaining MAE 0.79 vs 1.37. Slightly stronger, not selected as primary (interpretability + no selection on a flashier val/test number).
