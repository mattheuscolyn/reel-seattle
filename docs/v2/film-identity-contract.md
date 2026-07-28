# Film Identity Contract (`T-FILMID-01`)

**Status:** Authoritative Stage 4 identity contract (2026-07-27)  
**Workstream:** WS-FILMID · Gap G02  
**Packet:** `T-FILMID-01` (foundation) — public enrichment activation remains deferred (`T-ENR-01` / later)

**Related:** [film-identity-normalization.md](../film-identity-normalization.md) · [data-foundation-roadmap.md](../data-foundation-roadmap.md) · [v2-front-back-integration-roadmap.md](./v2-front-back-integration-roadmap.md) · [tmdb-film-identity-inventory.md](./research/tmdb-film-identity-inventory.md) · [tmdb-attribution.md](./research/tmdb-attribution.md)

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
| `RUNTIME_PROXIMITY_MAX_MIN` | `8` | Soft runtime proximity (minutes) |

**Auto-confirm rationale:** False merges are worse than temporary source fallbacks. Require strong title corroboration plus year **or** exact external ID; popularity may break ties only and never override title/year/runtime conflicts or remake ambiguity.

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

## 9. Local store migration boundary

Saved / Seen / Not Interested already accept optional `filmId` but still require `showtimeFilmKey` in v1.

**This packet does not migrate user data.** Follow-on `T-FILMID-03` proposes alias rows:

```json
{
  "legacy_ref": { "showtimeFilmKey": "moana", "source": "amc", "sourceFilmId": "72474" },
  "canonical_film_id": "tmdb:277355",
  "source_fallback_id": "source:amc:72474"
}
```

Requirements for that follow-on: idempotent; report conflicts; keep rejected/unmatched on fallback; never silently discard.

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
| `T-FILMID-01` (this) | Contract, inventory, schemas, decisions, matcher, review queue, cockpit review |
| `T-FILMID-02` | Public artifact nullable identity emission + consumer tolerance |
| `T-FILMID-03` | Local-store alias migration |
| `T-ENR-01` | Selected enrichment fields + UI reactivation (with attribution) |

---

## 12. Explicit non-goals (this packet)

- Broad TMDB metadata in Home / Search / Film Detail  
- Replacing `showtime_film_key` as schedule join  
- Destructive Saved/Seen/NI migration  
- Forcing programs into fake TMDB matches  
