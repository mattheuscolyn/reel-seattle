# Remaining Run calendar v2 — strict holdout comparison

**Status: evaluated, not approved for promotion.** This is a sidecar research model, not a replacement for the deployed AMC Leaving Soon survival model or the public A-List forecasts.

The research code `scripts/evaluate_remaining_run_calendar_v2.py` trains two 4-bucket discrete hazard models using *identical features, observation dates and fitting windows*, changing only the labels used in fitting:

1. **Original-label retrained control:** original consecutive-week labels from the same chronology-corrected pre-publication forecast examples.
2. **Calendar-v2 challenger:** independently reconstructed last-playing-Fri–Thu labels from the versioned Phase 2 evidence audit.

For both, the features are the same subset of PR #140 weekly prepublication features, not the full shadow v1 opening-enrichment feature set. The opening family was intentionally removed because its provenance on historical training observations has not yet been independently certified. This experiment isolates the *target change*. No calibration tuning, thresholds, or feature selection are performed using the holdout.

## Results (data as-of October 23, 2026)

| Strictly resolved later holdout | Retrained original-label control | Calendar v2 | Difference (v2 minus control) |
|---|---:|---:|---:|
| Theater, n=707: log loss | 0.6968 | **0.6881** | −0.0087 |
| Theater: Brier (sum over 4 classes) | 0.3741 | **0.3692** | −0.0049 |
| Theater: final-week PR-AUC | 0.9298 | **0.9313** | +0.0015 |
| Theater: accuracy | 0.7214 | **0.7270** | +0.0057 |
| Market, n=192: log loss | **0.8415** | 0.8602 | +0.0187 |
| Market: Brier (sum over 4 classes) | 0.4066 | **0.4040** | −0.0026 |
| Market: final-week PR-AUC | **0.9112** | 0.9067 | −0.0045 |
| Market: accuracy | 0.7188 | **0.7240** | +0.0052 |

The training-only four-class frequency baselines score **1.1909** (theater) and **1.1353** (market) log loss. Both learned models comfortably outperform these naive priors, but that alone does not justify v2 promotion.

**Film-clustered paired 95% bootstrap uncertainty** for v2 minus control log loss, 600 pre-seeded draws:

- Theater: **−0.0087**, interval **[−0.0240, +0.0065]**, n=707 matched examples from 125 films.
- Market: **+0.0187**, interval **[−0.0188, +0.0475]**, n=192 matched examples from 122 films.

Both confidence intervals include zero. Improvements at the theater grain are small and uncertain; market log loss and ranking worsen. **No evidence supports a platform-wide switch.**

## Dataset integrity and limitations

- Chronological 2026 split: 723 theater training rows, 490 validation rows, and 995 holdout rows; of the latter only 707 are strict, resolved outcomes. Market training 199, validation 138, holdout 282; only 192 are strict, resolved.
- Fit uses **train + validation**, in total 1,213 theater rows or 337 market rows, all **provisional legacy evidence** from before AMC snapshots started storing a formal completeness flag. The validation cohort itself has zero strictly certified historical snapshots.
- A train-only diagnostic is retained on the provisional validation cohort, but is not used to select the winner.
- Holdout starts at the first September 8 prepublication observation with fully recorded snapshot quality. The cohort is selected by corroborated ending evidence, which may favor particular types of movies.
- The same film may appear in the fitting and later holdout dates; cluster bootstrap mitigates correlation of repeated film-week examples but does not establish performance on previously unseen titles.
- The candidate is **not** the deployed model; the currently live shadow v1 includes opening-enrichment features and other publication gates. The frozen PR #141 log-loss 0.727 was measured on a **different historical cohort** and must not be treated as an apples-to-apples opponent.
- The chronology-corrected booking baseline and selected feature family are less exposed to lookahead, but **complete per-feature point-in-time provenance has not been independently proved**. Do not claim this as a finalized production validation.
- This is one frozen chronological holdout with no prospective testing. More recent live traffic and drift need independent evaluation.

## Recommendation

**Keep v2 research-only; do not merge its model into production.** The corrected run definition and proven corrected labels are valuable independent of whether this feature set learns them better. Before considering promotion: obtain verified point-in-time feature lineage, better handling of market aggregation and provisional legacy training quality, and a prospective or multiple-period chronological evaluation with predeclared gates. Preserve the existing frozen and rolling audits.

This PR writes only research evaluation artifacts to the isolated Actions job; it does not modify active model pointers, public forecasts, or historical source ledgers.
