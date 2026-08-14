# Showtime availability notifications (Phase 3)

**Status:** Implemented and production-verified (controlled E2E). Ship when branch is committed/pushed and the post-scrape detector workflow is live on `main`.

## End-to-end story

1. User Saves a film with no qualifying future Seattle showtimes.
2. Detector enrolls a watch episode (`enrolled_unavailable = true`).
3. Daily scrape publishes `public/data/showtimes_current.json`.
4. Post-scrape GitHub Action runs the detector with the service role.
5. When that watch first becomes available, one `SHOWTIMES_AVAILABLE` row is inserted.
6. Signed-in SPA fetches notifications; bell unread dot; sheet; mark read persists.

## Architecture

| Concern | Where |
|--------|--------|
| Canonical showtimes | Committed `public/data/showtimes_current.json` after Daily Showtime Scraping (~06:00 UTC) |
| Saved preferences | `user_film_preferences` (`preference_type='saved'`, `is_active`) |
| Watch enrollment | `user_film_showtime_watches` (service-role only) |
| Notifications | `user_notifications` (service-role insert; client select/update `read_at`) |
| Detection trigger | `.github/workflows/showtime_availability_notifications.yml` after successful Daily Showtime Scraping (checks out the **branch tip** after the scrape push, not the pre-commit SHA) |
| Qualifying showtimes | `v2/showtimes/qualifyingShowtimes.js` (shared with Saved Available / Watching) |

Detection does **not** run in the browser and does not use a new long-running server.

## Transition semantics

A Save becomes **watch-eligible** when the detector first observes it (or
re-activates it after unsave) **and** there are no qualifying future Seattle
showtimes → `enrolled_unavailable = true`, new `episode_id`.

A notification is generated **once** when an eligible active episode transitions
to qualifying availability. `notified_at` + unique `occurrence_key`
(`showtimes_available:{user_id}:{film_key}:{episode_id}`) prevent duplicates
from pipeline churn or temporary disappearance/reappearance.

| Case | Behavior |
|------|----------|
| Save while unavailable → later available | Notify once |
| Save while already available | Baseline only; no notify for that episode |
| Available → temporarily gone → back | No re-notify (baseline / already notified) |
| Unsave | Deactivate watch; no future notify; history kept |
| Re-save while unavailable | New episode; can notify again later |
| Re-save while available | New episode baseline available; no notify |

## Migration / bootstrap safety

Migrations:

1. `20260814000000_user_notifications_showtime_watches.sql` — tables, RLS, policies
2. `20260814110000_service_role_showtime_notification_grants.sql` — minimum `service_role` grants (SELECT prefs; SELECT/INSERT/UPDATE watches; INSERT notifications)

First detector run after deploy creates watch rows for existing Saves:

- **Saved + currently available** → `enrolled_unavailable = false` (no surprise notify)
- **Saved + currently unavailable** → `enrolled_unavailable = true` (eligible for a future notify)
- **New Saves after deploy** → same rules on first observation

## Browser permissions

- SELECT own notifications
- UPDATE own `read_at` only (immutable fields guarded by trigger)
- No INSERT / DELETE of system notifications from the SPA
- Watch table: no authenticated grants

## Secrets (GitHub Actions)

Required for the detector workflow (never in the SPA):

| Secret | Notes |
|--------|--------|
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | Project URL (workflow accepts either secret name) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key only — not the publishable/anon key |

The scheduled workflow runs:

```bash
node scripts/detect_showtime_availability_notifications.mjs
```

with Actions-supplied env and the default production showtimes path. It does **not** pass `--showtimes-file`.

Never put the service-role key in Vite env, Pages build variables, or any `VITE_*` name.

## Dry-run and controlled QA

```bash
# Read-only against production prefs/watches + local/current showtimes artifact
node scripts/detect_showtime_availability_notifications.mjs --dry-run

# Same, but override showtimes JSON (test/dev only; does not write DB; does not
# touch public/data/showtimes_current.json)
node scripts/detect_showtime_availability_notifications.mjs --dry-run \
  --showtimes-file tests/fixtures/detector/showtimes_dune_part_three_available.json
```

Local detector loads missing keys from gitignored `.env.local`. Process/CI env
overrides `.env.local`. Dry-run exits before any watch upsert or notification insert.

Regression fixture `tests/fixtures/detector/showtimes_dune_part_three_available.json`
is **test-only** simulated availability for `tmdb:1170608` (Dune: Part Three). It is
not a production artifact.
