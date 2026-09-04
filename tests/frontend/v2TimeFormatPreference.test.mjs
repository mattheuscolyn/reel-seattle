import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEDULE_SETTINGS_TIME_FORMATS,
  createScheduleSettingsUiState,
} from '../../v2/fixtures/scheduleSettingsMockupFixture.js';
import {
  SCHEDULE_SETTINGS_STORAGE_KEY,
  formatDisplayClock,
  formatScheduleClock,
  getScheduleSettings,
  parseClockToMinutes,
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
const BUILD_PLAN_SRC = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanSurface.jsx'),
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

test('default time format preference is 12-hour AM/PM', () => {
  const ui = createScheduleSettingsUiState();
  assert.equal(ui.timeFormatId, '12h');
  assert.equal(getScheduleSettings(memoryStorage()).timeFormatId, '12h');
  assert.deepEqual(
    SCHEDULE_SETTINGS_TIME_FORMATS.map((o) => o.id),
    ['12h', '24h'],
  );
  assert.equal(
    SCHEDULE_SETTINGS_TIME_FORMATS.find((o) => o.id === '12h')?.label,
    '12-hour',
  );
  assert.equal(
    SCHEDULE_SETTINGS_TIME_FORMATS.find((o) => o.id === '24h')?.label,
    '24-hour',
  );
});

test('formatDisplayClock covers morning, noon, afternoon, and midnight', () => {
  assert.equal(formatDisplayClock('10:30', '12h'), '10:30 AM');
  assert.equal(formatDisplayClock('13:30', '12h'), '1:30 PM');
  assert.equal(formatDisplayClock('16:30', '12h'), '4:30 PM');
  assert.equal(formatDisplayClock('00:30', '12h'), '12:30 AM');
  assert.equal(formatDisplayClock('12:00', '12h'), '12:00 PM');
  assert.equal(formatDisplayClock('13:05', '12h'), '1:05 PM');
  assert.equal(formatDisplayClock('1:00PM', '12h'), '1:00 PM');
  assert.equal(formatDisplayClock(780, '12h'), '1:00 PM');

  assert.equal(formatDisplayClock('10:30', '24h'), '10:30');
  assert.equal(formatDisplayClock('13:30', '24h'), '13:30');
  assert.equal(formatDisplayClock('00:30', '24h'), '00:30');
  assert.equal(formatDisplayClock('12:00', '24h'), '12:00');
  assert.equal(formatScheduleClock(0, '24h'), '00:00');
});

test('parseClockToMinutes accepts HH:MM and AM/PM forms', () => {
  assert.equal(parseClockToMinutes('00:30'), 30);
  assert.equal(parseClockToMinutes('12:00'), 720);
  assert.equal(parseClockToMinutes('12:00 PM'), 720);
  assert.equal(parseClockToMinutes('12:30 AM'), 30);
  assert.equal(parseClockToMinutes('1:05 PM'), 13 * 60 + 5);
  assert.equal(parseClockToMinutes('13:05'), 13 * 60 + 5);
});

test('time format preference persists across rehydration', () => {
  const storage = memoryStorage();
  const updated = updateScheduleSettings(storage, { timeFormatId: '24h' });
  assert.equal(updated.ok, true);
  assert.equal(updated.settings.timeFormatId, '24h');
  assert.ok(storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY));

  // Fresh read from the same storage simulates reload.
  assert.equal(getScheduleSettings(storage).timeFormatId, '24h');

  const back = updateScheduleSettings(storage, { timeFormatId: '12h' });
  assert.equal(back.settings.timeFormatId, '12h');
  assert.equal(getScheduleSettings(storage).timeFormatId, '12h');
});

test('Profile no longer exposes Time format on the Profile root', () => {
  assert.equal(PROFILE_SRC.includes('data-profile-setting="time-format"'), false);
  assert.equal(PROFILE_SRC.includes('Time format'), false);
  assert.equal(PROFILE_SRC.includes('updateScheduleSettings'), false);
  assert.equal(PROFILE_SRC.includes('SCHEDULE_SETTINGS_TIME_FORMATS'), false);
});

test('Preferences Settings destination owns the working time-format control', () => {
  assert.match(SETTINGS_SRC, /data-settings-control="time-format"/);
  assert.match(SETTINGS_SRC, /updateScheduleSettings/);
  assert.match(SETTINGS_SRC, /SCHEDULE_SETTINGS_TIME_FORMATS/);
});

test('Build a Plan JSX order is When → Where → What → Fine tuning', () => {
  const ids = [...BUILD_PLAN_SRC.matchAll(/renderAccordion\(\s*'(\w+)'/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(ids, ['when', 'where', 'what', 'fineTuning']);
});
