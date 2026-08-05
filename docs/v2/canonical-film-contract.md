# Canonical film contract

**Status:** Authoritative product contract (2026-08-04)  
**Related:** [film-identity-contract.md](./film-identity-contract.md) · [tmdb-enrichment-contract.md](./tmdb-enrichment-contract.md) · [specs/film-detail.md](./specs/film-detail.md)

TMDB is the canonical source for film-level identity and presentation metadata.
Theater sources remain authoritative for individual screenings and are the
fallback when TMDB is unmatched or a field is unavailable.

---

## 1. Canonical film object (product shape)

| Field | Type | Notes |
|-------|------|-------|
| `canonicalFilmKey` | string | Public `film_id`: `tmdb:<id>` when matched; otherwise null on public showtimes (schedule join stays `showtime_film_key`) |
| `tmdbId` | int \| null | Numeric TMDB movie id when matched |
| `canonicalTitle` | string \| null | Enrichment `display_title` / `original_title` |
| `originalTitle` | string \| null | TMDB original title |
| `releaseDate` | `YYYY-MM-DD` \| null | TMDB primary release date |
| `releaseYear` | int \| null | Derived from `releaseDate` |
| `runtimeMinutes` | int \| null | Canonical standard-cut runtime |
| `usCertification` | string \| null | US certification from TMDB release dates (e.g. `PG-13`) |
| `genres` | `{id,name}[]` | TMDB genres |
| `overview` | string \| null | Synopsis |
| `posterUrl` | string \| null | Resolved CDN URL |
| `backdropUrl` | string \| null | Resolved CDN URL |
| `director` | string \| null | Formatted director line |
| `topCast` | array | Optional; capped (already used when present) |
| `sourceFilmKeys` | string[] | Alias inventory: source ids, showtime keys, prior keys |
| `titleAliases` | string[] | Observed source titles / normalized aliases |
| `matchStatus` | enum | See film-identity contract |
| `matchConfidence` | number \| null | Matcher score when automatic |
| `metadataProvenance` | object | Per-field or compact field→source map |

Do not add TMDB-only fields that Film Detail does not need.

---

## 2. Provenance values

Each displayed film-level field should be explainable as one of:

| Value | Meaning |
|-------|---------|
| `tmdb` | Taken from enrichment artifact |
| `theater_source` | Taken from showtimes / source catalog |
| `manual_override` | Explicit reviewed decision or override file |
| `derived` | Computed (e.g. year from date, parent title strip) |
| `unavailable` | Honestly omitted |

UI does not need to show provenance; diagnostics and audits must.

Compact enrichment provenance retains `provider` / `fetched_at` / `language`.
Field-level provenance is assembled at presentation time from join rules below.

---

## 3. Field precedence

### Film-level metadata

1. Manual reviewed override (when explicitly configured)
2. TMDB enrichment
3. Normalized theater-source fallback
4. Honest unavailable

Applies to: canonical title, release date/year, certification, genres, synopsis,
poster, backdrop, director.

### Runtime

1. TMDB runtime for the canonical standard film
2. Theater film runtime as fallback
3. Per-screening source runtime only when that screening clearly represents a
   different cut/event (showtime-scoped; never silently replace canonical
   runtime for every screening)

### Screening-level metadata (theater authority)

Showtime, theater, auditorium, ticket URL, format, accessibility, sensory-
friendly, open captions, dubbed/subtitled, fan event, sing-along, anniversary
event, premium format, special-event labels, ticket availability.

These must not become part of the canonical film title or identity.

---

## 4. Identity model

| Layer | Key | Role |
|-------|-----|------|
| Canonical film | `tmdb:<id>` | Preferred shared identity |
| Schedule join | `showtime_film_key` | Performance grouping |
| Parent presentation | `parent_film_key` | Special screening → parent work |
| Source alias | `source:<source>:<id>` / `source-key:…` | Inventory + decisions |

Special screenings (e.g. Sensory Friendly) share the parent canonical film and
appear as showtime-row metadata, not as a separate Film Detail title.

---

## 5. Public artifacts

| Artifact | Role |
|----------|------|
| `public/data/showtimes_current.json` | Showtimes + nullable `film_id` |
| `public/data/film_enrichment_current.json` | Canonical TMDB presentation rows |
| `data/film_identity/film_identity_catalog.json` | Match status + aliases |
| `data/film_identity/tmdb_match_decisions.json` | Durable manual decisions |
| `data/film_identity/tmdb_match_review_queue.json` | Ambiguous / unmatched review |

Browser never calls TMDB. Token stays server-side / pipeline-only.
