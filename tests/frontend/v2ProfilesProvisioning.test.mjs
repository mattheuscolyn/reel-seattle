import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FOUNDATION = readFileSync(
  join(ROOT, 'supabase/migrations/20260729000000_profiles_foundation.sql'),
  'utf8',
);
const REPAIR = readFileSync(
  join(
    ROOT,
    'supabase/migrations/20260803000000_profiles_provisioning_repair.sql',
  ),
  'utf8',
);
const GRANTS_REPAIR = readFileSync(
  join(
    ROOT,
    'supabase/migrations/20260806000000_profiles_authenticated_grants_repair.sql',
  ),
  'utf8',
);

test('foundation migration defines profiles table, RLS, and signup trigger', () => {
  assert.match(FOUNDATION, /create table if not exists public\.profiles/);
  assert.match(FOUNDATION, /enable row level security/);
  assert.match(FOUNDATION, /profiles_select_own/);
  assert.match(FOUNDATION, /profiles_insert_own/);
  assert.match(FOUNDATION, /profiles_update_own/);
  assert.match(FOUNDATION, /auth\.uid\(\) = id/);
  assert.match(FOUNDATION, /handle_new_user_profile/);
  assert.match(FOUNDATION, /on_auth_user_created_profile/);
  assert.match(FOUNDATION, /security definer/i);
  assert.match(FOUNDATION, /on conflict \(id\) do nothing/i);
});

test('repair migration is forward-only and does not rewrite foundation file', () => {
  assert.match(
    REPAIR,
    /T-ACCOUNT-PROFILE-PROVISION-01|profiles_provisioning_repair/,
  );
  assert.match(REPAIR, /Do not edit 20260729000000/);
  assert.equal(FOUNDATION.includes('T-ACCOUNT-PROFILE-PROVISION-01'), false);
});

test('repair recreates trigger function with pinned search_path', () => {
  assert.match(REPAIR, /create or replace function public\.handle_new_user_profile/);
  assert.match(REPAIR, /security definer/i);
  assert.match(REPAIR, /set search_path = public,\s*pg_temp/);
  assert.match(REPAIR, /drop trigger if exists on_auth_user_created_profile on auth\.users/);
  assert.match(REPAIR, /create trigger on_auth_user_created_profile/);
  assert.match(REPAIR, /after insert on auth\.users/);
});

test('repair backfill is idempotent and non-destructive', () => {
  assert.match(REPAIR, /insert into public\.profiles \(id, display_name, avatar_url\)/);
  assert.match(REPAIR, /from auth\.users u/);
  assert.match(REPAIR, /on conflict \(id\) do nothing/i);
  assert.equal(/on conflict \(id\) do update/i.test(REPAIR), false);
  assert.equal(/truncate\s+public\.profiles/i.test(REPAIR), false);
  assert.equal(/delete from public\.profiles/i.test(REPAIR), false);
});

test('repair preserves own-row RLS and does not grant anon select', () => {
  assert.match(REPAIR, /enable row level security/);
  assert.match(REPAIR, /profiles_select_own/);
  assert.match(REPAIR, /using \(auth\.uid\(\) = id\)/);
  assert.match(REPAIR, /with check \(auth\.uid\(\) = id\)/);
  assert.equal(/to anon/i.test(REPAIR), false);
  assert.equal(/grant select on public\.profiles to anon/i.test(REPAIR), false);
  assert.equal(/grant select on public\.profiles to public/i.test(REPAIR), false);
});

test('repair does not trust client-supplied profile IDs in the trigger', () => {
  // Trigger inserts NEW.id from auth.users row only.
  assert.match(REPAIR, /values \(new\.id,/);
  assert.equal(/request\.jwt/i.test(REPAIR), false);
  assert.equal(/current_setting\('request\.jwt/i.test(REPAIR), false);
});

test('frontend profile fetch targets own id only and never uses service role', () => {
  const store = readFileSync(join(ROOT, 'v2/auth/authSessionStore.js'), 'utf8');
  const profileData = readFileSync(join(ROOT, 'v2/auth/profileData.js'), 'utf8');
  assert.match(profileData, /\.from\('profiles'\)/);
  assert.match(profileData, /\.eq\('id', userId\)/);
  assert.match(store, /refreshOwnProfile/);
  assert.equal(store.includes('SERVICE_ROLE'), false);
  assert.equal(profileData.includes('SERVICE_ROLE'), false);
  // Own-row upsert is allowed for missing-row recovery / display-name save under RLS.
  assert.match(profileData, /auth\.uid|user\.id|userId/);
});

test('profiles authenticated grants repair is forward-only and mirrors film-sync grants', () => {
  assert.match(GRANTS_REPAIR, /T-ACCOUNT-PROFILE-DATA-02/);
  assert.match(GRANTS_REPAIR, /Do not edit 20260729000000/);
  assert.match(
    GRANTS_REPAIR,
    /grant select, insert, update on table public\.profiles to authenticated/i,
  );
  assert.match(GRANTS_REPAIR, /revoke all on table public\.profiles from anon/i);
  assert.match(
    GRANTS_REPAIR,
    /revoke all on table public\.profiles from public/i,
  );
  assert.equal(/grant .+ to anon/i.test(GRANTS_REPAIR), false);
  assert.equal(/grant .+ to public/i.test(GRANTS_REPAIR), false);
  assert.equal(/drop policy/i.test(GRANTS_REPAIR), false);
  assert.equal(/disable row level security/i.test(GRANTS_REPAIR), false);
  assert.equal(FOUNDATION.includes('grant select, insert, update'), false);
  assert.equal(REPAIR.includes('grant select, insert, update'), false);
});
