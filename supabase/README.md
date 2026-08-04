# Supabase (auth + film preference sync)

Reel Seattle v2 authentication and optional Saved / Seen / Not Interested sync.
My Schedule / plans / favorites remain local-only.

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

Never put service-role keys, DB passwords, or Google client secrets in the browser or this repo.

Production Pages reads the two public values from GitHub Actions **Variables**
(`vars.VITE_SUPABASE_*`) during `npm run build:v2`. See [docs/v2/auth-foundation.md](../docs/v2/auth-foundation.md)
for the full dashboard checklist (Site URL, redirect allowlist, Google consent branding).
