# Film Identity Contract (`T-FILMID-01`)

**Status:** Authoritative Stage 4 identity contract (2026-07-27); public enrichment + Film Detail activation live under [canonical-film-contract.md](./canonical-film-contract.md) / [tmdb-enrichment-contract.md](./tmdb-enrichment-contract.md) (2026-08-04)  
**Workstream:** WS-FILMID · Gap G02  
**Packet:** `T-FILMID-01` (foundation) + `T-FILMID-02` public `film_id` emit + enrichment consumers

**Related:** [canonical-film-contract.md](./canonical-film-contract.md) · [film-identity-normalization.md](../film-identity-normalization.md) · [data-foundation-roadmap.md](../data-foundation-roadmap.md) · [v2-front-back-integration-roadmap.md](./v2-front-back-integration-roadmap.md) · [tmdb-film-identity-inventory.md](./research/tmdb-film-identity-inventory.md) · [tmdb-attribution.md](./research/tmdb-attribution.md)

---

## 1. Why a namespaced `film_id`

Reel Seattle must never treat a bare integer as a generic film key. Namespaces make identity type explicit in every consumer, log, and store:

| Form | Meaning |
|------|---------|
| `tmdb:<positive-int>` | Accepted TMDB movie identity (preferred) |
| `source:<source>:<source_film_id>` | Deterministic fallback when no accepted TMDB match |
| `source-key:<source>:<showtime_film_key>` | Fallback when a stable source film ID is unavailable |

Schedule joins continue to use **`showtime_film_key`**. Canonical `film_id` is parallel identity, not a replacement join key.

Numeric `tmdb_id` is stored separately when `identity_type` is `tmdb`.

---

## 2. Identity layers (do not collapse)

1. **Canonical film** — conceptual movie; preferably TMDB.  
2. **Source identity** — source-owned film/product/program ID (`source` + `source_film_id`).  
3. **Source presentation / release variant** — re-release, restoration, sensory, premium format, Q&A, festival presentation, etc.  
4. **Performance** — theater + date + time.

Presentation and performance differences must not invent separate canonical films. Parent/variant fields from Identity-C remain presentation metadata.

---

## 3. TMDB preference (not mandatory)

- Preferred accepted identity: **`tmdb:<id>`**.  
- TMDB is used for **identity matching** first.  
- Broad public metadata enrichment is a **separate stage** (`T-ENR-01`+).  
- Festivals, shorts programs, mystery screenings, double features, live events, and other non-film programs must **not** be forced into TMDB movie IDs.  
- Unmatched / deferred / non-film items remain usable via source fallback.

---

## 4. Match states

| State | Meaning |
|-------|---------|
| `confirmed_manual` | Human confirmed TMDB (or revised) |
| `confirmed_automatic` | High-confidence auto-confirm |
| `review_required` | Ambiguous candidates — actionable queue |
| `unmatched` | No acceptable candidate; source fallback |
| `rejected` | Candidate rejected; do not re-propose unless inputs/rules change |
| `non_film` | Intentionally not a TMDB movie |
| `deferred` | Human deferred |
| `error` | Matcher/API failure for this identity |

Do not overload a single nullable `tmdb_id`.

---

## 5. Manual decisions (authored)

Artifact: `data/film_identity/tmdb_match_decisions.json`

| Decision | Effect |
|----------|--------|
| `confirm` | Bind source identity → `tmdb_id`; state `confirmed_manual` |
| `reject_candidate` | Reject a specific `tmdb_id`; keep reviewing or fall back |
| `unmapped` | Leave unmatched with source fallback (not non-film) |
| `non_film` | Mark non-film/program; no TMDB movie identity |
| `defer` | Keep deferred until revisited |

**Precedence:** explicit manual decisions override automatic matching.  
`non_film` ≠ `unmapped` ≠ `reject_candidate`.  
Schema allows remapping with provenance; stable ordering for clean diffs.

---

## 6. Confidence thresholds

Named constants in `reel_seattle/film_identity/constants.py`:

| Constant | Default | Role |
|----------|--------:|------|
| `AUTO_CONFIRM_MIN_SCORE` | `0.92` | Auto-confirm only when score ≥ this **and** no hard conflict |
| `REVIEW_MIN_SCORE` | `0.55` | Below → unmatched; ≥ → review_required unless auto-confirm |
| `YEAR_PROXIMITY_MAX` | `1` | Soft year proximity window (years) |
| `RUNTIME_COMPATIBLE_MAX_MIN` | `3` | Full runtime credit (0–3 minute delta) |
| `RUNTIME_SOFT_MAX_MIN` | `12` | Soft gradual runtime penalty band |
| `RUNTIME_CONFLICT_MIN` | `25` | Hard runtime conflict |
| `RUNTIME_PROXIMITY_MAX_MIN` | `3` | Alias of compatible band (backward compatible) |

**Year evidence (do not invent calendar/screening years):**

| Case | Behavior |
|------|----------|
| Missing source year | Absent evidence — omit year from TMDB search params; do not penalize like a conflict |
| Compatible year | Exact or ≤`YEAR_PROXIMITY_MAX` supports corroboration / auto-confirm |
| Incompatible year | Meaningful conflict warning; blocks auto-confirm |
| Uncertain rerelease/restoration year | Event year neutralized; treated as unavailable for hard conflict, not invented |

Missing year + multiple same-title TMDB hits → review (ambiguity). Missing year + exact title + compatible runtime with no competing remake → may auto-confirm.

**Search-title preparation precedence:**

1. Exact reviewed aliases — `data/film_identity/title_search_aliases.json`
2. Registered program-series prefixes — `data/film_identity/program_series_prefixes.json` (prefer source-scoped)
3. Recognized complete event suffixes (Fan Event / Early Access / bonus performance phrases)
4. Format / accessibility / anniversary presentation stripping
5. Normalized source-title fallback

Original source titles remain for display, tickets, and cockpit diagnostics.

**Auto-confirm rationale:** False merges are worse than temporary source fallbacks. Require strong title corroboration plus year, compatible runtime (when year absent), **or** exact external ID; popularity may break ties only and never override title/year/runtime conflicts or remake ambiguity.

**Review rationale:** Mid-confidence candidates need a human in the cockpit queue.

---

## 7. Eligibility (movie-like vs program)

Eligible for TMDB movie search when the title/context does **not** indicate:

- mystery / unannounced screenings (e.g. Screen Unseen)  
- shorts blocks / festivals as programs  
- double features (as a unit)  
- live events / NT Live / concerts / sports  
- clearly non-film programs  

Repertory, restorations, and re-releases remain eligible (presentation layer separate).

Festival-branded **feature** titles (e.g. Studio Ghibli Fest anniversary presentations) stay eligible; shorts festivals / mystery / double features / live events remain program entities with stable source fallbacks (not forced into TMDB). See [tmdb-matcher-calibration.md](./research/tmdb-matcher-calibration.md) (`T-FILMID-01E`).

---

## 7b. Scoring principles (`T-FILMID-01E`)

- Score = matched evidence weight / **available** evidence weight (missing signals are neutral).
- Event/presentation years are separated from canonical year candidates; anniversary arithmetic is supporting evidence only.
- Same-title remakes require year/external (or strong runtime+director) corroboration before auto-confirm.
- Thresholds remain `AUTO_CONFIRM_MIN_SCORE = 0.92` and `REVIEW_MIN_SCORE = 0.55` unless a later calibration changes them with evidence.
- Authored decisions always win over automatic scoring.

---

## 8. Generated artifacts (internal)

| Path | Role |
|------|------|
| `data/film_identity/tmdb_match_decisions.json` | Authored decisions (committed) |
| `data/film_identity/film_identity_catalog.json` | Generated catalog |
| `data/film_identity/tmdb_match_review_queue.json` | Actionable review queue |
| `data/audits/tmdb_film_identity_coverage.json` | Coverage report |

Do **not** emit full TMDB enrichment publicly in this packet.

TMDB HTTP cache: `data/cache/tmdb/` (**gitignored** — local reproducibility via live/mocked runs; not committed).

**Live matching workflow (`T-FILMID-01D`):** manual GitHub Actions workflow `Film Identity — Live TMDB Match` runs the live matcher with repository secrets, uploads a review package (`artifact-only` default), and can optionally open a PR (`create-pr`). Authored decisions are never modified by the matcher. See [film-identity-commands.md](./film-identity-commands.md).

---

## 9. Local store migration (`T-FILMID-03` — complete 2026-07-28)

Saved / Seen / Not Interested use store contract **v2**:

- Preferred identity: valid canonical `filmId` (`tmdb:<positive-int>`)
- Fallback: `showtimeFilmKey` (+ optional `aliasKeys` after merges)
- Storage keys unchanged (`reel-seattle.v2.savedFilms` / `seenFilms` / `dismissedFilms`)
- Eager: v1→v2 on read (validate filmIds, collapse duplicates)
- Lazy: `reconcileUserFilmStores(localStorage, homeData)` after Home load upgrades legacy keys when live films carry `filmId`
- Merge: earliest `savedAt` / `seenAt` / `markedAt`; union alias keys; no cross-store transitions
- Null `filmId` programs remain valid on showtime keys alone
- Invalid / raw TMDB integers rejected

Identity corrections later can still match via retained `showtimeFilmKey` / `aliasKeys`. No cloud sync in this task.

---

## 10. Security

- Prefer `TMDB_READ_ACCESS_TOKEN` (`Authorization: Bearer …`).  
- Fallback: `TMDB_API_KEY` query param for environments without bearer.  
- Never expose secrets in public artifacts, logs, tests, browser bundles, or cockpit responses.  
- No TMDB calls from the public v2 SPA.  
- Cockpit write/proxy endpoints are localhost-only.

---

## 11. Follow-on tasks

| ID | Scope |
|----|--------|
| `T-FILMID-01` | Contract, inventory, schemas, decisions, matcher, review queue, cockpit review |
| `T-FILMID-02` (**complete 2026-07-28**) | Public nullable `film_id` on `showtimes_current.json` films[]; HomeData `filmId` tolerance |
| `T-FILMID-03` | Local-store alias migration (**complete 2026-07-28**) |
| `T-ENR-01B` | Enrichment artifact (complete) |
| `T-ENR-10` | Home/Opening enrichment UI activation (**unblocked** by 02) |

### Public emission semantics (`T-FILMID-02`)

| Case | Public `film_id` |
|------|------------------|
| Confirmed TMDB (manual or automatic) | `tmdb:<positive-int>` |
| Unmatched / rejected / deferred / non-film / source fallback | `null` |
| Mapping collision across sources on one film key | `null` + emit warning |

**Source of truth:** `data/film_identity/film_identity_catalog.json`  
**Mapping key:** `source_identity_key` → `{source}\|id\|{source_film_id}` (else `{source}\|key\|{showtime_film_key}`)  
**Coverage audit:** `data/audits/tmdb_public_identity_emit.json`  
**Preserved keys:** `showtime_film_key`, `source_film_id` (unchanged)  
**Store migration:** **`T-FILMID-03` complete 2026-07-28** — Saved/Seen/NI v2 + Home reconcile

---

## 12. Explicit non-goals (this packet)

- Broad TMDB metadata in Home / Search / Film Detail  
- Replacing `showtime_film_key` as schedule join  
- Destructive Saved/Seen/NI migration  
- Forcing programs into fake TMDB matches  
