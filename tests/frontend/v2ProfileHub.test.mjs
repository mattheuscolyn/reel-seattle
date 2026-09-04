import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_MOCKUP_FIXTURE,
  PROFILE_MOCKUP_SECTION_ORDER,
  getProfileMockupPresentation,
  resolveProfilePresentation,
} from '../../v2/fixtures/profileMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
  REJECTED_PRIMARY_NAV_LABELS,
  originBackLabel,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  openTheaterDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  favoriteTheater,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
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
import { resolveLiveProfilePresentation } from '../../v2/profile/resolveLiveProfilePresentation.js';
import {
  buildYourFilmsItems,
  getProfileActivityCounts,
} from '../../v2/profile/profileActivity.js';
import { PROFILE_SETTINGS_ROWS } from '../../v2/profile/profileSettingsRows.js';
import {
  filmSyncNeedsAttention,
  scheduleSyncNeedsAttention,
} from '../../v2/profile/profileSyncAttention.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE_SRC = readFileSync(
  join(ROOT, 'v2/profile/ProfileDestination.jsx'),
  'utf8',
);
const PLACEHOLDER_SRC = readFileSync(
  join(ROOT, 'v2/DestinationPlaceholder.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/profileMockupFixture.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const HEADER_SRC = readFileSync(join(ROOT, 'v2/home/AppHeader.jsx'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');
const DEST_SRC = readFileSync(join(ROOT, 'v2/destinations.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const PANEL_SRC = readFileSync(
  join(ROOT, 'v2/auth/ProfileAccountPanel.jsx'),
  'utf8',
);
const SETTINGS_SRC = readFileSync(
  join(ROOT, 'v2/profile/profileSettingsRows.js'),
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

test('Profile fixture remains available as mockup reference only', () => {
  const p = getProfileMockupPresentation();
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p, PROFILE_MOCKUP_FIXTURE);
  assert.equal(resolveProfilePresentation(), p);
  assert.equal(p.pageTitle, 'Profile');
  assert.equal(p.identity.displayName, 'Mattheus');
  assert.deepEqual(
    p.activity.map((a) => a.value),
    [83, 27, 46, 3],
  );
  assert.deepEqual(PROFILE_MOCKUP_SECTION_ORDER, [
    'identity',
    'activity',
    'upNext',
    'membership',
    'favoriteTheaters',
    'settings',
  ]);
});

test('Profile fixture does not import stores or public data', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('localStorage'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  assert.equal(FIXTURE_SRC.includes('buildHomeData'), false);
  assert.equal(FIXTURE_SRC.includes('savedFilmsStore'), false);
  assert.equal(FIXTURE_SRC.includes('favoriteTheatersStore'), false);
});

test('compact identity renders; live presentation is not fixture Mattheus', () => {
  assert.match(PLACEHOLDER_SRC, /ProfileDestination/);
  assert.match(PROFILE_SRC, /data-profile-source/);
  assert.match(PROFILE_SRC, /resolveLiveProfilePresentation/);
  assert.match(PROFILE_SRC, /data-profile-section="identity"/);
  assert.match(PROFILE_SRC, /identity.editLabel/);
  assert.equal(PROFILE_SRC.includes('Mattheus'), false);
  assert.equal(PROFILE_SRC.includes('profileMockupFixture'), false);
  assert.equal(PLACEHOLDER_SRC.includes("destination.id === 'profile'"), true);

  const signedIn = resolveLiveProfilePresentation({
    auth: {
      status: 'signed_in',
      signedIn: true,
      user: { id: 'u', email: 'a@b.c', user_metadata: { full_name: 'Ada' } },
      profile: { display_name: 'Ada' },
    },
    storage: memoryStorage(),
  });
  assert.equal(signedIn.identity.editLabel, 'Edit profile');
  assert.equal(signedIn.identity.showEdit, true);

  const live = resolveLiveProfilePresentation({
    auth: { status: 'signed_out', user: null, profile: null },
    storage: memoryStorage(),
  });
  assert.equal(live.source, 'live');
  assert.notEqual(live.identity.displayName, 'Mattheus');
  assert.equal(live.identity.showSignIn, true);
});

test('duplicate Account identity and permanent sync card are absent', () => {
  assert.equal(PROFILE_SRC.includes('v2-profile-account-identity'), false);
  assert.equal(PROFILE_SRC.includes('Last film sync'), false);
  assert.equal(PROFILE_SRC.includes('Last schedule sync'), false);
  assert.equal(PROFILE_SRC.includes('data-profile-setting="time-format"'), false);
  assert.equal(PANEL_SRC.includes('Last film sync'), false);
  assert.equal(PANEL_SRC.includes('Last schedule sync'), false);
  assert.equal(PANEL_SRC.includes('formatSyncTime'), false);
  assert.equal(PANEL_SRC.includes('v2-profile-account-identity'), false);
  assert.match(PANEL_SRC, /variant === 'sync-attention'|variant = 'sync-attention'/);
  assert.match(PROFILE_SRC, /variant="sync-attention"/);
  assert.equal(PROFILE_SRC.includes('variant="account-security"'), false);
});

test('healthy attached sync is not exceptional; unattached and degraded are', () => {
  assert.equal(
    filmSyncNeedsAttention({
      userId: 'u1',
      attached: true,
      uiStatus: 'synced',
    }),
    false,
  );
  assert.equal(
    scheduleSyncNeedsAttention({
      userId: 'u1',
      attached: true,
      uiStatus: 'synced',
    }),
    false,
  );
  assert.equal(
    filmSyncNeedsAttention({
      userId: 'u1',
      attached: false,
      uiStatus: 'prompt',
    }),
    true,
  );
  assert.equal(
    scheduleSyncNeedsAttention({
      userId: 'u1',
      attached: false,
      uiStatus: 'prompt',
    }),
    true,
  );
  assert.equal(
    filmSyncNeedsAttention({
      userId: 'u1',
      attached: true,
      uiStatus: 'degraded',
    }),
    true,
  );
  assert.equal(filmSyncNeedsAttention({ uiStatus: 'prompt' }), false);
  assert.match(PANEL_SRC, /Finish setting up sync/);
  assert.match(PANEL_SRC, /Your film data on this browser/);
  assert.match(PANEL_SRC, /Enable sync/);
  assert.match(PANEL_SRC, /Retry film sync/);
  assert.match(PROFILE_SRC, /data-profile-section="syncAttention"|ProfileAccountPanel/);
});

test('signed-out identity still offers Continue with Google', () => {
  assert.match(PROFILE_SRC, /identity.showSignIn/);
  assert.match(PROFILE_SRC, /signInWithGoogle/);
  const live = resolveLiveProfilePresentation({
    auth: { status: 'signed_out', user: null, profile: null },
    storage: memoryStorage(),
  });
  assert.equal(live.identity.signInLabel, 'Continue with Google');
});

test('Your Films uses store counts; Plans and Activity Snapshot are gone', () => {
  assert.match(PROFILE_SRC, /data-profile-section="yourFilms"/);
  assert.match(PROFILE_SRC, /Your Films/);
  assert.equal(PROFILE_SRC.includes('Activity snapshot'), false);
  assert.equal(PROFILE_SRC.includes('Activity Snapshot'), false);
  assert.equal(PROFILE_SRC.includes('data-profile-section="activity"'), false);
  assert.equal(PROFILE_SRC.includes('data-profile-section="upNext"'), false);
  assert.equal(PROFILE_SRC.includes('data-profile-section="membership"'), false);
  assert.equal(PROFILE_SRC.includes('item.key === \'plans\''), false);

  const storage = memoryStorage();
  const now = () => new Date('2026-08-04T18:00:00.000Z');
  saveFilm(storage, 'alpha', { title: 'Alpha', now });
  saveFilm(storage, 'beta', { title: 'Beta', now });
  markFilmSeen(storage, 'gamma', { title: 'Gamma', now });
  markFilmNotInterested(storage, 'delta', { title: 'Delta', now });
  markFilmNotInterested(storage, 'epsilon', { title: 'Epsilon', now });

  const counts = getProfileActivityCounts(storage);
  assert.equal(counts.saved, 2);
  assert.equal(counts.seen, 1);
  assert.equal(counts.notInterested, 2);
  assert.equal('plans' in counts, false);

  const items = buildYourFilmsItems(storage);
  assert.deepEqual(
    items.map((item) => item.label),
    ['Saved', 'Seen', 'Not Interested'],
  );
  assert.deepEqual(
    items.map((item) => item.value),
    [2, 1, 2],
  );
  assert.deepEqual(
    items.map((item) => item.collectionId),
    [COLLECTION_IDS.saved, COLLECTION_IDS.seen, COLLECTION_IDS.hidden],
  );
});

test('Your Films cards and View all open Profile-origin collections', () => {
  assert.match(PROFILE_SRC, /originPrimary: 'profile'/);
  assert.match(PROFILE_SRC, /COLLECTION_IDS.saved/);
  assert.match(PROFILE_SRC, /item.collectionId/);
  assert.match(PROFILE_SRC, /yourFilmsSection.viewAllLabel/);
  const films = resolveLiveProfilePresentation({
    auth: { status: 'signed_out', user: null, profile: null },
    storage: memoryStorage(),
  });
  assert.equal(films.yourFilmsSection.viewAllLabel, 'View all');
  assert.match(PLACEHOLDER_SRC, /onOpenCollection/);

  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'profile');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.saved,
    originPrimary: 'profile',
  });
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.saved);
  assert.equal(resolveActivePrimaryId(nav), 'profile');

  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.seen,
    originPrimary: 'profile',
  });
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.seen);
  assert.equal(resolveActivePrimaryId(nav), 'profile');

  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.hidden,
    originPrimary: 'profile',
  });
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.hidden);
  assert.equal(resolveActivePrimaryId(nav), 'profile');

  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(resolveActivePrimaryId(nav), 'profile');
});

test('Explore-origin collections still highlight Explore', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.saved,
    originPrimary: 'explore',
  });
  assert.equal(nav.primaryDestinationId, 'explore');
  assert.equal(resolveActivePrimaryId(nav), 'explore');

  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'explore',
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
});

test('Favorite Theaters section is always present; empty CTA and cards navigate', () => {
  assert.match(PROFILE_SRC, /data-profile-section="favoriteTheaters"/);
  assert.match(PROFILE_SRC, /Favorite Theaters|favoriteTheatersSection.title/);
  assert.match(PROFILE_SRC, /emptyActionLabel/);
  assert.match(PROFILE_SRC, /COLLECTION_IDS.theaters/);
  assert.match(PROFILE_SRC, /onOpenTheaterDetail/);
  assert.match(PLACEHOLDER_SRC, /onOpenTheaterDetail/);

  const empty = resolveLiveProfilePresentation({
    auth: { status: 'signed_out', user: null, profile: null },
    storage: memoryStorage(),
  });
  assert.equal(empty.favoriteTheaters.length, 0);
  assert.equal(empty.favoriteTheatersSection.emptyActionLabel, 'Find theaters');

  const storage = memoryStorage();
  favoriteTheater(storage, 'the-beacon', {
    name: 'The Beacon',
    neighborhood: 'Columbia City',
    now: () => new Date('2026-08-04T12:00:00.000Z'),
  });
  favoriteTheater(storage, 'siff-cinema-uptown', {
    name: 'SIFF Uptown',
    now: () => new Date('2026-08-04T13:00:00.000Z'),
  });
  const filled = resolveLiveProfilePresentation({
    auth: { status: 'signed_out', user: null, profile: null },
    storage,
  });
  assert.equal(filled.favoriteTheaters.length, 2);

  let nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'profile',
  });
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  assert.equal(originBackLabel(nav.surface.originPrimary), 'Profile');
  nav = openTheaterDetail(nav, {
    theaterId: 'the-beacon',
    originPrimary: 'profile',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'theater-detail');
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  nav = navigateBack(nav);
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.theaters);
  assert.equal(resolveActivePrimaryId(nav), 'profile');

  nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  nav = openTheaterDetail(nav, {
    theaterId: 'the-beacon',
    originPrimary: 'profile',
  });
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'profile');
});

test('normal theater navigation outside Profile is unchanged', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'explore',
  });
  nav = openTheaterDetail(nav, {
    theaterId: 'the-beacon',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  nav = navigateBack(nav);
  assert.equal(nav.primaryDestinationId, 'explore');
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.theaters);
});

test('Settings root uses the final six labels; obsolete rows are gone', () => {
  assert.deepEqual(
    PROFILE_SETTINGS_ROWS.map((row) => row.label),
    [
      'Notifications & Alerts',
      'Preferences',
      'Privacy & Sharing',
      'Account & Security',
      'Calendar',
      'About Reel Seattle',
    ],
  );
  assert.equal(
    PROFILE_SETTINGS_ROWS.some((row) => row.label === 'Appearance'),
    false,
  );
  assert.equal(
    PROFILE_SETTINGS_ROWS.some((row) => row.label === 'Connected Services'),
    false,
  );
  assert.equal(
    PROFILE_SETTINGS_ROWS.some((row) => row.label === 'Privacy & Data'),
    false,
  );
  assert.equal(SETTINGS_SRC.includes('Appearance'), false);
  assert.equal(SETTINGS_SRC.includes('Connected Services'), false);
  assert.equal(SETTINGS_SRC.includes('Privacy & Data'), false);
  assert.equal(PROFILE_SRC.includes('Time format'), false);
  assert.equal(PROFILE_SRC.includes('showDataSources'), false);
});

test('Account & Security is a nested Settings destination, not an inline Profile expand', () => {
  assert.match(PROFILE_SRC, /onOpenProfileSettings/);
  assert.equal(PROFILE_SRC.includes('accountOpen'), false);
  assert.equal(PROFILE_SRC.includes('variant="account-security"'), false);
  assert.match(PANEL_SRC, /Sign out/);
  assert.match(PANEL_SRC, /Signed in with Google/);
  assert.equal(PROFILE_SRC.includes('Sign out'), false);
});

test('Friends section sits between Your Films and Favorite Theaters', () => {
  const films = PROFILE_SRC.indexOf('data-profile-section="yourFilms"');
  const friends = PROFILE_SRC.indexOf('<ProfileFriendsPreview');
  const theaters = PROFILE_SRC.indexOf('data-profile-section="favoriteTheaters"');
  assert.ok(films > 0 && friends > films && theaters > friends);
  assert.match(PROFILE_SRC, /ProfileFriendsPreview/);
  assert.equal(PROFILE_SRC.includes('Invite friends coming soon'), false);
});

test('admin TMDB row remains is_admin gated, after Settings', () => {
  assert.match(PROFILE_SRC, /profileIsAdmin\(auth\.profile\)/);
  assert.match(PROFILE_SRC, /data-profile-section="admin"/);
  assert.match(PROFILE_SRC, /TMDB Match Review/);
  const adminIdx = PROFILE_SRC.indexOf('data-profile-section="admin"');
  const settingsIdx = PROFILE_SRC.indexOf('data-profile-section="settings"');
  assert.ok(settingsIdx > 0 && adminIdx > settingsIdx);
});

test('Profile surface keeps interactive rows as buttons', () => {
  assert.match(PROFILE_SRC, /v2-profile-films-card/);
  assert.match(PROFILE_SRC, /v2-profile-settings-row/);
  assert.match(PROFILE_SRC, /type="button"/);
  assert.match(PROFILE_SRC, /aria-labelledby="v2-profile-title"/);
});

test('Profile CSS exists; header has no dead settings gear', () => {
  assert.match(CSS, /\.v2-profile\b/);
  assert.match(CSS, /\.v2-profile-films\b/);
  assert.match(CSS, /grid-template-columns: repeat\(3,/);
  assert.match(CSS, /\.v2-profile-edit\b/);
  assert.match(CSS, /\.v2-profile-settings-row\b/);
  assert.match(CSS, /\.v2-profile-sync-banner\b/);
  assert.equal(HEADER_SRC.includes('IconSettings'), false);
  assert.equal(HEADER_SRC.includes('onSettingsClick'), false);
  assert.match(HEADER_SRC, /headerMode === 'profile'/);
  assert.match(APP_SRC, /isProfilePrimary/);
});

test('four-tab nav unchanged and Profile activates correctly', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'profile');
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(nav.surface, null);
  assert.equal(resolveActivePrimaryId(nav), 'profile');
});

test('Film Detail origin behavior unchanged after Profile work', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'explore',
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
});

test('openCollection honors Profile origin without changing Home/Explore defaults', () => {
  assert.match(NAV_SRC, /originPrimary === 'profile' \? 'profile' : 'explore'/);
  assert.match(DEST_SRC, /origin === 'profile'/);

  const homeNav = openCollection(createInitialNavState(), {
    collectionId: COLLECTION_IDS.openingThisWeek,
    originPrimary: 'home',
  });
  assert.equal(homeNav.primaryDestinationId, 'explore');
  assert.equal(resolveActivePrimaryId(homeNav), 'home');
});

test('Profile activity reads stores but Profile does not mutate them', () => {
  assert.match(PROFILE_SRC, /subscribeProfileActivity|resolveLiveProfilePresentation/);
  assert.equal(PROFILE_SRC.includes('saveFilm('), false);
  assert.equal(PROFILE_SRC.includes('markFilmSeen('), false);
  assert.equal(PROFILE_SRC.includes('favoriteTheater('), false);

  const storage = memoryStorage();
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getSeenFilms(storage).length, 0);
  assert.equal(getNotInterestedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);

  saveFilm(storage, 'alpha', {
    title: 'Alpha',
    now: () => new Date('2026-08-04T12:00:00.000Z'),
  });
  assert.equal(getProfileActivityCounts(storage).saved, 1);
});

test('no unsupported account claims in Profile fixture copy', () => {
  const blob = JSON.stringify(PROFILE_MOCKUP_FIXTURE).toLowerCase();
  assert.equal(blob.includes('sign in'), false);
  assert.equal(blob.includes('log in'), false);
  assert.equal(blob.includes('password'), false);
  assert.equal(blob.includes('cloud sync'), false);
  assert.equal(blob.includes('email'), false);
});

test('Profile account panel still owns Google auth copy without store sync claims', () => {
  assert.match(PANEL_SRC, /Continue with Google/);
  assert.match(PANEL_SRC, /Sign out/);
  assert.match(PANEL_SRC, /not configured in this build/);
  assert.equal(PANEL_SRC.includes('supabase.from('), false);
  assert.match(PROFILE_SRC, /ProfileAccountPanel/);
  assert.match(PANEL_SRC, /data-profile-section="account"/);
});
