# TMDB Attribution and Policy Note

**Status:** Repository policy note (2026-07-27)  
**Related:** [film-identity-contract.md](../film-identity-contract.md)

## Usage today (`T-FILMID-01`)

Reel Seattle uses The Movie Database (TMDB) API for **internal film identity matching** (search + movie details) in repository scripts and the local developer cockpit proxy.

- Identity matching and later **public metadata enrichment** are distinct stages.  
- This packet does **not** display TMDB-derived content on the public site or v2 UI.  
- No legal approval beyond TMDB’s official API terms is claimed here.

## Before public TMDB-derived content

Before any TMDB-derived metadata, posters, or links appear in public artifacts or UI:

1. Include TMDB’s required attribution as specified by [TMDB API terms / attribution guidelines](https://www.themoviedb.org/documentation/api/terms-of-use).  
2. Complete field selection, caching, and policy review (`T-ENR-01` and related).  
3. Keep secrets server-side; never ship TMDB tokens in browser bundles.

## Secrets

- Prefer `TMDB_READ_ACCESS_TOKEN` (Bearer).  
- Optional fallback `TMDB_API_KEY`.  
- Configured as GitHub Actions / local environment secrets — never committed.
