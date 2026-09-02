/**
 * Planner Landing MOCKUP FIXTURE — visual QC / `?plannerMockup=1`.
 *
 * Content matches Canonical Mockup Images/Planner Main Page Upcoming.png.
 * Not production plans. Does not import or write planner stores.
 */

export const PLANNER_MOCKUP_QUERY = 'plannerMockup';
export const PLANNER_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.plannerMockup';

/**
 * @returns {boolean}
 */
export function isPlannerMockupMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PLANNER_MOCKUP_QUERY) === '1') return true;
    if (params.get(PLANNER_MOCKUP_QUERY) === '0') return false;
    return window.localStorage?.getItem(PLANNER_MOCKUP_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Poster-like SVG thumbnails for mockup QC (no network / no store writes).
 * @param {string} title
 * @param {string} from
 * @param {string} to
 * @param {string} [accent]
 */
function posterSvg(title, from, to, accent = '#f5f5f7') {
  const safe = String(title).replace(/[<>&']/g, '');
  const lines = safe.split('\n');
  const textNodes = lines
    .map(
      (line, i) =>
        `<text x="12" y="${148 - (lines.length - 1 - i) * 18}" fill="${accent}" font-family="Georgia, serif" font-size="15">${line}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="120" height="180" rx="8" fill="url(#g)"/>
  ${textNodes}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PLANNER_LANDING_SECTION_ORDER = Object.freeze([
  'header',
  'tabs',
  'needsAttention',
  'upcoming',
]);

const POSTER_CONVERSATION = posterSvg('The\nConversation', '#1a2430', '#4a5a3a');
const POSTER_BOTTOMS = posterSvg('Bottoms', '#2a1840', '#8b3a6a', '#f8e8ff');
const POSTER_MYSTERIOUS = posterSvg('Mysterious\nSkin', '#142848', '#3a6a9a');
const POSTER_PARIS = posterSvg('Paris,\nTexas', '#3a2818', '#8a6a3a');

/**
 * @param {object} partial
 */
function screening(partial) {
  return Object.freeze({
    kind: 'screening',
    inPlanner: true,
    formatLabel: null,
    ...partial,
  });
}

/**
 * @returns {Readonly<object>}
 */
export function getPlannerLandingMockupPresentation() {
  return PLANNER_LANDING_MOCKUP_FIXTURE;
}

/**
 * @type {Readonly<object>}
 */
export const PLANNER_LANDING_MOCKUP_FIXTURE = Object.freeze({
  source: 'planner-landing-mockup',
  pageTitle: 'Planner',
  pageTagline:
    'Plan your moviegoing. We’ll help you make the most of your options.',
  tabs: Object.freeze([
    Object.freeze({ id: 'upcoming', label: 'Upcoming' }),
    Object.freeze({ id: 'saved-films', label: 'Saved films' }),
  ]),
  needsAttention: Object.freeze({
    sectionTitle: 'NEEDS ATTENTION',
    count: 1,
    items: Object.freeze([
      Object.freeze({
        id: 'attention-conflict-2025-05-29',
        conflictId: 'conflict-mock-bottoms__mock-mysterious-skin',
        kind: 'conflict',
        headline: 'Thursday has a conflict',
        body: 'Bottoms and Mysterious Skin overlap.',
        ctaLabel: 'Review options',
        weekdayLabel: 'Thursday',
        dateKey: '2025-05-29',
        posterUrls: Object.freeze([POSTER_BOTTOMS, POSTER_MYSTERIOUS]),
        screeningIds: Object.freeze([
          'mock-bottoms',
          'mock-mysterious-skin',
        ]),
        planIds: Object.freeze(['mock-plan-bottoms', 'mock-plan-mysterious']),
      }),
    ]),
  }),
  upcoming: Object.freeze({
    sectionTitle: 'UPCOMING',
    viewTimelineLabel: 'View full timeline',
    showLessTimelineLabel: 'Show less',
    compactDateGroupLimit: 3,
    totalDateGroupCount: 5,
    emptyTitle: null,
    emptyBody: null,
    dateGroups: Object.freeze([
      Object.freeze({
        id: 'day-2025-05-26',
        dateKey: '2025-05-26',
        label: 'TODAY • MON, MAY 26',
        items: Object.freeze([
          screening({
            id: 'mock-conversation',
            planId: 'mock-plan-conversation',
            performanceKey: 'mock-perf-conversation',
            title: 'The Conversation',
            timeLabel: '7:00 PM',
            venueLabel: 'SIFF Uptown',
            formatLabel: '35mm',
            posterUrl: POSTER_CONVERSATION,
            addedLabel: 'Added May 20',
            startsAt: '2025-05-26T19:00:00-07:00',
          }),
        ]),
      }),
      Object.freeze({
        id: 'day-2025-05-29',
        dateKey: '2025-05-29',
        label: 'THU, MAY 29',
        items: Object.freeze([
          Object.freeze({
            kind: 'conflict-group',
            id: 'conflict-mock-bottoms__mock-mysterious-skin',
            conflictId: 'conflict-mock-bottoms__mock-mysterious-skin',
            bannerLabel: 'CONFLICT • You can’t see both',
            left: screening({
              id: 'mock-bottoms',
              planId: 'mock-plan-bottoms',
              performanceKey: 'mock-perf-bottoms',
              title: 'Bottoms',
              timeLabel: '7:00 PM',
              venueLabel: 'NWFF',
              posterUrl: POSTER_BOTTOMS,
              addedLabel: 'Added May 20',
              startsAt: '2025-05-29T19:00:00-07:00',
            }),
            right: screening({
              id: 'mock-mysterious-skin',
              planId: 'mock-plan-mysterious',
              performanceKey: 'mock-perf-mysterious',
              title: 'Mysterious Skin',
              timeLabel: '7:30 PM',
              venueLabel: 'The Beacon',
              posterUrl: POSTER_MYSTERIOUS,
              addedLabel: 'Added May 20',
              startsAt: '2025-05-29T19:30:00-07:00',
            }),
          }),
        ]),
      }),
      Object.freeze({
        id: 'day-2025-05-31',
        dateKey: '2025-05-31',
        label: 'SAT, MAY 31',
        items: Object.freeze([
          screening({
            id: 'mock-paris-texas',
            planId: 'mock-plan-paris',
            performanceKey: 'mock-perf-paris',
            title: 'Paris, Texas',
            timeLabel: '4:00 PM',
            venueLabel: 'SIFF Downtown',
            formatLabel: '4K Restoration',
            posterUrl: POSTER_PARIS,
            addedLabel: 'Added May 18',
            startsAt: '2025-05-31T16:00:00-07:00',
          }),
        ]),
      }),
      Object.freeze({
        id: 'day-2025-06-01',
        dateKey: '2025-06-01',
        label: 'SUN, JUN 1',
        items: Object.freeze([
          screening({
            id: 'mock-yi-yi',
            planId: 'mock-plan-yi-yi',
            performanceKey: 'mock-perf-yi-yi',
            title: 'Yi Yi',
            timeLabel: '6:45 PM',
            venueLabel: 'SIFF Downtown',
            posterUrl: posterSvg('Yi Yi', '#182830', '#3a5a6a'),
            addedLabel: 'Added May 16',
            startsAt: '2025-06-01T18:45:00-07:00',
          }),
        ]),
      }),
      Object.freeze({
        id: 'day-2025-06-03',
        dateKey: '2025-06-03',
        label: 'TUE, JUN 3',
        items: Object.freeze([
          screening({
            id: 'mock-perfect-blue',
            planId: 'mock-plan-perfect-blue',
            performanceKey: 'mock-perf-perfect-blue',
            title: 'Perfect Blue',
            timeLabel: '7:00 PM',
            venueLabel: 'Grand Illusion',
            posterUrl: posterSvg('Perfect Blue', '#181828', '#4a3a7a'),
            addedLabel: 'Added May 15',
            startsAt: '2025-06-03T19:00:00-07:00',
          }),
        ]),
      }),
    ]),
  }),
  savedFilms: Object.freeze({
    implemented: true,
    emptyTitle: 'Saved films',
    emptyBody:
      'Save films from Explore or Film Detail, then choose a showtime here.',
  }),
});
