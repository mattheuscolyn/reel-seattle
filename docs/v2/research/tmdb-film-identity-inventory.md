# TMDB Film Identity — Source Input Inventory

**Status:** Living source-metadata audit guidance (2026-09-29)  
**Authority:** Pre-scoring inventory only — never invent unavailable source fields  
**Contract:** [film-identity-contract.md](../film-identity-contract.md)

The generated audit is `data/audits/film_identity_source_inventory.json`. Rebuild it from the current public showtime artifact with:

```bash
python scripts/inventory_film_identities.py
python scripts/inventory_film_identities.py --stdout
```

Do not rely on hard-coded source counts in this document. The audit is intentionally tied to the current `showtimes_current.json` window.

---

## 1. Metadata fields and what they mean

| Audit field | Meaning |
|---|---|
| `with_source_title` | Exact source/API title is present. This is provenance and should be effectively universal. |
| `with_identity_title` | The adapter supplied a proven cleaned identity title separate from the exact source title. Absence is normal when the source title is already clean. |
| `with_runtime` | A usable film/program runtime is available from the source-side pipeline. |
| `with_source_release_year` | Release-year evidence came from the listing source or its durable source catalog. Screening dates, scrape dates, and page-created dates never count. |
| `with_match_year` | The matcher has a usable year hint after source year, trusted title-year, anniversary, or product-year interpretation. This can be higher than `with_source_release_year`. |
| `with_program_series` | A source-backed programming-series label was separated from the film title. |
| `with_component_titles` | A multi-film program explicitly names component films. These are source-declared titles, not canonical component IDs. |
| `eligible_missing_runtime` | Movie-like identities still missing runtime evidence. |
| `eligible_missing_source_release_year` | Movie-like identities for which the source did not provide a release year. This is an evidence gap, not an error by itself. |

The legacy `with_year` counter remains as a compatibility alias for `with_match_year`.

---

## 2. Source-side expectations

| Source | Title | Runtime | Source release year | Notes |
|---|---|---|---|---|
| AMC | Yes | Yes | Usually via AMC durable product catalog | Product/rerelease years can be weak evidence and are interpreted conservatively. |
| SIFF | Yes | Usually | When SIFF's dedicated metadata row exposes it | Nested program URLs can also provide series identity. |
| Beacon | Yes | Usually | Usually | Current adapter also repairs observed UTF-8 mojibake before identity matching. |
| NWFF | Yes | Yes | Often | Shorts/festival/composite programs may intentionally have no single film year. |
| Central Cinema | Yes | Yes | Only when schema metadata exposes a true `copyrightYear` | `dateCreated` is explicitly **not** a film release year. |
| Grand Illusion | Yes | Yes | Often | Multi-film packages may expose multiple years; these must not be collapsed to one canonical year. |
| Tasveer | Yes | Yes | When Tasveer's title metadata includes a year | Country/language/year decorations are parsed source-specifically. |
| Anderson School | Yes | Yes | Not currently exposed by the public theater listing | Missing source year remains missing; do not substitute a screening date. |
| STG | Yes for qualified film events | When exposed | When exposed / encoded in qualified event title | Film qualification is intentionally conservative. |
| Majestic Bay | Yes | Yes | Not currently exposed by the public Veezi sessions listing | Missing source year remains missing; do not substitute a screening date. |

---

## 3. Matcher input strategy

1. Exact / source-proven normalized title.
2. Trusted source-side or title-derived year when available.
3. Runtime proximity.
4. Director overlap when a durable source catalog supplies it.
5. External ID exact match when available.
6. Popularity only as a tie-break.

Missing evidence is neutral. An unavailable source year must never be converted into a conflict or replaced with a screening/calendar year.

Multi-feature, shorts, mystery, live/broadcast, and other program entities are classified before TMDB movie matching. When a package explicitly names component films, `component_titles` may be retained for diagnostics without implying component TMDB matches.

---

## 4. Suppression safety

**`unmatched` is not a synonym for `non_film`.**

A legitimate new, local, repertory, or obscure feature may be missing from TMDB or may lack enough evidence for an automatic match. Film-only surfaces may safely treat explicitly classified `non_film` program entities differently, but unmatched/review-required/deferred/error identities remain unresolved movie-like evidence unless a separate source-backed classification says otherwise.

The per-source audit should therefore be read alongside `data/audits/tmdb_film_identity_coverage.json`. The goal is to drive unresolved movie-like identities down through better source evidence and reviewed rules — not to re-label every failed TMDB lookup as an event.
