import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(
    ROOT,
    'supabase/migrations/20260804000000_user_film_preferences_sync.sql',
  ),
  'utf8',
);

test('film preferences migration is forward-only and distinct from profiles', () => {
  assert.match(MIGRATION, /T-ACCOUNT-CLOUD-SYNC-FILMS-01/);
  assert.match(MIGRATION, /Do not edit prior migrations/);
  assert.equal(MIGRATION.includes('20260729000000'), false);
});

test('RLS: select/insert/update own only; no delete policy; no anon grants', () => {
  assert.match(MIGRATION, /alter table public\.user_film_preferences enable row level security/);
  assert.match(MIGRATION, /alter table public\.user_sync_state enable row level security/);
  assert.match(MIGRATION, /for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/);
  assert.match(MIGRATION, /for insert\s+to authenticated\s+with check \(auth\.uid\(\) = user_id\)/);
  assert.match(MIGRATION, /for update\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/);
  assert.equal(/\bfor delete\b/i.test(MIGRATION), false);
  assert.equal(/grant\s+.*\s+to\s+anon/i.test(MIGRATION), false);
  assert.match(MIGRATION, /revoke all on table public\.user_film_preferences from anon/i);
});

test('user_id reassignment blocked and LWW stale updates skipped', () => {
  assert.match(MIGRATION, /user_film_preferences\.user_id cannot be reassigned/);
  assert.match(MIGRATION, /user_sync_state\.user_id cannot be reassigned/);
  assert.match(MIGRATION, /new\.updated_at < old\.updated_at/);
  assert.match(MIGRATION, /return null/);
});

test('preference type check and unique identity constraint exist', () => {
  assert.match(
    MIGRATION,
    /check \(preference_type in \('saved', 'seen', 'not_interested'\)\)/,
  );
  assert.match(
    MIGRATION,
    /primary key \(user_id, film_key, preference_type\)/,
  );
});

test('frontend sync client never references service role', () => {
  const sync = readFileSync(
    join(ROOT, 'v2/auth/filmPreferencesSync.js'),
    'utf8',
  );
  assert.equal(/SERVICE_ROLE|service_role|service-role/i.test(sync), false);
  assert.match(sync, /\.from\('user_film_preferences'\)/);
  assert.match(sync, /\.from\('user_sync_state'\)/);
});
