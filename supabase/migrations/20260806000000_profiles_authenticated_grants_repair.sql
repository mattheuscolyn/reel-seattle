-- T-ACCOUNT-PROFILE-DATA-02 repair: table privileges for authenticated
-- Do not edit 20260729000000_profiles_foundation.sql or
-- 20260803000000_profiles_provisioning_repair.sql.
--
-- Root cause in production: RLS policies existed, but the authenticated role
-- lacked SELECT / INSERT / UPDATE table privileges on public.profiles, so
-- profile load and display-name updates failed closed.
-- Idempotent: safe to re-run on environments that already applied the grant.

revoke all on table public.profiles from anon;
revoke all on table public.profiles from public;
grant select, insert, update on table public.profiles to authenticated;

comment on table public.profiles is
  'Reel Seattle user profile (T-AUTH-01). Minimal identity only. authenticated has SELECT/INSERT/UPDATE; own-row RLS; no anon access.';
