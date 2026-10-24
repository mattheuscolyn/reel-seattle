# Market v3 prospective shadow — operations runbook

**Status: draft; no live cutover.** PR #159 builds on research PR #158, itself dependent on #155–#157. Do not skip stacked dependencies. The existing production Leaving Soon model and public A-List forecast remain unchanged until separately approved.

## Data flow
1. One-time manual frozen candidate: python -m scripts.bootstrap_remaining_run_market_v3. Uses corrected historical run-end labels on the frozen train+validation cohort through 2026-09-06. Creates data/models/remaining_run_shadow/market_v3_candidate.json, including model SHA-256, feature version, training evidence tiers and freeze timestamp. Refuses overwrite. Changing weights means a new named candidate and a new prospective period.
2. Independent market-wide publication cutoff: one common AMC source-complete snapshot strictly before next Friday, not the earliest theater's schedule. Measures upcoming Friday's posted screening volume divided by the median of four verified past Friday screening volumes (minimum three), and tags >=80% as market-ready. Distinguish completeness of data collection from completeness of published bookings. Logs the market denominator, lag, missing-complete days and availability of Thursday's pre-reset decision snapshot.
3. Daily frozen model scorer: python -m scripts.run_market_v3_shadow. Writes versioned current market forecast under data/model_predictions/remaining_run_market_v3/current.json and immutable historical predictions under data/history/remaining_run_market_v3_predictions.jsonl.gz. Every row includes observation date, generated time, four normalized probability buckets, feature version, model SHA, segment, snapshot quality, publication completeness and features. Duplicate IDs are idempotent; restated probabilities/features fail.
4. Prospective verifier: python -m scripts.evaluate_market_v3_prospective. Settles only saved pre-outcome forecasts using independently complete AMC run-end evidence. Appends proven endings to data/history/remaining_run_market_v3_outcomes.jsonl.gz; writes scorecard to data/audits/remaining_run_market_v3_prospective.json. Unknown outcomes remain unresolved. A changed verified outcome must be manually adjudicated, never rewritten.
5. Independent scheduled workflow: .github/workflows/remaining_run_market_v3_shadow.yml. Planned daily at 12:00 UTC on main after the 06:00 UTC AMC scrape. On draft PR it executes a non-persisting integration test and uploads diagnostic artifacts. Legacy shadow and production Leaving Soon stay intact.

## Promotion criteria — fixed before prospective results
- At least 8 independently verified distinct theatrical weeks and 80 unique films.
- Four-class log loss at most 1.25; Thursday final-week precision among the top four at least 50% across >=8 weeks. Brier, risk calibration, same-week film ranking, and per-segment drift must also be inspected.
- Explicitly reviewed model-SHA-bound strict-label audit, paired previous-model noninferiority assessment with film-clustered uncertainty, and A-List credit-allocation replay.
- Credit replay must include A-List product/showtime eligibility, four credits with Friday 6:00 a.m. Pacific reset, Seattle theater/time restrictions, Seen/Not Interested, user interest and next-week opportunity cost. Final-week precision@4 currently measures urgency only, **not** a complete A-List recommendation outcome.
- An independently reviewed evidence file at data/models/remaining_run_shadow/market_v3_review.json with exact model SHA, reviewer/timestamp and traceable HTTPS evidence for each audit, followed by a fresh passed prospective scorecard and explicit owner approval. The scoring workflow can never promote itself.

## Activation, monitoring and rollback
Use the model SHA from the frozen artifact. After external review, activate only by manually running:
    python -m scripts.manage_market_v3_promotion --promote --approve PROMOTE_MARKET_V3 --model-sha256 EXACT_HASH --reason "Reviewed rollout"
Review and merge the resulting data/models/remaining_run_shadow/market_routing.json pointer change. The A-List export adapter will accept that exact model only if certificate hash, scorecard and current source completeness remain valid. Public data contain minimal redacted probability buckets. On degraded source, refuse publication and retain the earlier artifact until the site's freshness check suppresses it.
To roll back:
    python -m scripts.manage_market_v3_promotion --rollback --reason "Incident and evidence"
Review and merge the routing pointer restoration; audit trail and previous weights remain available. Monitor missing/late source snapshots, outdated forecasts, calibration, final-week rank, segment regressions, credit utility and model/certificate SHA integrity.

**Thursday planning:** Forecast programming weeks are Friday–Thursday. A-List resets Friday at approximately 6:00 a.m. Pacific; a scheduled Friday preview can still belong to the earlier credit cycle. Never conflate the two calendars.

## Known caveats and unfinished production tasks
- The first CI candidate was trained on **337 provisional historical rows with zero strict labels**. Do not claim this is an independently validated production model.
- CI on draft branch does not enable the scheduled main workflow or save true prospective evidence. Merge prerequisite research and shadow PRs after review and confirm persistent main runs.
- October 15–18 source-completeness gaps must remain explicit; never infer a run exit from an absent scrape. Review market selector over multiple real Thursdays.
- Need >=8 independently verified future weeks and >=80 films, independent A-List replay, paired baseline uncertainty, production observability and rollback drill before promotion.
