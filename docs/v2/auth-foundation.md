# Reel Seattle v2 — Authentication Foundation

**Status:** Production-ready auth foundation (`T-ACCOUNT-CLOUD-AUTH-01`)  
**Cloud synchronization:** Film preferences (Saved / Seen / Not Interested) and
My Schedule / accepted plans sync after **separate explicit browser attachments**.
Planner drafts, favorites, and calendar settings remain local-only.

## Architecture

```text
Vite env (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
  → v2/auth/supabaseClient.js
  → v2/auth/authSessionStore.js (+ useAuth)
  → v2/auth/oauthRedirect.js (approved redirect origins)
  → Profile Account panel
  → Supabase Auth (Google OAuth, PKCE)
  → public.profiles (RLS + auth.users trigger)
```

Local film/planner stores are **not** auto-uploaded on login. Film preference
sync requires an explicit Enable sync → Merge and enable sync choice
(`v2/auth/filmPreferencesSync.js`). Login/logout never clears:

- `reel-seattle.v2.savedFilms`
- `reel-seattle.v2.seenFilms`
- `reel-seattle.v2.dismissedFilms`
- `reel-seattle.v2.acceptedPlans`
- favorite theaters / schedule settings
- `reel-seattle.v2.filmSyncAttachment` (browser attachment marker; not cleared on logout)

## Environment

See [`.env.example`](../../.env.example) and [`supabase/README.md`](../../supabase/README.md).

Frontend may embed only the **publishable** URL + key. Never put service-role keys,
DB passwords, or Google client secrets in the frontend or Pages build.

Production Pages (`deploy.yml`) passes repository **Variables**:

- `vars.VITE_SUPABASE_URL`
- `vars.VITE_SUPABASE_PUBLISHABLE_KEY`

When unset, the build still succeeds and Account UI shows “not configured”.

## User-visible Profile Account behavior

| State | Behavior |
|-------|----------|
| Unconfigured | Sign-in unavailable copy; local app still works |
| Loading | “Checking account…” |
| Signed out | Honest “cloud sync not active yet” + Continue with Google |
| Signing in | Button disabled / “Signing in…” |
| Signed in (not attached) | “Film activity is stored on this device” + Enable sync |
| Attachment prompt | Merge and enable sync / Keep using this device only |
| Sync active | “Saved, Seen, and Not Interested are synced” + Sync now |
| Sync degraded | Local-safe warning + Retry sync |
| Error | Inline message + retry; local features remain usable |

## Approved OAuth redirect origins

Exact origins only (see `v2/auth/oauthRedirect.js`):

- `https://www.reelseattle.com`
- `https://reelseattle.com` (apex redirects to www)
- `http://127.0.0.1:5175`
- `http://localhost:5175`

`redirectTo` is always `{origin}/`. Arbitrary caller redirects are rejected.

## Film preference sync (T-ACCOUNT-CLOUD-SYNC-FILMS-01)

Tables: `public.user_film_preferences`, `public.user_sync_state` (own-row RLS,
tombstones via `is_active=false`, no routine DELETE).

Login alone never uploads, downloads, merges, or attaches. Each browser keeps
`reel-seattle.v2.filmSyncAttachment` after a successful Merge and enable sync.

## Schedule sync (T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01)

Table: `public.user_accepted_plans` (durable `plan_snapshot` jsonb). Schedule
markers: `user_sync_state.schedule_attached_at` / `schedule_last_synced_at`.

Browser attachment: `reel-seattle.v2.scheduleSyncAttachment` — **independent**
of film sync. Film attach does not enable schedule sync.

Extension points: `v2/auth/filmPreferencesSync.js`, `v2/auth/scheduleSync.js`,
`cloudSyncStatus.js`.

## Human dashboard checklist

### Supabase Authentication (Dashboard → Authentication)

1. **Site URL:** `https://www.reelseattle.com`
2. **Additional Redirect URLs** (exact):
   - `https://www.reelseattle.com/`
   - `https://reelseattle.com/`
   - `http://127.0.0.1:5175/`
   - `http://localhost:5175/`
3. **Google provider:** Enabled, with Client ID + Client Secret from Google Cloud
   (secret stays in Supabase dashboard only — never in this repo)
4. **Expected callback URL (Supabase-hosted):**  
   `https://<project-ref>.supabase.co/auth/v1/callback`  
   (copy from Supabase Google provider settings)

### Google Cloud OAuth

1. **Authorized JavaScript origins:**
   - `https://www.reelseattle.com`
   - `https://reelseattle.com`
   - `http://127.0.0.1:5175`
   - `http://localhost:5175`
2. **Authorized redirect URIs:** the Supabase callback URL above  
   (`https://<project-ref>.supabase.co/auth/v1/callback`)
3. **Consent screen:** set application name to **Reel Seattle** (or preferred brand).  
   If users still see a raw `*.supabase.co` host on the consent screen, that is
   controlled by Google/Supabase branding settings — not by frontend code.
4. Do not put the Google client secret in GitHub or Vite env.

### GitHub Actions / Pages

1. Repository **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable/anon key
2. Confirm these are **Variables**, not service-role **Secrets**.
3. Redeploy / push so `deploy.yml` Build v2 embeds the public config.
4. Confirm Account is no longer “not configured” on www.

### Database

1. Apply `supabase/migrations/20260729000000_profiles_foundation.sql` if not already applied.
2. Verify a new Google user gets one `public.profiles` row (`id = auth.users.id`).
3. Verify RLS: user can only select/update own row.

## Recommended next tasks

1. Complete dashboard checklist + manual production Google OAuth round-trip  
2. First cloud sync store (Saved films) with explicit attach prompt  
3. Profile display-name editing  
4. Apple sign-in (later)
