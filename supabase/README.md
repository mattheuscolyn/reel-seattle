# Supabase (auth + film preference sync + TMDB search proxy)

Reel Seattle v2 authentication and optional Saved / Seen / Not Interested sync.
My Schedule / plans / favorites remain local-only.

Production live TMDB Search/Detail (films without Seattle showtimes) uses Edge
Function `tmdb-api` — see [TMDB Search Edge Function](#tmdb-search-edge-function).

## Apply migrations

```bash
# With Supabase CLI linked to your project:
supabase db push

# Or paste supabase/migrations/*.sql into the Supabase SQL editor (in order).
```

Current migrations:

1. `20260729000000_profiles_foundation.sql` — table, RLS, signup trigger
2. `20260803000000_profiles_provisioning_repair.sql` — repair trigger + backfill missing profiles
3. `20260804000000_user_film_preferences_sync.sql` — `user_film_preferences` + `user_sync_state`, RLS, LWW tombstones
4. `20260805000000_user_accepted_plans_sync.sql` — `user_accepted_plans` + schedule columns on `user_sync_state`
5. `20260806000000_profiles_authenticated_grants_repair.sql` — grant SELECT/INSERT/UPDATE on `profiles` to `authenticated` (RLS still own-row only)

### After applying the profiles grants repair

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee in ('authenticated', 'anon')
order by grantee, privilege_type;
```

Expect `authenticated` to have INSERT, SELECT, UPDATE. Expect no anon SELECT/INSERT/UPDATE.

### After applying the film preferences migration

```sql
select relname, relrowsecurity
from pg_class
where relname in ('user_film_preferences', 'user_sync_state');

select polname, tablename
from pg_policies
where tablename in ('user_film_preferences', 'user_sync_state');
```

Expect RLS enabled and own-row SELECT/INSERT/UPDATE policies only (no DELETE).

### After applying the repair migration (counts only — no private IDs)

```sql
select
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.profiles) as profiles,
  (
    select count(*)::int
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  ) as users_missing_profiles;

select
  trigger_name,
  event_object_schema,
  event_object_table,
  action_timing,
  event_manipulation
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users';
```

Expect: `users_missing_profiles = 0`, and trigger `on_auth_user_created_profile` present.

## Manual verification checklist

1. Create a Google-authenticated user → exactly one `public.profiles` row with matching `id`.
2. As that user (authenticated JWT): `select * from profiles where id = auth.uid()` succeeds.
3. Update own `display_name` succeeds.
4. `select` another user’s `id` returns zero rows (RLS).
5. Anonymous key: `select * from profiles` returns zero rows / permission denied.
6. Delete auth user → profile row cascades away.

## Secrets and public env

Frontend may use only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- optional `VITE_TMDB_PROXY_BASE` (override proxy base URL — not a TMDB secret)

Never put service-role keys, DB passwords, Google client secrets, or
`TMDB_READ_ACCESS_TOKEN` / `TMDB_API_KEY` in the browser or this repo.

Production Pages reads the two public Supabase values from GitHub Actions **Variables**
(`vars.VITE_SUPABASE_*`) during `npm run build:v2`. See [docs/v2/auth-foundation.md](../docs/v2/auth-foundation.md)
for the full dashboard checklist (Site URL, redirect allowlist, Google consent branding).

## TMDB Search Edge Function

Whitelisted public proxy for Phase 1 Search (no user login required):

- Function name: `tmdb-api`
- Source: `supabase/functions/tmdb-api/` + shared contract `_shared/tmdbProxyContract.js`
- `verify_jwt = false` (configured in `supabase/config.toml`)
- Operations:
  - `GET .../functions/v1/tmdb-api?action=search&query=...&limit=5`
  - `GET .../functions/v1/tmdb-api?action=movie&id=<numeric>`
- CORS: `www.reelseattle.com`, `reelseattle.com`, `http://127.0.0.1:5175`, `http://localhost:5175`
- Local dev: Vite still serves `/api/tmdb/*` from the same shared contract (see `vite.v2.config.js`)

### Human setup (required once for production)

1. Install/link Supabase CLI to the existing Reel Seattle project (`supabase link`).
2. Set the TMDB credential as a **Supabase secret** (Dashboard → Edge Functions → Secrets, or CLI):

   ```bash
   supabase secrets set TMDB_READ_ACCESS_TOKEN=your_token_here
   # optional fallback instead of bearer:
   # supabase secrets set TMDB_API_KEY=your_api_key_here
   ```

3. Deploy the function:

   ```bash
   supabase functions deploy tmdb-api
   ```

   Confirm JWT verification is **disabled** for `tmdb-api` (config.toml `verify_jwt = false`, or dashboard equivalent). Search must work for signed-out visitors.

4. Confirm GitHub Actions repository **Variables** already used by Pages deploy:

   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable/anon key

   The SPA derives the Edge Function URL from `VITE_SUPABASE_URL`. No TMDB secret belongs in GitHub Pages build env.

5. Smoke from a browser on an allowlisted origin (or curl with `Origin: https://www.reelseattle.com`):

   ```text
   {VITE_SUPABASE_URL}/functions/v1/tmdb-api?action=search&query=dune&limit=5
   ```

   Send header `apikey: <publishable key>` (and `Authorization: Bearer <publishable key>`).

Until step 2–3 are done, production Search still returns local Reel Seattle matches; TMDB-only “More films” soft-fails empty.
