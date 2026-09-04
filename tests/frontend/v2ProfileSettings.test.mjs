import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  originBackLabel,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openProfileSettings,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { PROFILE_SETTINGS_ROWS } from '../../v2/profile/profileSettingsRows.js';
import { PROFILE_SETTINGS_COPY } from '../../v2/profile/settings/profileSettingsCopy.js';
import {
  PROFILE_SETTINGS_SECTION_IDS,
  PROFILE_SETTINGS_SECTION_LIST,
  resolveProfileSettingsSectionId,
} from '../../v2/profile/settings/profileSettingsIds.js';
import {
  EXPERIENCE_PREFERENCES_STORAGE_KEY,
  defaultExperiencePreferences,
  getExperiencePreferences,
  updateExperiencePreferences,
} from '../../v2/stores/experiencePreferencesStore.js';
import {
  getScheduleSettings,
  updateScheduleSettings,
} from '../../v2/stores/scheduleSettingsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE_SRC = readFileSync(
  join(ROOT, 'v2/profile/ProfileDestination.jsx'),
  'utf8',
);
const SETTINGS_SRC = readFileSync(
  join(ROOT, 'v2/profile/settings/ProfileSettingsSurface.jsx'),
  'utf8',
);
const COPY_SRC = readFileSync(
  join(ROOT, 'v2/profile/settings/profileSettingsCopy.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const PLACEHOLDER_SRC = readFileSync(
  join(ROOT, 'v2/DestinationPlaceholder.jsx'),
  'utf8',
);
const BROWSE_SRC = readFileSync(
  join(ROOT, 'v2/showtimes/browseFilterEngine.js'),
  'utf8',
);
const PANEL_SRC = readFileSync(
  join(ROOT, 'v2/auth/ProfileAccountPanel.jsx'),
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

test('each Profile settings row opens the matching nested section', () => {
  assert.deepEqual(
    PROFILE_SETTINGS_ROWS.map((row) => row.sectionId),
    PROFILE_SETTINGS_SECTION_LIST,
  );
  assert.match(PROFILE_SRC, /onOpenProfileSettings/);
  assert.match(PROFILE_SRC, /row.sectionId/);
  assert.equal(PROFILE_SRC.includes('announceStub'), false);
  assert.equal(PROFILE_SRC.includes('isn’t available yet'), false);
  assert.match(PLACEHOLDER_SRC, /onOpenProfileSettings/);
  assert.match(APP_SRC, /openProfileSettings/);
  assert.match(APP_SRC, /ProfileSettingsSurface/);

  let nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  for (const row of PROFILE_SETTINGS_ROWS) {
    nav = openProfileSettings(nav, {
      sectionId: row.sectionId,
      originPrimary: 'profile',
    });
    assert.equal(nav.surface.type, 'profile-settings');
    assert.equal(nav.surface.sectionId, row.sectionId);
    assert.equal(nav.primaryDestinationId, 'profile');
    assert.equal(resolveActivePrimaryId(nav), 'profile');
    assert.equal(originBackLabel(nav.surface.originPrimary), 'Profile');
  }
});

test('Profile remains active and back returns to Profile from Settings', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  nav = openProfileSettings(nav, {
    sectionId: PROFILE_SETTINGS_SECTION_IDS.preferences,
    originPrimary: 'profile',
  });
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(resolveActivePrimaryId(nav), 'profile');
});

test('unknown settings section falls back without a new routing system', () => {
  assert.equal(
    resolveProfileSettingsSectionId('not-a-section'),
    PROFILE_SETTINGS_SECTION_IDS.notifications,
  );
  const nav = openProfileSettings(createInitialNavState(), {
    sectionId: 'mystery',
    originPrimary: 'profile',
  });
  assert.equal(nav.surface.sectionId, 'notifications');
});

test('Notifications & Alerts is truthful and omits future toggles', () => {
  assert.match(SETTINGS_SRC, /data-settings-panel="notifications"/);
  assert.match(COPY_SRC, /Saved-film showtimes/);
  assert.match(COPY_SRC, /There isn’t a separate on\/off setting yet/);
  assert.equal(SETTINGS_SRC.includes('Leaving Soon'), false);
  assert.equal(SETTINGS_SRC.includes('showtime-change'), false);
  assert.equal(SETTINGS_SRC.includes('friend invitation'), false);
  assert.equal(COPY_SRC.includes('role="switch"'), false);
  assert.match(COPY_SRC, /Sign in to get notified/);
});

test('Preferences time format persists and captions/AD default to none', () => {
  assert.match(SETTINGS_SRC, /data-settings-panel="preferences"/);
  assert.match(SETTINGS_SRC, /data-settings-control="time-format"/);
  assert.match(SETTINGS_SRC, /updateScheduleSettings/);
  assert.match(SETTINGS_SRC, /data-settings-control="captions"/);
  assert.match(SETTINGS_SRC, /data-settings-control="audio-description"/);

  const storage = memoryStorage();
  assert.equal(getScheduleSettings(storage).timeFormatId, '12h');
  const updated = updateScheduleSettings(storage, { timeFormatId: '24h' });
  assert.equal(updated.ok, true);
  assert.equal(getScheduleSettings(storage).timeFormatId, '24h');

  const prefs = defaultExperiencePreferences();
  assert.equal(prefs.captionsPreference, 'none');
  assert.equal(prefs.audioDescriptionPreference, 'none');
  assert.deepEqual(getExperiencePreferences(storage), prefs);

  const next = updateExperiencePreferences(storage, {
    captionsPreference: 'prefer_open_caption',
    audioDescriptionPreference: 'prefer_audio_description',
  });
  assert.equal(next.ok, true);
  assert.equal(next.settings.captionsPreference, 'prefer_open_caption');
  assert.equal(
    next.settings.audioDescriptionPreference,
    'prefer_audio_description',
  );
  assert.ok(storage.getItem(EXPERIENCE_PREFERENCES_STORAGE_KEY));
  assert.deepEqual(getExperiencePreferences(storage), next.settings);
});

test('experience preferences do not filter Browse showtimes', () => {
  assert.equal(BROWSE_SRC.includes('experiencePreferencesStore'), false);
  assert.equal(BROWSE_SRC.includes('captionsPreference'), false);
  assert.equal(BROWSE_SRC.includes('audioDescriptionPreference'), false);
  assert.match(COPY_SRC, /does not hide other screenings/);
});

test('Privacy & Sharing explains invite-only and has no fake controls', () => {
  assert.match(SETTINGS_SRC, /data-settings-panel="privacy-sharing"/);
  assert.match(COPY_SRC, /does not offer public profile search/);
  assert.match(COPY_SRC, /Invite-only connections/);
  assert.equal(COPY_SRC.includes('Export data'), false);
  assert.equal(COPY_SRC.includes('Friends can send me plans'), false);
  assert.equal(SETTINGS_SRC.includes('public profile'), false);
});

test('Account & Security lives in the nested destination, not Profile root', () => {
  assert.match(SETTINGS_SRC, /data-settings-panel="account-security"/);
  assert.match(SETTINGS_SRC, /variant="account-security"/);
  assert.match(PANEL_SRC, /Sign out/);
  assert.match(PANEL_SRC, /Signed in with Google/);
  assert.match(PANEL_SRC, /Continue with Google/);
  assert.equal(PANEL_SRC.includes('password'), false);
  assert.equal(PANEL_SRC.includes('Delete account'), false);
  assert.equal(PROFILE_SRC.includes('accountOpen'), false);
  assert.equal(PROFILE_SRC.includes('variant="account-security"'), false);
  assert.equal(PROFILE_SRC.includes('data-profile-section="account"'), false);
});

test('Calendar explains ICS export and omits provider connections', () => {
  assert.match(SETTINGS_SRC, /data-settings-panel="calendar"/);
  assert.match(COPY_SRC, /standard \.ics calendar file/);
  assert.match(COPY_SRC, /does not connect to Google Calendar or Apple Calendar/);
  assert.equal(COPY_SRC.includes('Letterboxd'), false);
  assert.equal(SETTINGS_SRC.includes('Connect Google'), false);
});

test('About Reel Seattle renders TMDB attribution off the Profile root', () => {
  assert.match(SETTINGS_SRC, /data-settings-panel="about"/);
  assert.match(SETTINGS_SRC, /<TmdbAttribution/);
  assert.equal(PROFILE_SRC.includes('TmdbAttribution'), false);
  assert.equal(PROFILE_SRC.includes('showDataSources'), false);
  assert.equal(COPY_SRC.includes('0.0.0'), false);
  assert.equal(COPY_SRC.includes('Privacy Policy'), false);
  assert.equal(COPY_SRC.includes('Terms of Service'), false);
});

test('Profile-origin collections still work beside Settings', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.saved,
    originPrimary: 'profile',
  });
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  nav = navigateBack(nav);
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'profile',
  });
  assert.equal(resolveActivePrimaryId(nav), 'profile');
});
