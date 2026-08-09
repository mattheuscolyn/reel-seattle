# TMDB Enrichment Audit (`T-ENR-01A`)

**Date:** 2026-07-28  
**Status:** Complete (gate for `T-ENR-01B`); **`T-ENR-01B` shipped 2026-07-28**  
**Related:** [tmdb-enrichment-contract.md](../tmdb-enrichment-contract.md) · [tmdb-attribution.md](./tmdb-attribution.md) · [amc-enrichment-audit.md](./amc-enrichment-audit.md) · [film-identity-contract.md](../film-identity-contract.md)

## Executive summary

Reel Seattle needs a **small, policy-safe TMDB enrichment artifact** for confirmed `tmdb:<id>` films only. Public showtimes stay source-owned. AMC catalog republish remains **uncleared**, so TMDB is the preferred first enrichment provider for display metadata.

**Recommend first-release fields:** overview, genres, directors, IMDb id, poster path, backdrop path, original/display title, canonical release date/year.  
**Defer:** vote/popularity/trending, watch providers, full cast/crew, trailers, keywords, collections, budget/revenue, writers/cinematographer/composer (unless a later FD slot requires them).  
**Artifact:** separate public `film_enrichment_current.json` (not embedded in showtimes).  
**UI activation:** `T-ENR-10` (Home/Opening) + `T-ENR-20` (Search) + `T-ENR-30` (Film Detail) complete.

---

## Product metadata needs

| Need | Surfaces (approved slots) | Today |
|------|---------------------------|--------|
| Year | Home expand, Opening, Search, Film Detail | Suppressed / null |
| Genres | Home expand, Opening, Search, FD | Suppressed |
| Synopsis | Home expand, Search expand, FD | Suppressed |
| Director | FD credits line; future search | Suppressed |
| Poster | Cards/rows/hero | Source `poster_url` when present |
| Backdrop | FD / Home hero atmosphere | Null |
| Rating | FD rating slot | Null — **keep suppressed** (TMDB votes deferred) |
| External link | FD future | None |

Opportunity facts (theater, showtime, format, Q&A, fest edition, ticket URL) remain **source-owned** and must not be overwritten by TMDB.

---

## TMDB endpoints audited (official docs)

| Endpoint | Use |
|----------|-----|
| `GET /movie/{id}` | Core metadata |
| `append_to_response=credits,external_ids` | Directors, top cast, IMDb id |
| `GET /configuration` | Image `secure_base_url` + sizes (store config separately or resolve at emit time) |
| `GET /movie/{id}/release_dates` | Deferred (US certification later) |
| `GET /movie/{id}/videos` | Deferred |
| `GET /movie/{id}/keywords` | Deferred |

Official references:

- [Getting started](https://developer.themoviedb.org/docs/getting-started)
- [Append to response](https://developer.themoviedb.org/docs/append-to-response)
- [Movie details](https://developer.themoviedb.org/reference/movie-details)
- [Image basics](https://developer.themoviedb.org/docs/image-basics)
- [API Terms of Use](https://www.themoviedb.org/api-terms-of-use)

---

## Field-by-field recommendation

| Field | Decision | Why |
|-------|----------|-----|
| `tmdb_id` / `film_id` | **Include** | Identity join |
| `imdb_id` | **Include** | External link / future |
| `display_title` / `original_title` | **Include** | Entity label; keep source title on opportunity |
| `release_date` / `release_year` | **Include** | Canonical year for FD/Search |
| `overview` | **Include** | Synopsis slots |
| `genres[]` | **Include** | Taxonomy chips |
| `directors[]` | **Include** | FD credits |
| `poster.path` | **Include** | Fallback when source poster missing |
| `backdrop.path` | **Include** | FD/Home hero (activate later) |
| `top_cast[]` (≤5) | **Optional v1** | Only if FD cast line ships; else defer to 01B+ |
| `runtime` (TMDB) | **Internal/display fallback only** | Planner uses source runtime |
| `tagline` | **Defer** | No approved slot |
| `vote_average` / `popularity` | **Omit/defer** | Volatile; FD rating stays suppressed |
| Writers / DP / composer | **Defer** | No current consumer |
| Full cast/crew | **Omit** | Payload + no need |
| Watch providers | **Omit** | Policy/product risk |
| Trailers | **Defer** | Optional later |
| Keywords / collections | **Defer** | Thematic tags are curated separately |
| Budget / revenue | **Omit** | Not decision-relevant |
| Adult / homepage | Store adult for safety filters only; homepage defer | |

---

## Existing-source comparison

| Fact | Source / AMC | TMDB | Precedence |
|------|--------------|------|------------|
| Schedule runtime | showtimes / AMC | movie.runtime | **Source for planner**; TMDB display fallback |
| Opportunity title | source_title | display_title | **Source on cards/showtimes**; TMDB for entity |
| Event/fest year | presentation / inventory | — | **Opportunity only** |
| Canonical year | derived / identity | release_date | **TMDB** when confirmed |
| Poster | source poster_url | poster_path | Prefer source if present; else TMDB |
| Synopsis | AMC catalog (uncleared) | overview | **TMDB** for public until AMC cleared |
| Genres | AMC (uncleared) | genres | **TMDB** for public |
| Directors | AMC directors_raw (uncleared) | credits | **TMDB** for public |

---

## Canonical vs opportunity

```text
Canonical (enrichment): Only Yesterday (1991) — overview, genres, directors, images
Opportunity (showtimes): Only Yesterday 35th Anniversary - Studio Ghibli Fest 2026 @ theater/time/format
```

---

## Programs / non-features

- Enrichment **only** for confirmed `tmdb:` identities.  
- `source:` / `source-key:` / `non_film` entities: **no forced enrichment**.  
- Public consumers already suppress missing fields.  
- Future curated program metadata is out of scope.

---

## Artifact architecture (decision)

**Emit separate** `public/data/film_enrichment_current.json` (in `T-ENR-01B`):

- Keeps showtimes thin and cadence-independent  
- Partial enrichment failure cannot block showtimes  
- Attribution scoped to enrichment consumers  
- Provider-swappable later  

Do **not** embed into `showtimes_current.json` or the identity catalog for public Pages.

Internal durable cache may remain under `data/cache/tmdb/` (gitignored).

---

## Coverage methodology

```text
python scripts/audit_tmdb_enrichment.py
python scripts/audit_tmdb_enrichment.py --limit 5
python scripts/audit_tmdb_enrichment.py --dry-run-identities-only
```

Uses unique confirmed `tmdb_id` values from `film_identity_catalog.json`. Writes `data/audits/tmdb_enrichment_coverage.json` (audit-only).

---

## Live coverage results

**Executed 2026-07-28** (`python scripts/audit_tmdb_enrichment.py`, bearer auth, `live_run=true`).

Unique confirmed TMDB films: **65** (deduped `tmdb_id` from catalog manual+automatic).

| Field | Present | Rate |
|-------|---------|------|
| overview | 65/65 | 100% |
| genres | 64/65 | 98.5% |
| runtime | 64/65 | 98.5% |
| directors | 64/65 | 98.5% |
| imdb_id | 65/65 | 100% |
| poster_path | 65/65 | 100% |
| backdrop_path | 62/65 | 95.4% |
| top_cast | 61/65 | 93.8% |
| original_title | 65/65 | 100% |
| release_date | 64/65 | 98.5% |
| display_title | 65/65 | 100% |
| tagline | 49/65 | 75.4% (deferred) |
| vote_average / popularity | 65/65 | available but **not recommended** for emit |

Artifact: [`data/audits/tmdb_enrichment_coverage.json`](../../data/audits/tmdb_enrichment_coverage.json).

---

## Risks

- TMDB terms: attribution required; **cache ≤ 6 months**; purge on termination.  
- Commercial use may require written agreement — **PO/legal flag**.  
- AMC terms still uncleared — do not mix uncleared AMC text into public enrich without clearance.  
- Image hotlinking vs mirror — prefer TMDB CDN URLs resolved from stored paths + configuration.  
- Manual identity corrections must re-key enrichment rows.

---

## Next task

**`T-ENR-01B` complete (2026-07-28).** Public artifact + schema/validate/workflow shipped.

**Next:** Enrichment UI tranche + store migration complete for planned consumers. Remaining related work: AMC terms gate, theater curation, optional deeper fields.
