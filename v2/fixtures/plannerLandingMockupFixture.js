/**
 * Planner Landing MOCKUP FIXTURE — visual QC / `?plannerMockup=1`.
 *
 * Content matches Canonical Mockup Images/Planner Landing Page.png.
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

function thumbSvg(title, from, to) {
  const safe = String(title).replace(/[<>&']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="120" rx="10" fill="url(#g)"/>
  <text x="14" y="100" fill="#f5f5f7" font-family="Georgia, serif" font-size="16">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PLANNER_LANDING_SECTION_ORDER = Object.freeze([
  'header',
  'summary',
  'entryCards',
  'upcomingPlans',
  'draft',
]);

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
  pageTagline: 'See what’s ahead or plan your next movie day.',
  summary: Object.freeze({
    upcomingCount: 5,
    draftCount: 1,
    nextPlanValue: 'Tonight',
    nextPlanLabel: 'Next plan 7:00 PM',
  }),
  entries: Object.freeze([
    Object.freeze({
      id: 'my-schedule',
      title: 'My Schedule',
      description: 'See your week, month, and all scheduled movie plans.',
      accent: 'purple',
      icon: 'schedule',
    }),
    Object.freeze({
      id: 'build-a-plan',
      title: 'Build a Plan',
      description: 'Choose films, tune preferences, and generate great itineraries.',
      accent: 'teal',
      icon: 'build',
    }),
  ]),
  upcoming: Object.freeze({
    sectionTitle: 'Upcoming Plans',
    viewAllLabel: 'View all',
    emptyTitle: null,
    emptyBody: null,
    plans: Object.freeze([
      Object.freeze({
        id: 'plan-long-horizon',
        title: 'The Long Horizon',
        venueLabel: 'SIFF Downtown',
        whenLabel: 'Sat May 17 · 7:00 PM',
        imageUrl: thumbSvg('Horizon', '#2a3348', '#6b4a3a'),
        badges: Object.freeze([
          Object.freeze({ id: 'single', label: 'Single film', tone: 'purple' }),
        ]),
      }),
      Object.freeze({
        id: 'plan-after-storm',
        title: 'After the Storm',
        venueLabel: 'AMC Pacific Place',
        whenLabel: 'Fri May 23 · 6:30 PM',
        imageUrl: thumbSvg('Storm', '#1a2438', '#3a4a6a'),
        badges: Object.freeze([
          Object.freeze({ id: 'single', label: 'Single film', tone: 'purple' }),
        ]),
      }),
      Object.freeze({
        id: 'plan-blue-hour',
        title: 'Blue Hour + Saltwater Road',
        venueLabel: 'SIFF Uptown',
        whenLabel: 'Sun May 25 · 5:15 PM',
        imageUrl: thumbSvg('Blue Hour', '#14243a', '#3d6ea5'),
        badges: Object.freeze([
          Object.freeze({ id: 'multi', label: '2-film plan', tone: 'teal' }),
          Object.freeze({ id: 'break', label: '45 min break', tone: 'muted' }),
        ]),
      }),
    ]),
  }),
  draft: Object.freeze({
    visible: true,
    eyebrow: 'Continue your draft',
    title: 'Saturday movie day',
    metaLabel: '2 films · Last edited May 13',
  }),
});
