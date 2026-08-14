/**
 * Idempotent SHOWTIMES_AVAILABLE detector (service-role).
 *
 * Usage:
 *   node scripts/detect_showtime_availability_notifications.mjs
 *   node scripts/detect_showtime_availability_notifications.mjs --dry-run
 *   node scripts/detect_showtime_availability_notifications.mjs --dry-run --showtimes-file <path>
 *
 * Env:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Local: loads missing keys from repo-root `.env.local` (gitignored).
 * Process/CI env always wins over `.env.local`. Never prints credentials.
 *
 * Optional:
 *   --showtimes-file <path>  override showtimes JSON (test/dev only; default unchanged)
 *   SHOWTIMES_PATH (default public/data/showtimes_current.json; ignored if --showtimes-file set)
 *   THEATERS_PATH (default public/data/theaters.json)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { buildHomeData } from '../v2/adapters/buildHomeData.js';
import {
  buildHomeFilmIdentityIndex,
  resolveHomeFilmForPreferenceRef,
} from '../v2/collections/personalCollectionModel.js';
import { filmRefFromPreferenceRow } from '../v2/auth/filmPreferenceIdentity.js';
import { detectShowtimeAvailabilityNotifications } from '../v2/notifications/detectShowtimeAvailability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

/**
 * @param {string} flag
 * @returns {string | null}
 */
function readArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  const value = process.argv[idx + 1];
  if (typeof value !== 'string' || !value.trim() || value.startsWith('-')) {
    return null;
  }
  return value.trim();
}

/**
 * Resolve a CLI/env path relative to repo root unless absolute.
 * @param {string} pathValue
 */
function resolveRepoPath(pathValue) {
  return isAbsolute(pathValue) ? pathValue : join(ROOT, pathValue);
}

/**
 * Load KEY=VALUE pairs from `.env.local` into process.env when unset.
 * Does not override existing process/CI environment variables.
 * No-ops when the file is missing (GitHub Actions path).
 * Never logs values.
 *
 * @param {string} filePath
 */
function loadEnvLocalIfPresent(filePath) {
  if (!existsSync(filePath)) return;
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      const existing = process.env[key];
      if (typeof existing === 'string' && existing.trim()) continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvLocalIfPresent(join(ROOT, '.env.local'));

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const supabaseUrl = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    '[detect-showtimes-available] Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(dryRun ? 0 : 1);
}

const showtimesFileArg = readArgValue('--showtimes-file');
const showtimesPath = showtimesFileArg
  ? resolveRepoPath(showtimesFileArg)
  : readEnv('SHOWTIMES_PATH') ||
    join(ROOT, 'public/data/showtimes_current.json');
const theatersPath =
  readEnv('THEATERS_PATH') || join(ROOT, 'public/data/theaters.json');

if (!existsSync(showtimesPath)) {
  console.error(
    `[detect-showtimes-available] Showtimes file not found: ${showtimesPath}`,
  );
  process.exit(1);
}

const showtimesCurrent = loadJson(showtimesPath);
let theatersRegistry = null;
try {
  theatersRegistry = loadJson(theatersPath);
} catch {
  theatersRegistry = null;
}

const homeData = buildHomeData({
  showtimesCurrent,
  theatersRegistry,
  newlyAddedArtifact: { entries: [] },
});
const filmIndex = buildHomeFilmIdentityIndex(homeData);

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE = 1000;

async function fetchAllSavedPreferences() {
  /** @type {object[]} */
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await client
      .from('user_film_preferences')
      .select(
        'user_id, film_key, film_id, showtime_film_key, is_active, title_snapshot, poster_url_snapshot, preference_type',
      )
      .eq('preference_type', 'saved')
      .eq('is_active', true)
      .range(from, to);
    if (error) throw new Error(`fetch saved preferences: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchAllWatches() {
  /** @type {object[]} */
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await client
      .from('user_film_showtime_watches')
      .select(
        'user_id, film_key, film_id, showtime_film_key, is_active, enrolled_unavailable, episode_id, notified_at',
      )
      .range(from, to);
    if (error) throw new Error(`fetch watches: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function resolveHomeFilm(pref) {
  const ref = filmRefFromPreferenceRow(pref);
  if (!ref) return null;
  return resolveHomeFilmForPreferenceRef(ref, filmIndex);
}

const savedPreferences = await fetchAllSavedPreferences();
const watches = await fetchAllWatches();

const result = detectShowtimeAvailabilityNotifications({
  homeData,
  savedPreferences,
  watches,
  resolveHomeFilm,
  now: new Date(),
});

const wouldCreate = result.notificationInserts.map((n) => ({
  film_key: n.film_key,
  film_id: n.film_id,
  title_snapshot: n.title_snapshot,
  theaterName: n.event_snapshot?.theaterName ?? null,
  localDate: n.event_snapshot?.localDate ?? null,
}));

console.log(
  JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'apply',
      readOnly: dryRun,
      databaseWrites: dryRun ? 0 : undefined,
      showtimesPath,
      showtimesOverride: Boolean(showtimesFileArg),
      savedPreferencesScanned: savedPreferences.length,
      watchesFound: watches.length,
      counts: result.counts,
      watchUpsertsPlanned: result.watchUpserts.length,
      notificationsWouldCreate: wouldCreate.length,
      wouldCreateNotifications: wouldCreate,
      watchEpisodesForWouldCreate: result.notificationInserts.map((n) => {
        const watch = result.watchUpserts.find(
          (w) =>
            w.user_id === n.user_id &&
            w.film_key === n.film_key &&
            w.notified_at,
        );
        return {
          film_key: n.film_key,
          episode_id: watch?.episode_id ?? null,
          enrolled_unavailable: watch?.enrolled_unavailable ?? null,
        };
      }),
    },
    null,
    2,
  ),
);

if (dryRun) {
  process.exit(0);
}

if (result.watchUpserts.length) {
  const { error } = await client
    .from('user_film_showtime_watches')
    .upsert(result.watchUpserts, { onConflict: 'user_id,film_key' });
  if (error) {
    console.error(`[detect-showtimes-available] watch upsert failed: ${error.message}`);
    process.exit(1);
  }
}

let inserted = 0;
let duplicateSkipped = 0;
for (const draft of result.notificationInserts) {
  const { error } = await client.from('user_notifications').insert(draft);
  if (error) {
    if (error.code === '23505') {
      duplicateSkipped += 1;
      continue;
    }
    console.error(
      `[detect-showtimes-available] notification insert failed: ${error.message}`,
    );
    process.exit(1);
  }
  inserted += 1;
}

console.log(
  JSON.stringify(
    {
      applied: true,
      notificationsInserted: inserted,
      duplicatesSkipped: duplicateSkipped,
      watchesUpserted: result.watchUpserts.length,
    },
    null,
    2,
  ),
);
