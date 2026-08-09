/**
 * Schedule Settings MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/My Schedule Main Page Settings Interaction.png
 * (prompt name: Schedule Settings.png). Local-only defaults. No stores.
 */

export const SCHEDULE_SETTINGS_SECTION_ORDER = Object.freeze([
  'display',
  'sync',
  'preferences',
  'about',
]);

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

/**
 * @returns {Readonly<object>}
 */
export function getScheduleSettingsMockupPresentation() {
  return SCHEDULE_SETTINGS_MOCKUP_FIXTURE;
}

/**
 * @returns {Readonly<object>}
 */
export function resolveScheduleSettingsPresentation() {
  return getScheduleSettingsMockupPresentation();
}

/** @type {Readonly<object>} */
export const SCHEDULE_SETTINGS_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  title: 'Schedule Settings',
  closeLabel: 'Close schedule settings',
  sections: Object.freeze({
    display: Object.freeze({
      id: 'display',
      title: 'DISPLAY OPTIONS',
      hideCompleted: Object.freeze({
        id: 'hide-completed',
        label: 'Hide completed plans',
        support: 'Completed showtimes will be dimmed or hidden.',
        icon: 'eye',
      }),
      showBreaks: Object.freeze({
        id: 'show-breaks',
        label: 'Show breaks',
        support: 'Display breaks and open time on the timeline.',
        icon: 'cup',
      }),
      timelineZoom: Object.freeze({
        id: 'timeline-zoom',
        label: 'Default timeline zoom',
        support: 'Choose how much of the day to show.',
        icon: 'search',
      }),
    }),
    sync: Object.freeze({
      id: 'sync',
      title: 'SYNC & INTEGRATIONS',
      calendarSync: Object.freeze({
        id: 'calendar-sync',
        label: 'Sync with calendar',
        support:
          'Ongoing sync isn’t available yet. Use Add to calendar on Film Detail for a one-time .ics download.',
        valueLabel: 'Off',
        icon: 'calendar',
        deferredMessage:
          'Calendar sync isn’t available yet. Export a one-time .ics from Film Detail instead.',
      }),
    }),
    preferences: Object.freeze({
      id: 'preferences',
      title: 'PREFERENCES',
      timeFormat: Object.freeze({
        id: 'time-format',
        label: 'Time format',
        support: '12-hour with AM/PM, or 24-hour (e.g. 1:30 PM vs 13:30).',
        icon: 'clock',
      }),
      colorCoding: Object.freeze({
        id: 'color-coding',
        label: 'Color coding',
        support:
          'Preference is saved on this device. Live schedule coloring stays deferred.',
        icon: 'palette',
        footerNote:
          'You can change this later. Genre coloring remains suppressed until reliable.',
        modes: SCHEDULE_SETTINGS_COLOR_MODES,
        legends: Object.freeze({
          opportunity: Object.freeze([
            Object.freeze({
              id: 'premium',
              swatch: 'gold',
              label: 'Premium format (IMAX, 70mm, Dolby, etc.)',
            }),
            Object.freeze({
              id: 'standard',
              swatch: 'blue',
              label: 'Standard showtime (Regular screenings)',
            }),
            Object.freeze({
              id: 'special',
              swatch: 'purple',
              label: 'Special event (Q&A, early access, marathons)',
            }),
            Object.freeze({
              id: 'personal',
              swatch: 'green',
              label: 'Personal pick (Saved or highly anticipated)',
            }),
          ]),
          theater: Object.freeze([
            Object.freeze({
              id: 'theater-note',
              swatch: 'purple',
              label: 'Each theater keeps a stable accent color.',
            }),
          ]),
          genre: Object.freeze([
            Object.freeze({
              id: 'genre-note',
              swatch: 'teal',
              label: 'Genre colors remain deferred until coverage is reliable.',
            }),
          ]),
        }),
      }),
    }),
    about: Object.freeze({
      id: 'about',
      title: 'ABOUT THIS VIEW',
      aboutSchedule: Object.freeze({
        id: 'about-my-schedule',
        label: 'About My Schedule',
        support: 'Learn more about how your schedule works.',
        icon: 'info',
      }),
      clearAll: Object.freeze({
        id: 'clear-all',
        label: 'Clear all schedule data…',
        support: 'This cannot be undone.',
        icon: 'trash',
        deferredMessage:
          'Clears accepted plans stored on this device. This cannot be undone.',
      }),
    }),
  }),
});

/** Query seam for Stage 1 QC / tests. */
export const SCHEDULE_SETTINGS_QUERY = 'scheduleSettings';

/**
 * @returns {boolean}
 */
export function isScheduleSettingsQueryOpen() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(SCHEDULE_SETTINGS_QUERY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}
