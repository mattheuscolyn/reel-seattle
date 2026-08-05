# TMDB Enrichment Contract (`T-ENR-01A`)

**Status:** Authoritative field/artifact contract (2026-07-28); **`T-ENR-01B` implemented**; **`T-ENR-10` Home/Opening** + **`T-ENR-20` Search** + **`T-ENR-30` Film Detail** activation complete 2026-07-28
**Activation:** Home + Opening + Search + Film Detail live (current enrichment tranche complete)
**Related:** [tmdb-enrichment-audit.md](./research/tmdb-enrichment-audit.md) · [tmdb-attribution.md](./research/tmdb-attribution.md) · [film-identity-contract.md](./film-identity-contract.md)

This contract defines what may be persisted and emitted. Public UI activation is tracked separately (`T-ENR-10`/`20`/`30`).

---

## 1. Scope

| In scope | Out of scope |
|----------|--------------|
| Confirmed `film_id` values `tmdb:<int>` | Unmatched / non-film / program entities |
| Minimal display metadata | Full TMDB dump |
| Separate enrichment artifact | Embedding into showtimes JSON |
| Server-side fetch + cache | Browser TMDB calls / secrets |

---

## 2. Artifact

**Public path:** `public/data/film_enrichment_current.json`  
**Pipeline report:** `data/audits/tmdb_enrichment_pipeline_report.json`  
**Internal audit path (01A):** `data/audits/tmdb_enrichment_coverage.json`  
**Example fixture:** `tests/fixtures/enrichment/film_enrichment_v1_example.json`  
**Generate:** `python scripts/build_film_enrichment.py` (flags: `--limit`, `--refresh-cache`, `--offline`, `--tmdb-id`)  
**Validate:** `python scripts/validate_film_enrichment.py`  
**Workflow:** `.github/workflows/film_enrichment.yml` (independent of daily showtimes; never blocks showtime publication)  
**Cache:** gitignored `data/cache/tmdb/` via existing `TmdbResponseCache`

```json
{
  "version": 1,
  "generated_at": "ISO-8601",
  "provider": "tmdb",
  "language": "en-US",
  "image_config": {
    "secure_base_url": "https://image.tmdb.org/t/p/",
    "poster_size": "w500",
    "backdrop_size": "w780"
  },
  "films": []
}
```

Films sorted by `tmdb_id` ascending. One row per canonical `tmdb_id`.

---

## 3. First-release film row

| Field | Type | Nullable | Public | Notes |
|-------|------|----------|--------|-------|
| `film_id` | string | no | yes | `tmdb:<id>` |
| `tmdb_id` | int | no | yes | Must match `film_id` |
| `imdb_id` | string | yes | yes | `tt` + 7–8 digits |
| `original_title` | string | yes | yes | |
| `display_title` | string | yes | yes | Localized `title` from TMDB `en-US` |
| `original_language` | string | yes | yes | ISO 639-1 |
| `release_date` | string | yes | yes | `YYYY-MM-DD` canonical TMDB primary date |
| `release_year` | int | yes | yes | Derived from `release_date` |
| `runtime_minutes` | int | yes | yes | TMDB standard runtime |
| `us_certification` | string | yes | yes | US cert from `release_dates` |
| `overview` | string | yes | yes | Bound length in validator (e.g. ≤ 4000) |
| `genres` | `{id,name}[]` | yes/empty | yes | Unique by name |
| `directors` | `{tmdb_person_id,name}[]` | yes/empty | yes | Unique people |
| `top_cast` | `{tmdb_person_id,name,character,order}[]` | yes/empty | optional | Max 5; may ship empty in 01B |
| `poster` | `{path,url}` | yes | yes | Prefer store `path`; resolve `url` at emit or client |
| `backdrop` | `{path,url}` | yes | yes | Same |
| `provenance` | object | no | yes | `provider`, `fetched_at`, `language` |
| `field_provenance` | object | yes | yes | Per-field `tmdb` / `unavailable` (presentation may add theater fallbacks) |

**Not in first release:** tagline, vote_average, popularity, trailers, keywords, watch providers, writers, full crew.

---

## 4. Precedence

Canonical film-level precedence (see [canonical-film-contract.md](./canonical-film-contract.md)):

1. Manual reviewed override
2. TMDB enrichment
3. Theater-source fallback
4. Honest unavailable

| Concern | Authority |
|---------|-----------|
| Planner gap timing / schedule runtime | Source/showtime `runtime_min` |
| Film Detail / entity runtime | TMDB `runtime_minutes`, else source |
| US certification | TMDB `us_certification`, else omit |
| Opportunity/card title | Source title + presentation |
| Entity/canonical title | Enrichment `display_title` / `original_title` |
| Canonical year | Enrichment `release_year` |
| Event/fest/anniversary year | Opportunity / identity year interpretation — never overwritten |
| Poster / backdrop | TMDB first; theater source fills gaps |
| Synopsis / genres / directors (public) | TMDB enrichment (AMC uncleared) |

Discrepancy logging (runtime delta > 25 minutes) is optional telemetry; do not block emit.

---

## 5. Images

- Persist TMDB **paths** (`/…jpg`), not a committed binary corpus.  
- Resolve via `/configuration` `secure_base_url` + size (`w500` poster, `w780` backdrop).  
- Hotlink TMDB image CDN unless PO later requires mirroring.  
- Missing image → consumer suppresses (no fixture art).  
- Attribution required wherever TMDB images/metadata appear ([terms](https://www.themoviedb.org/api-terms-of-use)).

---

## 6. Credits

- First release: **directors only** (multi-director arrays allowed).  
- `top_cast` capped at 5, no profile photos.  
- Full credits remain unfetched for public artifact.  
- Person search is out of scope.

---

## 7. Ratings / popularity

**Do not emit** TMDB `vote_average`, `vote_count`, `popularity`, or trending in v1.  
Film Detail rating slot stays suppressed until a deliberate ratings provider decision (possibly Letterboxd later).

---

## 8. Refresh policy

| Category | Cadence |
|----------|---------|
| IMDb id, original title/language, release_date | Rare / on identity change |
| overview, genres, directors, poster/backdrop | Refresh ≤ **90 days**; hard max cache **6 months** per TMDB terms |
| New confirmed identities | Fetch within daily pipeline after match |
| Failure | Retain last-good enrichment row; report partial errors |
| Identity correction | Rebuild/replace row for new `tmdb_id`; drop stale |

Never block `showtimes_current.json` publication on enrichment failure.

---

## 9. Program / non-feature behavior

- No enrichment rows for non-`tmdb` identities.  
- Consumers must tolerate missing enrichment (already true in v2 suppressors).  
- Do not invent feature metadata for shorts programs / mystery / live events.

---

## 10. Consumer mapping (activation later)

| Field | Home | Search | Film Detail | Opening | Planner |
|-------|------|--------|-------------|---------|---------|
| year | expand | meta | hero | row | no |
| genres | expand | meta | hero | row | no |
| overview | no | expand | synopsis | expand | no |
| directors | no | future | credits | no | no |
| poster | cards | results | hero | rows | sheet |
| backdrop | optional hero | no | hero | no | no |
| imdb_id | no | no | link | no | no |

Activation tasks: `T-ENR-10` (Home/Opening — complete), `T-ENR-20` (Search — complete), `T-ENR-30` (Film Detail — complete).

---

## 11. Validation (01B)

Require: version, generated_at, unique `tmdb_id`, matching `film_id`, ISO dates, image path shape, unique genres/directors, provenance, no secrets, deterministic sort, no source-fallback rows.

Implemented by `reel_seattle.enrichment.validate.validate_film_enrichment_document`, schema `schema/film_enrichment/film_enrichment_current/v1.0.0.json`, and `scripts/validate_public_data_artifacts.py` (artifact required).

---

## 12. Attribution

See [tmdb-attribution.md](./research/tmdb-attribution.md). Public use requires logo + disclaimer; API keys remain server-side only.

**PO/legal:** confirm non-commercial vs commercial TMDB terms for production Pages hosting before broad traffic.
