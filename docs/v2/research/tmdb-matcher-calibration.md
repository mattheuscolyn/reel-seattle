# TMDB Matcher Calibration (`T-FILMID-01E`)

**Date:** 2026-07-28  
**Related:** [film-identity-contract.md](../film-identity-contract.md) · [film-identity-commands.md](../film-identity-commands.md)

## Root cause (first live review)

Obvious matches often scored below ~0.60 because:

1. **Additive score with missing bonuses** — title-exact alone was `+0.45`, below `REVIEW_MIN_SCORE` (0.55), so strong title hits fell into `unmatched`.
2. **Event/presentation years treated as film years** — e.g. Ghibli Fest `2026` hard-conflicted (`−0.30`) against TMDB `1991`.
3. **`\\bfest\\b` eligibility** — festival-branded **feature** titles were classified `ambiguous_program` and never searched.

Missing runtime/director did not subtract points, but missing year also blocked auto-confirm via remake ambiguity (retained intentionally).

## Changes

| Area | Behavior |
|------|----------|
| Score | `matched_weight / available_weight` (unavailable signals omitted from denominator) |
| Year | Separate event vs canonical; anniversary arithmetic `event − N` as supporting evidence |
| Title | Unicode NFKC/diacritic fold, `&`/`and`, quotes/dashes, presentation/festival strip |
| Director | Set-based overlap; labels/initials/multi-director; missing = neutral |
| Margin | `TOP_CANDIDATE_MARGIN_MIN = 0.08` blocks auto when near-tied same-title remakes |
| Programs | Entity kinds (`shorts_program`, `double_feature`, …); stable source fallback; not forced to TMDB |
| Thresholds | **Unchanged:** auto `0.92`, review `0.55` |

## Explain tooling

```text
python scripts/explain_tmdb_match.py --title "Only Yesterday 35th Anniversary - Studio Ghibli Fest 2026"
python scripts/explain_tmdb_match.py --source amc --source-film-id 83588 --json
```

## Regression corpus

`tests/fixtures/film_identity/reviewed_cases.json` + `tests/film_identity/test_calibration_01e.py`

## Manual decisions

Authored decisions remain authoritative. Score changes do not rewrite `tmdb_match_decisions.json`.

## Remaining limitations

- Constituent shorts inside programs are not modeled.
- Description-derived program contents are not ingested yet.
- Sparse title-only hits stay in review (not auto).
- Public `film_id` emit / enrichment UI still deferred (`T-FILMID-02`, `T-ENR-01`).
