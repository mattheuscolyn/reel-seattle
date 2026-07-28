# Film Identity — Commands and Cockpit Notes

**Related:** [film-identity-contract.md](./film-identity-contract.md) · [tmdb-attribution.md](./research/tmdb-attribution.md)

## Environment

Set one of (never commit; never pass on CLI):

- `TMDB_READ_ACCESS_TOKEN` (preferred — Bearer)
- `TMDB_API_KEY` (fallback)

Optional: `REEL_SEATTLE_PYTHON` if the cockpit decision writer should use a non-default Python.

## Commands

```text
# 1. Inventory source identities (offline)
python scripts/inventory_film_identities.py
python scripts/inventory_film_identities.py --stdout

# 2. Offline / mocked tests
python -m pytest tests/film_identity -q

# 3. Validate authored decisions (+ generated artifacts if present)
python scripts/validate_film_identity.py
python scripts/validate_film_identity.py --require-generated

# 4. Offline rebuild (no TMDB calls) — source fallbacks + eligibility
python scripts/match_tmdb_films.py --offline-inventory-only

# 5. Live TMDB matching → catalog + review queue + coverage
python scripts/match_tmdb_films.py
python scripts/match_tmdb_films.py --refresh-cache

# 6. Apply a review decision patch
python scripts/apply_tmdb_match_decisions.py --patch path/to/patch.json
python scripts/apply_tmdb_match_decisions.py --patch path/to/patch.json --dry-run

# 7. Import a downloaded Actions artifact package (cockpit review)
python scripts/import_film_identity_artifacts.py --from-dir path/to/downloaded-package
python scripts/import_film_identity_artifacts.py --from-dir path/to/downloaded-package --dry-run
```

## Local live match

For developers who configure a local environment secret:

```text
python scripts/match_tmdb_films.py
python scripts/validate_film_identity.py --require-generated
npm run cockpit   # Film Identity Review
```

## GitHub Actions live match (`T-FILMID-01D`)

Repository secrets are used by the manual workflow **Film Identity — Live TMDB Match**
(`.github/workflows/film_identity_match.yml`).

1. Open **Actions** → **Film Identity — Live TMDB Match** → **Run workflow**.
2. Leave `persist_mode` = **`artifact-only`** for the first real run.
3. Optionally set `refresh_cache` / `limit`.
4. Download the `film-identity-match-<run-id>` artifact.
5. Inspect coverage + review queue (and/or import locally — see below).
6. Author decisions in the local cockpit or via patch apply.
7. Re-run matching.
8. Use `persist_mode=create-pr` only after outputs are accepted (opens a PR; never pushes directly to `main`).

Import a downloaded package for cockpit inspection:

```text
python scripts/import_film_identity_artifacts.py --from-dir ~/Downloads/film-identity-match-123
npm run cockpit
```

The cockpit does **not** read GitHub Actions artifacts automatically.

### Persistence modes

| Mode | Behavior |
|------|----------|
| `artifact-only` (default) | Match + validate + upload review package; no branch/PR |
| `create-pr` | After a successful match job, open a PR with generated identity artifacts only |

### Cache

`data/cache/tmdb/` is gitignored and never uploaded as the review artifact. Actions may restore/save an optional response cache keyed by OS + source/decision/matcher hashes. `refresh_cache=true` skips restore.

## Cockpit

`npm run cockpit` → **Film Identity Review**

- Reads allowlisted queue / coverage / decisions under `/data/film_identity/*`
- Local-only POST `/api/film-identity/decisions` (writes via apply script)
- Local-only TMDB search/details proxy (secrets stay on the Vite server process)
- Export patch JSON if you prefer applying from the CLI
