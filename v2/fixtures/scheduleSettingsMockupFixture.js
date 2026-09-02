/**
 * Schedule display preference constants (T-SCH-01 / WS-SETT).
 *
 * Shared by `scheduleSettingsStore` and Profile time-format UI.
 * Legacy Schedule Settings sheet removed; Planner uses the store directly.
 */

export const SCHEDULE_SETTINGS_TIME_FORMATS = Object.freeze([
  Object.freeze({ id: '12h', label: '12-hour' }),
  Object.freeze({ id: '24h', label: '24-hour' }),
]);

export const SCHEDULE_SETTINGS_ZOOM_OPTIONS = Object.freeze([
  Object.freeze({ id: '12-24', label: '12 PM – 12 AM' }),
  Object.freeze({ id: '10-22', label: '10 AM – 10 PM' }),
  Object.freeze({ id: 'full', label: 'All day' }),
]);

export const SCHEDULE_SETTINGS_COLOR_MODES = Object.freeze([
  Object.freeze({
    id: 'opportunity',
    title: 'By opportunity type',
    badge: 'Recommended',
    support: null,
    preview: 'opportunity',
  }),
  Object.freeze({
    id: 'theater',
    title: 'By theater',
    badge: null,
    support: 'Each theater has its own color.',
    preview: 'theater',
  }),
  Object.freeze({
    id: 'genre',
    title: 'By genre',
    badge: null,
    support: 'Colors reflect movie genre.',
    preview: 'genre',
  }),
]);

/**
 * @returns {{
 *   hideCompleted: boolean,
 *   showBreaks: boolean,
 *   timelineZoomId: string,
 *   timeFormatId: string,
 *   colorCodingId: string,
 * }}
 */
export function createScheduleSettingsUiState(overrides = {}) {
  return {
    hideCompleted: true,
    showBreaks: true,
    timelineZoomId: '12-24',
    timeFormatId: '12h',
    colorCodingId: 'opportunity',
    ...overrides,
  };
}

/**
 * @param {string} zoomId
 * @returns {string}
 */
export function resolveTimelineZoomLabel(zoomId) {
  const match = SCHEDULE_SETTINGS_ZOOM_OPTIONS.find((o) => o.id === zoomId);
  return match?.label ?? SCHEDULE_SETTINGS_ZOOM_OPTIONS[0].label;
}

/**
 * @param {string} currentId
 * @returns {string}
 */
export function cycleTimelineZoomId(currentId) {
  const ids = SCHEDULE_SETTINGS_ZOOM_OPTIONS.map((o) => o.id);
  const index = ids.indexOf(currentId);
  const next = index < 0 ? 0 : (index + 1) % ids.length;
  return ids[next];
}
