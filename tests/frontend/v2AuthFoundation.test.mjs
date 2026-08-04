import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  readSupabasePublicConfig,
  resetSupabaseClientForTests,
} from '../../v2/auth/supabaseClient.js';
import {
  getAuthState,
  initialsFromDisplayName,
  resetAuthControllerForTests,
  resolveAuthAvatarUrl,
  resolveAuthDisplayName,
  signInWithGoogle,
  signOut,
  startAuthController,
  stopAuthController,
  subscribeAuth,
} from '../../v2/auth/authSessionStore.js';
import {
  CLOUD_SYNC_STATUS,
  getCloudSyncStatusLabel,
} from '../../v2/auth/cloudSyncStatus.js';
import { resetFilmPreferencesSyncForTests } from '../../v2/auth/filmPreferencesSync.js';
import { resetFilmStoreMutationBridgeForTests } from '../../v2/auth/filmStoreMutationBridge.js';
import { resetScheduleSyncForTests } from '../../v2/auth/scheduleSync.js';
import { resetScheduleStoreMutationBridgeForTests } from '../../v2/auth/scheduleStoreMutationBridge.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
  getAcceptedPlans,
} from '../../v2/stores/acceptedPlansStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
  markFilmSeen,
} from '../../v2/stores/seenFilmsStore.js';
import {
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
  markFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  favoriteTheater,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SCHEDULE_SETTINGS_STORAGE_KEY,
  getScheduleSettings,
  updateScheduleSettings,
} from '../../v2/stores/scheduleSettingsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function mockUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'viewer@example.com',
    user_metadata: { full_name: 'Ada Lovelace' },
    ...overrides,
  };
}

function createMockClient({
  session = null,
  getSessionError = null,
  oauthError = null,
  signOutError = null,
  profileRow = null,
  profileError = null,
} = {}) {
  /** @type {Array<(event: string, session: object | null) => void>} */
  const listeners = [];
  let currentSession = session;

  return {
    auth: {
      async getSession() {
        if (getSessionError) return { data: { session: null }, error: getSessionError };
        return { data: { session: currentSession }, error: null };
      },
      onAuthStateChange(cb) {
        listeners.push(cb);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const idx = listeners.indexOf(cb);
                if (idx >= 0) listeners.splice(idx, 1);
              },
            },
          },
        };
      },
      async signInWithOAuth(args) {
        createMockClient.lastOAuth = args;
        if (oauthError) return { data: null, error: oauthError };
        return { data: { url: 'https://example.test/oauth' }, error: null };
      },
      async signOut() {
        if (signOutError) return { error: signOutError };
        currentSession = null;
        for (const cb of listeners) cb('SIGNED_OUT', null);
        return { error: null };
      },
      /** test helper */
      __emit(event, nextSession) {
        currentSession = nextSession;
        for (const cb of listeners) cb(event, nextSession);
      },
      __listenerCount() {
        return listeners.length;
      },
    },
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (profileError) return { data: null, error: profileError };
                  return { data: profileRow, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}
createMockClient.lastOAuth = null;

test.beforeEach(() => {
  resetSupabaseClientForTests();
  resetAuthControllerForTests();
  resetFilmPreferencesSyncForTests();
  resetFilmStoreMutationBridgeForTests();
  resetScheduleSyncForTests();
  resetScheduleStoreMutationBridgeForTests();
  createMockClient.lastOAuth = null;
});

test('unconfigured Supabase reports false and returns null client', () => {
  const env = { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' };
  assert.equal(isSupabaseConfigured(env), false);
  assert.deepEqual(readSupabasePublicConfig(env), {
    url: null,
    publishableKey: null,
  });
  assert.equal(getSupabaseClient({ env }), null);
});

test('configured client initializes once via createClientFn', () => {
  const env = {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  };
  let calls = 0;
  const fake = { auth: {} };
  const createClientFn = () => {
    calls += 1;
    return fake;
  };
  assert.equal(isSupabaseConfigured(env), true);
  const a = getSupabaseClient({ env, createClientFn });
  const b = getSupabaseClient({ env, createClientFn });
  assert.equal(a, fake);
  assert.equal(b, fake);
  assert.equal(calls, 1);
});

test('startAuthController unconfigured → unconfigured status', async () => {
  const state = await startAuthController({
    env: {},
    getClient: () => null,
  });
  assert.equal(state.status, 'unconfigured');
  assert.equal(state.configured, false);
  assert.equal(getAuthState().user, null);
});

test('initial session restoration signed out', async () => {
  const client = createMockClient({ session: null });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  assert.equal(getAuthState().status, 'signed_out');
  assert.equal(getAuthState().session, null);
});

test('initial session restoration signed in + profile fetch', async () => {
  const user = mockUser();
  const session = { user, access_token: 't' };
  const profileRow = {
    id: user.id,
    display_name: 'Ada L',
    username: null,
    avatar_url: null,
  };
  const client = createMockClient({ session, profileRow });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  assert.equal(getAuthState().status, 'signed_in');
  assert.equal(getAuthState().user.email, 'viewer@example.com');
  assert.equal(getAuthState().profile.display_name, 'Ada L');
  assert.equal(getAuthState().profileStatus, 'ready');
});

test('auth state-change subscription updates and cleans up', async () => {
  const client = createMockClient({ session: null });
  const seen = [];
  const unsub = subscribeAuth((s) => seen.push(s.status));
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  assert.equal(client.auth.__listenerCount(), 1);
  const user = mockUser();
  await client.auth.__emit('SIGNED_IN', { user });
  assert.equal(getAuthState().status, 'signed_in');
  stopAuthController();
  assert.equal(client.auth.__listenerCount(), 0);
  unsub();
  assert.ok(seen.includes('signed_out') || seen.includes('loading'));
});

test('Google sign-in invocation uses current-origin redirect', async () => {
  const client = createMockClient();
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  const result = await signInWithGoogle({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
    redirectTo: 'http://127.0.0.1:5175/',
    storage: memoryStorage(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.redirectTo, 'http://127.0.0.1:5175/');
  assert.equal(createMockClient.lastOAuth.provider, 'google');
  assert.equal(
    createMockClient.lastOAuth.options.redirectTo,
    'http://127.0.0.1:5175/',
  );
});

test('Google sign-in rejects unapproved explicit redirectTo', async () => {
  const client = createMockClient();
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  const result = await signInWithGoogle({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
    redirectTo: 'https://evil.example/steal',
    storage: memoryStorage(),
  });
  assert.equal(result.ok, true);
  assert.equal(
    createMockClient.lastOAuth.options.redirectTo,
    'https://www.reelseattle.com/',
  );
});

test('repeated Google sign-in presses are guarded', async () => {
  const client = createMockClient();
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  const first = signInWithGoogle({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
    redirectTo: 'http://localhost:5175/',
    storage: memoryStorage(),
  });
  const second = await signInWithGoogle({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
    redirectTo: 'http://localhost:5175/',
    storage: memoryStorage(),
  });
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'busy');
});

test('TOKEN_REFRESHED updates session without clearing local stores', async () => {
  const storage = memoryStorage();
  saveFilm(storage, 'alpha', {
    title: 'Alpha',
    now: () => new Date('2026-07-28T18:00:00.000Z'),
  });
  const before = storage.getItem(SAVED_FILMS_STORAGE_KEY);
  const user = mockUser();
  const client = createMockClient({ session: { user, access_token: 'a' } });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  await client.auth.__emit('TOKEN_REFRESHED', {
    user,
    access_token: 'b',
  });
  assert.equal(getAuthState().status, 'signed_in');
  assert.equal(getAuthState().signedIn, true);
  assert.equal(getAuthState().session.access_token, 'b');
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), before);
});

test('OAuth failure/cancellation handling is user-readable', async () => {
  const client = createMockClient({
    oauthError: { message: 'User cancelled the popup' },
  });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  const result = await signInWithGoogle({
    getClient: () => client,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
  });
  assert.equal(result.ok, false);
  assert.match(getAuthState().errorMessage ?? '', /cancelled/i);
});

test('sign-out invocation clears session state', async () => {
  const user = mockUser();
  const client = createMockClient({ session: { user } });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  assert.equal(getAuthState().status, 'signed_in');
  const result = await signOut({
    getClient: () => client,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(getAuthState().status, 'signed_out');
  assert.equal(getAuthState().user, null);
});

test('initialization failure becomes error status', async () => {
  const client = createMockClient({
    getSessionError: { message: 'network boom' },
  });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  assert.equal(getAuthState().status, 'error');
  assert.match(getAuthState().errorMessage ?? '', /account|session|reach/i);
});

test('profile display name fallback order', () => {
  assert.equal(
    resolveAuthDisplayName(
      mockUser({ user_metadata: { name: 'Meta Name' } }),
      { display_name: 'Profile Name' },
    ),
    'Profile Name',
  );
  assert.equal(
    resolveAuthDisplayName(mockUser({ user_metadata: { full_name: 'Meta' } }), null),
    'Meta',
  );
  assert.equal(
    resolveAuthDisplayName(
      mockUser({ email: 'only@example.com', user_metadata: {} }),
      null,
    ),
    'only@example.com',
  );
  assert.equal(initialsFromDisplayName('Ada Lovelace'), 'AL');
  assert.equal(initialsFromDisplayName('Solo'), 'S');
  assert.equal(
    resolveAuthAvatarUrl({ avatar_url: 'https://cdn.example/a.png' }),
    'https://cdn.example/a.png',
  );
  assert.equal(resolveAuthAvatarUrl({ avatar_url: 'http://insecure.example/a.png' }), null);
  assert.equal(resolveAuthAvatarUrl({ avatar_url: 'javascript:alert(1)' }), null);
  assert.match(getCloudSyncStatusLabel(), /stored on this device/i);
  assert.equal(CLOUD_SYNC_STATUS, 'local_only');
});

test('local stores preserved across sign-in and sign-out (no sync)', async () => {
  const storage = memoryStorage();
  const now = () => new Date('2026-07-28T18:00:00.000Z');
  saveFilm(storage, 'alpha', { title: 'Alpha', now });
  markFilmSeen(storage, 'beta', { title: 'Beta', now });
  markFilmNotInterested(storage, 'gamma', { title: 'Gamma', now });
  favoriteTheater(storage, { theaterId: 'the-beacon' }, { name: 'Beacon' });
  acceptPlan(storage, {
    provenance: 'live',
    performances: [
      {
        title: 'Alpha',
        localDate: '2026-07-28',
        localTime: '21:00',
        runtimeMin: 100,
        theaterId: 'the-beacon',
        theaterName: 'Beacon',
        source: 'beacon',
        sourceShowtimeId: 'auth-test-1',
        formatLabel: 'Digital',
      },
    ],
    now,
  });
  updateScheduleSettings(storage, { showBreaks: false });

  const before = {
    saved: storage.getItem(SAVED_FILMS_STORAGE_KEY),
    seen: storage.getItem(SEEN_FILMS_STORAGE_KEY),
    ni: storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY),
    fav: storage.getItem(FAVORITE_THEATERS_STORAGE_KEY),
    plans: storage.getItem(ACCEPTED_PLANS_STORAGE_KEY),
    schedule: storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY),
  };

  const user = mockUser();
  const client = createMockClient({ session: null });
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  await client.auth.__emit('SIGNED_IN', { user });
  await signOut({
    getClient: () => client,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
  });

  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), before.saved);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), before.seen);
  assert.equal(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY), before.ni);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), before.fav);
  assert.equal(storage.getItem(ACCEPTED_PLANS_STORAGE_KEY), before.plans);
  assert.equal(storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY), before.schedule);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getNotInterestedFilms(storage).length, 1);
  assert.equal(getFavoriteTheaters(storage).length, 1);
  assert.equal(getAcceptedPlans(storage).length, 1);
  assert.equal(getScheduleSettings(storage).showBreaks, false);

  // No cloud sync helpers exist on film/planner stores.
  const storeFiles = [
    'v2/stores/savedFilmsStore.js',
    'v2/stores/seenFilmsStore.js',
    'v2/stores/notInterestedFilmsStore.js',
    'v2/stores/favoriteTheatersStore.js',
    'v2/stores/acceptedPlansStore.js',
    'v2/stores/scheduleSettingsStore.js',
  ];
  for (const rel of storeFiles) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.equal(src.includes('supabase'), false);
    assert.equal(src.includes('signInWithGoogle'), false);
  }
});

test('Profile account UI + auth modules avoid service-role secrets', () => {
  const panel = readFileSync(
    join(ROOT, 'v2/auth/ProfileAccountPanel.jsx'),
    'utf8',
  );
  const profile = readFileSync(
    join(ROOT, 'v2/profile/ProfileDestination.jsx'),
    'utf8',
  );
  const clientSrc = readFileSync(join(ROOT, 'v2/auth/supabaseClient.js'), 'utf8');
  const appSrc = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  assert.match(panel, /Continue with Google/);
  assert.match(panel, /Sign out/);
  assert.match(panel, /not configured in this build/);
  assert.match(
    panel.replace(/\s+/g, ' '),
    /Signing in alone does not move your data/,
  );
  assert.match(panel, /Enable sync/);
  assert.match(panel, /Merge and enable sync/);
  assert.match(panel, /Enable schedule sync/);
  assert.match(panel, /Merge and enable schedule sync/);
  assert.match(panel.replace(/\s+/g, ' '), /planner drafts or calendar settings/);
  assert.match(panel, /Keep using this device only/);
  assert.match(panel, /still works/);
  assert.match(getCloudSyncStatusLabel(), /stored on this device/i);
  assert.equal(panel.toLowerCase().includes('already synced'), false);
  assert.equal(panel.toLowerCase().includes('backed up'), false);
  assert.match(profile, /ProfileAccountPanel/);
  assert.match(profile, /data-profile-section="account"/);
  assert.match(appSrc, /startAuthController/);
  assert.match(appSrc, /consumeAuthReturnToProfile/);

  const deploy = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(deploy, /VITE_SUPABASE_URL:\s*\$\{\{\s*vars\.VITE_SUPABASE_URL\s*\}\}/);
  assert.match(
    deploy,
    /VITE_SUPABASE_PUBLISHABLE_KEY:\s*\$\{\{\s*vars\.VITE_SUPABASE_PUBLISHABLE_KEY\s*\}\}/,
  );
  assert.equal(deploy.includes('SERVICE_ROLE'), false);
  const frontendRoots = ['v2', 'src', 'cockpit'];
  for (const root of frontendRoots) {
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) continue;
        const text = readFileSync(full, 'utf8');
        assert.equal(
          text.includes('SUPABASE_SERVICE_ROLE'),
          false,
          full,
        );
        assert.equal(text.includes('SERVICE_ROLE_KEY'), false, full);
      }
    };
    walk(join(ROOT, root));
  }

  assert.match(clientSrc, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(clientSrc.includes('SERVICE_ROLE'), false);
});

test('SQL migration defines profiles RLS and auth trigger', () => {
  const sql = readFileSync(
    join(ROOT, 'supabase/migrations/20260729000000_profiles_foundation.sql'),
    'utf8',
  );
  assert.match(sql, /create table if not exists public\.profiles/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\) = id/);
  assert.match(sql, /handle_new_user_profile/);
  assert.match(sql, /on delete cascade/);
});
