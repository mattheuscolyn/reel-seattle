/**
 * Versioned Schedule Settings store (T-SCH-01 / WS-SETT).
 *
 * Device-local display preferences for My Schedule. Distinct from
 * accepted plans, film stores, and calendar sync. Not synced to accounts.
 *
 * Working: hideCompleted, showBreaks, timelineZoom, timeFormat.
 * Color coding is persisted for UI continuity but does not drive event
 * coloring yet (genre color suppressed per roadmap).
 * Calendar sync remains deferred (Off).
 */

import {
  createScheduleSettingsUiState,
  SCHEDULE_SETTINGS_ZOOM_OPTIONS,
  SCHEDULE_SETTINGS_TIME_FORMATS,
  SCHEDULE_SETTINGS_COLOR_MODES,
} from '../fixtures/scheduleSettingsMockupFixture.js';

export const SCHEDULE_SETTINGS_STORAGE_KEY = 'reel-seattle.v2.scheduleSettings';
export const SCHEDULE_SETTINGS_VERSION = 1;

/**
 * @typedef {{
 *   hideCompleted: boolean,
 *   showBreaks: boolean,
 *   timelineZoomId: string,
 *   timeFormatId: string,
 *   colorCodingId: string,
 * }} ScheduleSettingsState
 */

/**
 * @typedef {{
 *   version: number,
 *   settings: ScheduleSettingsState,
 * }} ScheduleSettingsStorePayload
 */

/**
 * @returns {ScheduleSettingsState}
 */
export function defaultScheduleSettings() {
  return createScheduleSettingsUiState();
}

/**
 * @returns {ScheduleSettingsStorePayload}
 */
export function emptyScheduleSettingsStore() {
  return {
    version: SCHEDULE_SETTINGS_VERSION,
    settings: defaultScheduleSettings(),
  };
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} raw
 * @returns {ScheduleSettingsState}
 */
export function normalizeScheduleSettings(raw) {
  const base = defaultScheduleSettings();
  if (!raw || typeof raw !== 'object') return base;

  const zoomIds = SCHEDULE_SETTINGS_ZOOM_OPTIONS.map((o) => o.id);
  const timeIds = SCHEDULE_SETTINGS_TIME_FORMATS.map((o) => o.id);
  const colorIds = SCHEDULE_SETTINGS_COLOR_MODES.map((o) => o.id);

  const zoom = asTrimmed(/** @type {object} */ (raw).timelineZoomId);
  const time = asTrimmed(/** @type {object} */ (raw).timeFormatId);
  const color = asTrimmed(/** @type {object} */ (raw).colorCodingId);

  return {
    hideCompleted:
      typeof /** @type {object} */ (raw).hideCompleted === 'boolean'
        ? /** @type {object} */ (raw).hideCompleted
        : base.hideCompleted,
    showBreaks:
      typeof /** @type {object} */ (raw).showBreaks === 'boolean'
        ? /** @type {object} */ (raw).showBreaks
        : base.showBreaks,
    timelineZoomId: zoom && zoomIds.includes(zoom) ? zoom : base.timelineZoomId,
    timeFormatId: time && timeIds.includes(time) ? time : base.timeFormatId,
    colorCodingId:
      color && colorIds.includes(color) ? color : base.colorCodingId,
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {{
 *   store: ScheduleSettingsStorePayload,
 *   status: 'ok' | 'empty' | 'corrupt' | 'unsupported_version' | 'storage_unavailable',
 *   error?: string | null,
 * }}
 */
export function readScheduleSettingsStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      store: emptyScheduleSettingsStore(),
      status: 'storage_unavailable',
      error: 'storage_unavailable',
    };
  }
  let raw;
  try {
    raw = storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY);
  } catch {
    return {
      store: emptyScheduleSettingsStore(),
      status: 'storage_unavailable',
      error: 'storage_read_failed',
    };
  }
  if (raw == null || raw === '') {
    return { store: emptyScheduleSettingsStore(), status: 'empty' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {
        store: emptyScheduleSettingsStore(),
        status: 'corrupt',
        error: 'invalid_json_shape',
      };
    }
    const version = Number(parsed.version);
    if (!Number.isInteger(version) || version < 1) {
      return {
        store: emptyScheduleSettingsStore(),
        status: 'corrupt',
        error: 'invalid_version',
      };
    }
    if (version > SCHEDULE_SETTINGS_VERSION) {
      return {
        store: emptyScheduleSettingsStore(),
        status: 'unsupported_version',
        error: 'unsupported_version',
      };
    }
    return {
      store: {
        version: SCHEDULE_SETTINGS_VERSION,
        settings: normalizeScheduleSettings(parsed.settings ?? parsed),
      },
      status: 'ok',
    };
  } catch {
    return {
      store: emptyScheduleSettingsStore(),
      status: 'corrupt',
      error: 'json_parse_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {ScheduleSettingsState}
 */
export function getScheduleSettings(storage) {
  return readScheduleSettingsStore(storage).store.settings;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {ScheduleSettingsStorePayload} store
 * @returns {{ ok: boolean, error?: string | null }}
 */
function writeStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: 'storage_unavailable' };
  }
  try {
    storage.setItem(SCHEDULE_SETTINGS_STORAGE_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false, error: 'storage_write_failed' };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {Partial<ScheduleSettingsState>} patch
 */
export function updateScheduleSettings(storage, patch) {
  const read = readScheduleSettingsStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: 'unsupported_version',
      changed: false,
      settings: read.store.settings,
    };
  }
  const nextSettings = normalizeScheduleSettings({
    ...read.store.settings,
    ...patch,
  });
  const nextStore = {
    version: SCHEDULE_SETTINGS_VERSION,
    settings: nextSettings,
  };
  const changed =
    JSON.stringify(nextSettings) !== JSON.stringify(read.store.settings);
  if (!changed) {
    return {
      ok: true,
      store: read.store,
      error: null,
      changed: false,
      settings: nextSettings,
    };
  }
  const written = writeStore(storage, nextStore);
  return {
    ok: written.ok,
    store: written.ok ? nextStore : read.store,
    error: written.error ?? null,
    changed: written.ok,
    settings: written.ok ? nextSettings : read.store.settings,
  };
}

/**
 * Timeline range for Week view from zoom id.
 * @param {string} zoomId
 * @returns {{ startMinutes: number, endMinutes: number }}
 */
export function timelineRangeFromZoomId(zoomId) {
  switch (zoomId) {
    case '10-22':
      return { startMinutes: 10 * 60, endMinutes: 22 * 60 };
    case 'full':
      return { startMinutes: 0, endMinutes: 24 * 60 };
    case '12-24':
    default:
      return { startMinutes: 12 * 60, endMinutes: 24 * 60 };
  }
}

/**
 * @param {{ startMinutes: number, endMinutes: number }} range
 * @param {'12h' | '24h' | string} timeFormatId
 * @returns {string[]}
 */
export function timelineRulerLabelsForRange(range, timeFormatId = '12h') {
  const span = range.endMinutes - range.startMinutes;
  const steps = span <= 12 * 60 ? 6 : span <= 14 * 60 ? 7 : 8;
  /** @type {string[]} */
  const labels = [];
  for (let i = 0; i < steps; i += 1) {
    const minutes = Math.round(
      range.startMinutes + (span * i) / Math.max(1, steps - 1),
    );
    labels.push(formatScheduleClock(minutes, timeFormatId));
  }
  return labels;
}

/**
 * @param {number} minutes
 * @param {'12h' | '24h' | string} timeFormatId
 */
export function formatScheduleClock(minutes, timeFormatId = '12h') {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const within = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(within / 60);
  const m = within % 60;
  const mm = String(m).padStart(2, '0');
  if (timeFormatId === '24h') {
    return `${String(h24).padStart(2, '0')}:${mm}`;
  }
  let h = h24 % 12;
  if (h === 0) h = 12;
  const period = h24 >= 12 ? 'PM' : 'AM';
  return `${h}:${mm} ${period}`;
}
