/**
 * Stage 1 My Schedule — Month View MOCKUP FIXTURE — fixture-backed replica
 * of My Schedule Main Page Month Selected.png.
 *
 * Local-only presentation model. No stores, no production schedule queries.
 */

function thumbSvg(title, from, to) {
  const safe = String(title).replace(/[<>&']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72" viewBox="0 0 120 72">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="120" height="72" fill="url(#g)"/>
  <text x="8" y="64" fill="#f5f5f7" font-family="Georgia, serif" font-size="10">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function heatLevelFromMovieCount(movieCount) {
  if (!Number.isFinite(movieCount) || movieCount <= 0) return 0;
  if (movieCount >= 4) return 4;
  return movieCount;
}

export function dotCountFromMovieCount(movieCount) {
  const lvl = heatLevelFromMovieCount(movieCount);
  if (lvl === 0) return 0;
  if (lvl === 4) return 4;
  return lvl;
}

function heatCell({ id, weekdayLabel, dateNumber, movieCount, selected }) {
  const heatLevel = heatLevelFromMovieCount(movieCount);
  const dots = dotCountFromMovieCount(movieCount);
  return Object.freeze({
    id,
    weekdayLabel,
    dateNumber,
    movieCount,
    heatLevel,
    dots,
    selected: Boolean(selected),
  });
}

const MONTH_JULY = Object.freeze({
  monthLabel: 'July 2026',
  title: 'My Schedule',
  tagline: 'Your movie plans at a glance.',
  viewToggle: Object.freeze({
    weekLabel: 'Week',
    monthLabel: 'Month',
  }),
  searchLabel: 'Search',
  settingsLabel: 'Schedule settings',
  view: 'month',
  heatmapDescription:
    'Heatmap of your scheduled movie activity per day. Each cell shows a date and a dot count (not color-only).',
  heatmapLabel: 'July at a glance',
  atAGlanceStats: Object.freeze([
    Object.freeze({ id: 'movie-days', label: 'movie days', value: '8' }),
    Object.freeze({ id: 'films', label: 'films', value: '11' }),
    Object.freeze({ id: 'runtime', label: 'total runtime', value: '23h 45m' }),
    Object.freeze({
      id: 'double-features',
      label: 'double features',
      value: '3',
    }),
    Object.freeze({
      id: 'theaters-visited',
      label: 'theaters visited',
      value: '5',
    }),
  ]),
  viewInsightsLabel: 'View insights',
  prevMonthLabel: 'Previous month',
  nextMonthLabel: 'Next month',
  todayButtonLabel: 'Today',
  heatmapWeekdays: Object.freeze(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  legend: Object.freeze([
    Object.freeze({ id: 'none', label: 'No plans', movieCount: 0 }),
    Object.freeze({ id: 'one', label: '1 movie', movieCount: 1 }),
    Object.freeze({ id: 'two', label: '2 movies', movieCount: 2 }),
    Object.freeze({ id: 'three', label: '3 movies', movieCount: 3 }),
    Object.freeze({ id: 'four-plus', label: '4+ movies', movieCount: 4 }),
  ]),
  // 5 weeks × 7 columns. Dates outside July use empty cells (no plans).
  //
  // NOTE: Weekday labels are fixture copy to match the mockup; they are not
  // derived from real calendar math in Stage 1.
  heatmapGrid: Object.freeze([
    heatCell({ id: 'mon-jun-29', weekdayLabel: 'MON', dateNumber: 29, movieCount: 0 }),
    heatCell({ id: 'tue-jun-30', weekdayLabel: 'TUE', dateNumber: 30, movieCount: 0 }),
    heatCell({ id: 'wed-jul-1', weekdayLabel: 'WED', dateNumber: 1, movieCount: 0 }),
    heatCell({ id: 'thu-jul-2', weekdayLabel: 'THU', dateNumber: 2, movieCount: 0 }),
    heatCell({ id: 'fri-jul-3', weekdayLabel: 'FRI', dateNumber: 3, movieCount: 0 }),
    heatCell({ id: 'sat-jul-4', weekdayLabel: 'SAT', dateNumber: 4, movieCount: 0 }),
    heatCell({ id: 'sun-jul-5', weekdayLabel: 'SUN', dateNumber: 5, movieCount: 1 }),

    heatCell({ id: 'mon-jul-6', weekdayLabel: 'MON', dateNumber: 6, movieCount: 0 }),
    heatCell({ id: 'tue-jul-7', weekdayLabel: 'TUE', dateNumber: 7, movieCount: 0 }),
    heatCell({ id: 'wed-jul-8', weekdayLabel: 'WED', dateNumber: 8, movieCount: 1 }),
    heatCell({ id: 'thu-jul-9', weekdayLabel: 'THU', dateNumber: 9, movieCount: 0 }),
    heatCell({ id: 'fri-jul-10', weekdayLabel: 'FRI', dateNumber: 10, movieCount: 1 }),
    heatCell({ id: 'sat-jul-11', weekdayLabel: 'SAT', dateNumber: 11, movieCount: 2 }),
    heatCell({ id: 'sun-jul-12', weekdayLabel: 'SUN', dateNumber: 12, movieCount: 0 }),

    heatCell({ id: 'mon-jul-13', weekdayLabel: 'MON', dateNumber: 13, movieCount: 1 }),
    heatCell({ id: 'tue-jul-14', weekdayLabel: 'TUE', dateNumber: 14, movieCount: 0 }),
    heatCell({ id: 'wed-jul-15', weekdayLabel: 'WED', dateNumber: 15, movieCount: 1 }),
    heatCell({ id: 'thu-jul-16', weekdayLabel: 'THU', dateNumber: 16, movieCount: 1 }),
    heatCell({ id: 'fri-jul-17', weekdayLabel: 'FRI', dateNumber: 17, movieCount: 2 }),
    heatCell({ id: 'sat-jul-18', weekdayLabel: 'SAT', dateNumber: 18, movieCount: 1 }),
    heatCell({ id: 'sun-jul-19', weekdayLabel: 'SUN', dateNumber: 19, movieCount: 0, selected: true }),

    heatCell({ id: 'mon-jul-20', weekdayLabel: 'MON', dateNumber: 20, movieCount: 1 }),
    heatCell({ id: 'tue-jul-21', weekdayLabel: 'TUE', dateNumber: 21, movieCount: 0 }),
    heatCell({ id: 'wed-jul-22', weekdayLabel: 'WED', dateNumber: 22, movieCount: 1 }),
    heatCell({ id: 'thu-jul-23', weekdayLabel: 'THU', dateNumber: 23, movieCount: 2 }),
    heatCell({ id: 'fri-jul-24', weekdayLabel: 'FRI', dateNumber: 24, movieCount: 0 }),
    heatCell({ id: 'sat-jul-25', weekdayLabel: 'SAT', dateNumber: 25, movieCount: 4 }),
    heatCell({ id: 'sun-jul-26', weekdayLabel: 'SUN', dateNumber: 26, movieCount: 1 }),

    heatCell({ id: 'mon-jul-27', weekdayLabel: 'MON', dateNumber: 27, movieCount: 0 }),
    heatCell({ id: 'tue-jul-28', weekdayLabel: 'TUE', dateNumber: 28, movieCount: 0 }),
    heatCell({ id: 'wed-jul-29', weekdayLabel: 'WED', dateNumber: 29, movieCount: 1 }),
    heatCell({ id: 'thu-jul-30', weekdayLabel: 'THU', dateNumber: 30, movieCount: 0 }),
    heatCell({ id: 'fri-jul-31', weekdayLabel: 'FRI', dateNumber: 31, movieCount: 0 }),
    heatCell({ id: 'sat-aug-1', weekdayLabel: 'SAT', dateNumber: 1, movieCount: 0 }),
    heatCell({ id: 'sun-aug-2', weekdayLabel: 'SUN', dateNumber: 2, movieCount: 0 }),
  ]),
  busiestDays: Object.freeze([
    Object.freeze({
      id: 'busiest-sat-jul-25',
      dateLabel: 'Sat, Jul 25',
      movieCount: 4,
      dots: 4,
      thumbUrls: Object.freeze([
        thumbSvg('Neon', '#1a2438', '#5b3fd6'),
        thumbSvg('Solar', '#15233a', '#2f94ff'),
        thumbSvg('Storm', '#18263f', '#f59e0b'),
      ]),
    }),
    Object.freeze({
      id: 'busiest-thu-jul-23',
      dateLabel: 'Thu, Jul 23',
      movieCount: 2,
      dots: 2,
      thumbUrls: Object.freeze([
        thumbSvg('Blue', '#14243a', '#3d6ea5'),
        thumbSvg('After', '#1a2438', '#6b4a3a'),
        thumbSvg('Dusk', '#14243a', '#9f67ff'),
      ]),
    }),
    Object.freeze({
      id: 'busiest-fri-jul-17',
      dateLabel: 'Fri, Jul 17',
      movieCount: 2,
      dots: 2,
      thumbUrls: Object.freeze([
        thumbSvg('Moon', '#0f1d3b', '#22c55e'),
        thumbSvg('Rash', '#2b1b0b', '#f59e0b'),
        thumbSvg('Dawn', '#2a3348', '#60a5fa'),
      ]),
    }),
  ]),
  busiestDaysViewAllLabel: 'View all',
  upcomingHighlights: Object.freeze([
    Object.freeze({
      id: 'upcoming-sat-jul-19',
      dateLabel: 'Sat, Jul 19',
      filmCountLabel: '3 films',
      dots: 3,
      description: 'Afternoon into late night',
      thumbUrl: thumbSvg('Horizon', '#1a2438', '#6b4a3a'),
    }),
    Object.freeze({
      id: 'upcoming-sun-jul-20',
      dateLabel: 'Sun, Jul 20',
      filmCountLabel: '1 film',
      dots: 1,
      description: 'Evening',
      thumbUrl: thumbSvg('Sunset', '#2a3348', '#6b4a3a'),
    }),
  ]),
  upcomingHighlightsViewAllLabel: 'View all',
});

/** Query seam for Stage 1 QC / tests. */
export const MY_SCHEDULE_MONTH_QUERY = 'myScheduleMonth';

/** @returns {boolean} */
export function isMyScheduleMonthQueryOpen() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(MY_SCHEDULE_MONTH_QUERY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

/** @returns {Readonly<object>} */
export function getMyScheduleMonthMockupPresentation() {
  return MY_SCHEDULE_MONTH_MOCKUP_FIXTURE;
}

/** @returns {Readonly<object>} */
export function resolveMyScheduleMonthPresentation() {
  return getMyScheduleMonthMockupPresentation();
}

/** @type {Readonly<object>} */
export const MY_SCHEDULE_MONTH_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  ...MONTH_JULY,
});

