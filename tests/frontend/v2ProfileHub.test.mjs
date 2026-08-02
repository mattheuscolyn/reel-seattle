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
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
} from '../../v2/stores/seenFilmsStore.js';
import {
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
} from '../../v2/stores/notInterestedFilmsStore.js';

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
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Profile fixture contains canonical mockup sections and labels', () => {
  const p = getProfileMockupPresentation();
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p, PROFILE_MOCKUP_FIXTURE);
  assert.equal(resolveProfilePresentation(), p);
  assert.equal(p.pageTitle, 'Profile');
  assert.equal(p.pageTagline, 'Your moviegoing, your way.');
  assert.equal(p.identity.displayName, 'Mattheus');
  assert.equal(p.identity.initials, 'M');
  assert.equal(p.identity.locationLabel, 'Seattle, WA');
  assert.deepEqual(
    p.activity.map((a) => a.label),
    ['Seen', 'Not interested', 'Saved', 'Plans'],
  );
  assert.deepEqual(
    p.activity.map((a) => a.value),
    [83, 27, 46, 3],
  );
  assert.equal(p.nextPlan.available, true);
  assert.ok(p.nextPlan.title.includes('Mission: Impossible'));
  assert.equal(p.membership.name, 'AMC Stubs A-List');
  assert.equal(p.favoriteTheaters.length, 3);
  assert.equal(p.settingsRows.length, 7);
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

test('Profile destination replaces placeholder copy', () => {
  assert.match(PLACEHOLDER_SRC, /ProfileDestination/);
  assert.match(PROFILE_SRC, /data-profile-source/);
  assert.match(PROFILE_SRC, /data-profile-section="identity"/);
  assert.match(PROFILE_SRC, /data-profile-section="account"/);
  assert.match(PROFILE_SRC, /data-profile-section="activity"/);
  assert.match(PROFILE_SRC, /data-profile-section="upNext"/);
  assert.match(PROFILE_SRC, /data-profile-section="membership"/);
  assert.match(PROFILE_SRC, /data-profile-section="favoriteTheaters"/);
  assert.match(PROFILE_SRC, /data-profile-section="settings"/);
  assert.equal(PROFILE_SRC.includes('v2 shell · placeholder'), false);
  assert.equal(PLACEHOLDER_SRC.includes("destination.id === 'profile'"), true);
});

test('Profile surface keeps interactive rows as buttons', () => {
  assert.match(PROFILE_SRC, /v2-profile-activity-card/);
  assert.match(PROFILE_SRC, /v2-profile-plan-card/);
  assert.match(PROFILE_SRC, /v2-profile-settings-row/);
  assert.match(PROFILE_SRC, /type="button"/);
  assert.match(PROFILE_SRC, /aria-labelledby="v2-profile-title"/);
  assert.match(PROFILE_SRC, /aria-hidden="true"/);
});

test('Profile CSS and header gear exist', () => {
  assert.match(CSS, /\.v2-profile\b/);
  assert.match(CSS, /\.v2-profile-activity\b/);
  assert.match(CSS, /\.v2-profile-plan-card\b/);
  assert.match(CSS, /\.v2-profile-theaters\b/);
  assert.match(CSS, /\.v2-profile-settings-row\b/);
  assert.match(HEADER_SRC, /IconSettings/);
  assert.match(HEADER_SRC, /headerMode === 'profile'/);
  assert.match(APP_SRC, /headerMode=\{/);
  assert.match(APP_SRC, /isProfilePrimary/);
  assert.match(APP_SRC, /'profile'/);
});

test('four-tab nav unchanged and Profile activates correctly', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  assert.equal(PRIMARY_DESTINATIONS.length, 4);
  for (const rejected of REJECTED_PRIMARY_NAV_LABELS) {
    assert.equal(
      PRIMARY_DESTINATIONS.some((d) => d.label === rejected),
      false,
    );
  }
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'profile');
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(nav.surface, null);
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'profile',
  );
});

test('Film Detail origin behavior unchanged after Profile work', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'explore',
  });
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'explore',
  );
});

test('Profile interactions must not mutate production stores', () => {
  assert.equal(PROFILE_SRC.includes('getSavedFilms'), false);
  assert.equal(PROFILE_SRC.includes('getSeenFilms'), false);
  assert.equal(PROFILE_SRC.includes('getNotInterestedFilms'), false);
  assert.equal(PROFILE_SRC.includes('getFavoriteTheaters'), false);
  assert.equal(PROFILE_SRC.includes('localStorage'), false);
  assert.equal(PROFILE_SRC.includes('savedFilmsStore'), false);
  assert.equal(PROFILE_SRC.includes('favoriteTheatersStore'), false);

  const storage = memoryStorage();
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getSeenFilms(storage).length, 0);
  assert.equal(getNotInterestedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
});

test('no unsupported account claims in Profile fixture copy', () => {
  // Fixture identity remains Stage 1 mockup copy; live auth lives in ProfileAccountPanel.
  const blob = JSON.stringify(PROFILE_MOCKUP_FIXTURE).toLowerCase();
  assert.equal(blob.includes('sign in'), false);
  assert.equal(blob.includes('log in'), false);
  assert.equal(blob.includes('password'), false);
  assert.equal(blob.includes('cloud sync'), false);
  assert.equal(blob.includes('email'), false);
});

test('Profile account panel wires Google auth without store sync claims', () => {
  const panel = readFileSync(
    join(ROOT, 'v2/auth/ProfileAccountPanel.jsx'),
    'utf8',
  );
  assert.match(panel, /Continue with Google/);
  assert.match(panel, /Sign out/);
  assert.match(panel, /not configured in this build/);
  assert.equal(panel.includes('supabase.from('), false);
  assert.match(PROFILE_SRC, /ProfileAccountPanel/);
});
