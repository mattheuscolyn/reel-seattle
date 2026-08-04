import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(
    ROOT,
    'supabase/migrations/20260805000000_user_accepted_plans_sync.sql',
  ),
  'utf8',
);

test('schedule migration is forward-only and defines accepted plans table', () => {
  assert.match(MIGRATION, /T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01/);
  assert.match(MIGRATION, /Do not edit prior migrations/);
  assert.match(MIGRATION, /create table if not exists public\.user_accepted_plans/);
  assert.match(MIGRATION, /primary key \(user_id, plan_id\)/);
  assert.match(MIGRATION, /jsonb_typeof\(plan_snapshot\) = 'object'/);
  assert.match(MIGRATION, /is_active boolean not null default true/);
});

test('schedule migration enables RLS, own-row policies, no DELETE, no anon', () => {
  assert.match(MIGRATION, /enable row level security/);
  assert.match(MIGRATION, /user_accepted_plans_select_own/);
  assert.match(MIGRATION, /user_accepted_plans_insert_own/);
  assert.match(MIGRATION, /user_accepted_plans_update_own/);
  assert.match(MIGRATION, /auth\.uid\(\) = user_id/);
  assert.equal(/\bfor delete\b/i.test(MIGRATION), false);
  assert.match(MIGRATION, /revoke all on table public\.user_accepted_plans from anon/i);
  assert.match(MIGRATION, /cannot be reassigned/);
  assert.match(MIGRATION, /new\.updated_at < old\.updated_at/);
});

test('schedule migration extends user_sync_state safely', () => {
  assert.match(MIGRATION, /add column if not exists schedule_attached_at/);
  assert.match(MIGRATION, /add column if not exists schedule_last_synced_at/);
});

test('schedule sync client never uses service role', () => {
  const sync = readFileSync(join(ROOT, 'v2/auth/scheduleSync.js'), 'utf8');
  assert.equal(/SERVICE_ROLE|service_role/i.test(sync), false);
  assert.match(sync, /\.from\('user_accepted_plans'\)/);
});
