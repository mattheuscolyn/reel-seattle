import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emailLocalPart,
  initialsFromDisplayName,
  normalizeEditableDisplayName,
  PROFILE_GENERIC_DISPLAY_NAME,
  resolveProfileAvatarUrl,
  resolveProfileDisplayName,
} from '../../v2/auth/profileIdentity.js';
import {
  refreshOwnProfile,
  updateOwnDisplayName,
} from '../../v2/auth/profileData.js';
import {
  getAuthState,
  resetAuthControllerForTests,
  setAuthProfilePatch,
  startAuthController,
  stopAuthController,
} from '../../v2/auth/authSessionStore.js';
import {
  getProfileActivityCounts,
  buildYourFilmsItems,
} from '../../v2/profile/profileActivity.js';
import { resolveLiveProfilePresentation } from '../../v2/profile/resolveLiveProfilePresentation.js';
import {
  saveFilm,
  SAVED_FILMS_STORAGE_KEY,
} from '../../v2/stores/savedFilmsStore.js';
import {
  markFilmSeen,
  SEEN_FILMS_STORAGE_KEY,
} from '../../v2/stores/seenFilmsStore.js';
import {
  markFilmNotInterested,
  NOT_INTERESTED_FILMS_STORAGE_KEY,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE_SRC = readFileSync(
  join(ROOT, 'v2/profile/ProfileDestination.jsx'),
  'utf8',
);
const DIST_JS_HINT = readFileSync(
  join(ROOT, 'v2/auth/profileData.js'),
  'utf8',
);

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
    id: 'user-a',
    email: 'ada@example.com',
    user_metadata: {},
    ...overrides,
  };
}

test('identity precedence: profile → full_name → name → email local → generic', () => {
  assert.equal(
    resolveProfileDisplayName(
      mockUser({ user_metadata: { full_name: 'Meta Full' } }),
      { display_name: 'Custom' },
    ),
    'Custom',
  );
  assert.equal(
    resolveProfileDisplayName(
      mockUser({ user_metadata: { full_name: 'Meta Full', name: 'Meta' } }),
      null,
    ),
    'Meta Full',
  );
  assert.equal(
    resolveProfileDisplayName(
      mockUser({ user_metadata: { name: 'Just Name' } }),
      { display_name: '   ' },
    ),
    'Just Name',
  );
  assert.equal(
    resolveProfileDisplayName(
      mockUser({ email: 'local.part@example.com', user_metadata: {} }),
      null,
    ),
    'local.part',
  );
  assert.equal(emailLocalPart('local.part@example.com'), 'local.part');
  assert.equal(
    resolveProfileDisplayName(mockUser({ email: '', user_metadata: {} }), null),
    PROFILE_GENERIC_DISPLAY_NAME,
  );
  assert.equal(resolveProfileDisplayName(null, null), PROFILE_GENERIC_DISPLAY_NAME);
  assert.notEqual(resolveProfileDisplayName(null, null), 'Mattheus');
});

test('avatar precedence: profile → metadata avatar_url → picture; https only', () => {
  assert.equal(
    resolveProfileAvatarUrl(
      { avatar_url: 'https://cdn.example/profile.png' },
      mockUser({
        user_metadata: { picture: 'https://cdn.example/google.png' },
      }),
    ),
    'https://cdn.example/profile.png',
  );
  assert.equal(
    resolveProfileAvatarUrl(
      null,
      mockUser({
        user_metadata: { avatar_url: 'https://cdn.example/a.png' },
      }),
    ),
    'https://cdn.example/a.png',
  );
  assert.equal(
    resolveProfileAvatarUrl(
      null,
      mockUser({
        user_metadata: { picture: 'https://lh3.googleusercontent.com/x' },
      }),
    ),
    'https://lh3.googleusercontent.com/x',
  );
  assert.equal(
    resolveProfileAvatarUrl({ avatar_url: 'http://insecure.example/a.png' }, null),
    null,
  );
  assert.equal(initialsFromDisplayName('Ada Lovelace'), 'AL');
  assert.equal(initialsFromDisplayName(''), '?');
});

test('editable display name validation', () => {
  assert.deepEqual(normalizeEditableDisplayName('  Ada  '), {
    ok: true,
    value: 'Ada',
  });
  assert.deepEqual(normalizeEditableDisplayName('   '), {
    ok: true,
    value: null,
  });
  assert.equal(normalizeEditableDisplayName('x'.repeat(81)).ok, false);
});

test('signed-out live presentation has no Mattheus / mock email', () => {
  const p = resolveLiveProfilePresentation({
    auth: { status: 'signed_out', user: null, profile: null },
    storage: memoryStorage(),
  });
  assert.equal(p.source, 'live');
  assert.equal(p.identity.mode, 'signed_out');
  assert.notEqual(p.identity.displayName, 'Mattheus');
  assert.equal(p.identity.email, null);
  assert.equal(p.identity.avatarUrl, null);
  assert.match(p.identity.secondaryLabel ?? '', /Sign in to sync/i);
  assert.equal(p.yourFilms.length, 3);
  assert.deepEqual(
    p.yourFilms.map((a) => a.value),
    [0, 0, 0],
  );
  assert.equal('membership' in p, false);
  assert.equal('activity' in p, false);
  assert.equal('nextPlan' in p, false);
  assert.equal(PROFILE_SRC.includes('Mattheus'), false);
});

test('signed-in live presentation uses auth email and profile override', () => {
  const p = resolveLiveProfilePresentation({
    auth: {
      status: 'signed_in',
      signedIn: true,
      user: mockUser({
        email: 'real@example.com',
        user_metadata: { full_name: 'Google Name' },
      }),
      profile: { display_name: 'Reel Name', avatar_url: null },
      profileStatus: 'ready',
    },
    storage: memoryStorage(),
  });
  assert.equal(p.identity.mode, 'signed_in');
  assert.equal(p.identity.displayName, 'Reel Name');
  assert.equal(p.identity.email, 'real@example.com');
  assert.equal(p.identity.secondaryLabel, 'real@example.com');
  assert.equal(p.identity.showEdit, true);
  assert.equal(p.identity.initials, 'RN');
});

test('auth loading presentation does not flash prior identity', () => {
  const p = resolveLiveProfilePresentation({
    auth: { status: 'loading', user: null, profile: null },
    storage: memoryStorage(),
  });
  assert.equal(p.identity.mode, 'loading');
  assert.equal(p.identity.displayName, null);
  assert.equal(p.identity.email, null);
});

test('Your Films counts come from stores, not fixtures', () => {
  const storage = memoryStorage();
  const now = () => new Date('2026-08-04T18:00:00.000Z');
  saveFilm(storage, 'alpha', { title: 'Alpha', now });
  saveFilm(storage, 'beta', { title: 'Beta', now });
  markFilmSeen(storage, 'gamma', { title: 'Gamma', now });
  markFilmNotInterested(storage, 'delta', { title: 'Delta', now });
  markFilmNotInterested(storage, 'epsilon', { title: 'Epsilon', now });
  markFilmNotInterested(storage, 'zeta', { title: 'Zeta', now });

  const counts = getProfileActivityCounts(storage);
  assert.deepEqual(counts, {
    seen: 1,
    notInterested: 3,
    saved: 2,
    favoriteTheaters: 0,
  });
  assert.deepEqual(
    buildYourFilmsItems(storage).map((a) => a.value),
    [2, 1, 3],
  );
  assert.deepEqual(
    buildYourFilmsItems(storage).map((a) => a.label),
    ['Saved', 'Seen', 'Not Interested'],
  );
  assert.notDeepEqual(
    buildYourFilmsItems(storage).map((a) => a.value),
    [83, 27, 46, 3],
  );
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY));
});

test('updateOwnDisplayName requires session and rejects other-user ids', async () => {
  resetAuthControllerForTests();
  const result = await updateOwnDisplayName('Nope');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'signed_out');

  const updates = [];
  const client = {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        update(payload) {
          updates.push(payload);
          return {
            eq(col, id) {
              assert.equal(col, 'id');
              assert.equal(id, 'user-a');
              return {
                select() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: 'user-a',
                        display_name: payload.display_name,
                        avatar_url: null,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        upsert() {
          assert.fail('should update existing row');
        },
      };
    },
  };

  // Seed signed-in auth state without starting full controller.
  setAuthProfilePatch({
    profile: { id: 'user-a', display_name: 'Old', avatar_url: null },
    profileStatus: 'ready',
  });
  // Manually patch signed-in user via startAuthController mock.
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => ({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: mockUser({ id: 'user-a', email: 'a@example.com' }),
            },
          },
          error: null,
        }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
        signOut: async () => ({ error: null }),
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: 'user-a',
                      display_name: 'Old',
                      avatar_url: null,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          upsert() {
            return {
              select() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      },
    }),
  });

  const saved = await updateOwnDisplayName('New Name', { client });
  assert.equal(saved.ok, true);
  assert.equal(getAuthState().profile?.display_name, 'New Name');
  assert.deepEqual(updates, [{ display_name: 'New Name' }]);

  const cleared = await updateOwnDisplayName('   ', { client });
  assert.equal(cleared.ok, true);
  assert.equal(getAuthState().profile?.display_name, null);

  stopAuthController();
});

test('refreshOwnProfile ignores stale generation after logout', async () => {
  resetAuthControllerForTests();
  let hangNext = false;
  /** @type {((value: object) => void) | null} */
  let resolveHang = null;

  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: { user: mockUser({ id: 'user-a' }) },
        },
        error: null,
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => {
                  if (hangNext) {
                    return new Promise((resolve) => {
                      resolveHang = resolve;
                    });
                  }
                  return Promise.resolve({
                    data: {
                      id: 'user-a',
                      display_name: 'Initial',
                      avatar_url: null,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        },
        upsert() {
          return { error: null };
        },
      };
    },
  };

  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => client,
  });
  assert.equal(getAuthState().profile?.display_name, 'Initial');

  hangNext = true;
  const inflight = refreshOwnProfile({ client });
  stopAuthController();
  assert.ok(resolveHang);
  resolveHang({
    data: { id: 'user-a', display_name: 'Should Not Stick', avatar_url: null },
    error: null,
  });
  const result = await inflight;
  assert.equal(result.reason, 'stale');
  assert.equal(getAuthState().profile, null);
});

test('profile modules never accept arbitrary user ids from callers', () => {
  assert.match(DIST_JS_HINT, /const userId = user\.id/);
  assert.equal(/updateOwnDisplayName\([^)]*userId/.test(DIST_JS_HINT), false);
  assert.equal(PROFILE_SRC.includes('service_role'), false);
  assert.match(PROFILE_SRC, /resolveLiveProfilePresentation/);
  assert.match(PROFILE_SRC, /updateOwnDisplayName/);
  assert.equal(PROFILE_SRC.includes('profileMockupFixture'), false);
});

test('failed update restores prior profile value', async () => {
  resetAuthControllerForTests();
  await startAuthController({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    },
    getClient: () => ({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: mockUser({ id: 'user-a' }),
            },
          },
          error: null,
        }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: 'user-a',
                      display_name: 'Keep Me',
                      avatar_url: null,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          upsert() {
            return {
              select() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      },
    }),
  });

  assert.equal(getAuthState().profile?.display_name, 'Keep Me');

  const failed = await updateOwnDisplayName('Broken', {
    client: {
      from() {
        return {
          update() {
            return {
              eq() {
                return {
                  select() {
                    return {
                      maybeSingle: async () => ({
                        data: null,
                        error: { message: 'rls' },
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(getAuthState().profile?.display_name, 'Keep Me');
  stopAuthController();
});
