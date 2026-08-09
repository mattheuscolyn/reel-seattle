# TMDB Attribution and Policy Note

**Status:** Repository policy note (updated 2026-07-28, `T-ENR-30`)  
**Related:** [film-identity-contract.md](../film-identity-contract.md) · [tmdb-enrichment-contract.md](../tmdb-enrichment-contract.md) · [tmdb-enrichment-audit.md](./tmdb-enrichment-audit.md)

## Usage today

Reel Seattle uses The Movie Database (TMDB) API for:

1. **Internal film identity matching** (`T-FILMID-*`) — search + movie details in scripts and local cockpit proxy.  
2. **Enrichment coverage audits** (`T-ENR-01A`) — bounded live field coverage for confirmed identities.  
3. **Public enrichment artifact** (`T-ENR-01B`) — `public/data/film_enrichment_current.json` built server-side.  
4. **Home / Opening This Week UI** (`T-ENR-10`) — year, genres, synopsis, poster fallback joined by canonical `filmId`.  
5. **Search Results UI** (`T-ENR-20`) — same shared loader/index/resolver (`context: 'search'`); no second fetch path.  
6. **Film Detail UI** (`T-ENR-30`) — same shared path (`context: 'film-detail'`); year/genres/director/synopsis/poster fallback; fixture modes unchanged.

Attribution surfaces (T-ENR-10 / Home parity): primary expandable **About & data sources** from Profile → About Reel Seattle / Privacy & Data. Opening This Week collection may keep a compact notice. Home itself does **not** host a large attribution block — Profile remains the authoritative product placement so Home matches the canonical composition.

No legal approval beyond TMDB’s published API terms is claimed here.

## Official terms (summary — verify on TMDB)

Source: [TMDB API Terms of Use](https://www.themoviedb.org/api-terms-of-use)

- Attribution required: use the TMDB logo and the notice that the product uses TMDB / TMDB APIs but is **not endorsed, certified, or otherwise approved by TMDB**.  
- Do **not** cache TMDB content longer than **six months**.  
- On license termination, purge cached TMDB content.  
- Comply with TMDB’s evolving Terms of Use.  
- Commercial use may require a written agreement — **flag for PO/legal** before treating production traffic as settled.

## Where attribution should appear (when public enrichment ships)

| Placement | Required? |
|-----------|-----------|
| About / Data Sources (Profile) | Yes (primary) |
| Opening This Week collection (compact) | Optional supporting |
| Home page body | No — avoid breaking canonical Home composition |
| Footer or persistent chrome on enrichment-using surfaces | Recommended where it does not break approved layouts |
| Per-field labels | Not required if page-level attribution is clear |
| Next to TMDB images | Logo/credit per terms |

Field-level “Source: TMDB” chips are optional, not a substitute for the required notice + logo.

## Caching / storage

- Prefer gitignored response cache under `data/cache/tmdb/` for pipeline reproducibility.  
- Public enrichment artifact must be regenerable and refreshable within the 6-month bound (contract target ≤ 90 days for mutable display fields).  
- Store image **paths**; resolve URLs via TMDB image configuration / CDN. Do not commit a bulk image mirror unless PO later requires it.

## Secrets

- Prefer `TMDB_READ_ACCESS_TOKEN` (Bearer).  
- Optional fallback `TMDB_API_KEY`.  
- Environment / Actions secrets only — never browser bundles, never commit.

## Before broader public TMDB-derived content

1. ~~Ship attribution UI/copy per terms~~ — Profile About (primary); Opening compact optional; Home composition preserved (parity pass).  
2. ~~Implement `T-ENR-01B` artifact~~ — done.  
3. PO/legal confirmation of commercial vs non-commercial posture for GitHub Pages production.  
4. ~~Activate Search via `T-ENR-20`~~ / ~~Film Detail via `T-ENR-30`~~ — done; further surfaces only if new approved slots appear.
