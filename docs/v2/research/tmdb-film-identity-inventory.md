# TMDB Film Identity — Source Input Inventory (`T-FILMID-01`)

**Status:** Repository-grounded coverage inventory (2026-07-27)  
**Authority:** Pre-scoring inventory only — does not invent unavailable fields  
**Contract:** [film-identity-contract.md](../film-identity-contract.md)

Snapshot basis: `public/data/showtimes_current.json` + `data/source_catalog/amc_movie_products.json` (local committed artifacts).

---

## 1. Unique source identities (current window)

| Source | Unique identities | With `source_film_id` | With `source_title` | Runtime on film row |
|--------|------------------:|----------------------:|--------------------:|--------------------:|
| amc | 41 | 41 | 41 | 41 |
| siff | 20 | 20 | 20 | 20 |
| beacon | 16 | 16 | 16 | 1 |
| central_cinema | 14 | 14 | 14 | 14 |
| nwff | 10 | 10 | 10 | 10 |
| **Total** | **101** | **101** | **101** | — |

Identity key used for counting: `(source, source_film_id, showtime_film_key)`.

All current-window showtimes in this snapshot carry a non-null `source_film_id`. Fallback `source-key:` should be rare for live Seattle sources today, but remains required for robustness.

---

## 2. Field availability by source

| Input | AMC showtimes | AMC catalog | SIFF | Beacon | NWFF | Central |
|-------|---------------|-------------|------|--------|------|---------|
| Exact source title | Yes (`source_title`) | Yes (`source_title`) | Yes | Yes | Yes | Yes |
| Normalized / parent title | Derived (Identity-C) | Sortable title | Derived | Derived | Derived | Derived |
| Year in title | Sometimes | Rare | Sometimes | Sometimes | Sometimes | Sometimes |
| Release date / year | No on showtime | Yes (`release_date_utc`) | No | No | No | No |
| Runtime | Via `films[].runtime_min` | Yes | Via film | Sparse | Via film | Via film |
| IMDb / external IDs | No | **Not persisted** in durable catalog | No | No | No | No |
| Directors | No | Yes (`directors_raw`) | No | No | No | No |
| Cast | No | Partial (`starring_actors_raw`) | No | No | No | No |
| Original title | No | No | No | No | No | No |
| Program/event flags | Partial (variant / special) | Weak (title / attrs) | Title patterns | Title patterns | Title patterns | Title patterns |
| Parent/variant grouping | Yes (emit) | N/A | Yes | Yes | Yes | Yes |

**Do not pretend:** indie sources have release year, directors, cast, or IMDb in public/history artifacts. Matcher scoring must treat those signals as unavailable unless supplied by AMC catalog join or future enrichment.

---

## 3. AMC catalog join

- Join key: `source_film_id` (API `movieId`, stored as string).  
- Enrichment audit historically: **41/41** current AMC IDs join to catalog products.  
- Catalog does **not** currently persist `imdbId` even if the live Movies API exposes it — external-ID exact match is therefore **unavailable** from durable artifacts until a catalog schema extension (separate task).

---

## 4. Matcher input strategy (honest)

| Priority | Signal | When used |
|----------|--------|-----------|
| 1 | Exact / normalized title | Always when title present |
| 2 | Trusted year (catalog release year or unambiguous title year) | AMC catalog year preferred; title year only when trustworthy |
| 3 | Runtime proximity | When both sides have runtime |
| 4 | Directors overlap | AMC catalog only |
| 5 | External ID exact | Only if future catalog/extension provides it |
| 6 | Popularity | Tie-break only |

Hard conflicts (title conflict, year conflict, runtime conflict, adult/non-movie mismatch, program indicators) block auto-confirm.

---

## 5. Non-film / program risk examples (current window)

Titles such as AMC Screen Unseen, festival shorts blocks, NT Live-style events, and double-feature wordings must route through eligibility → `non_film` / `unmatched` rather than forced TMDB confirms.
