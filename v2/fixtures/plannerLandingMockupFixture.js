/**
 * Planner Landing MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/Planner Landing Page.png.
 * Not production plans. Does not import or write planner/stores.
 * Stage 4 may replace resolvePlannerLandingPresentation() without redesign.
 */

function thumbSvg(title, from, to) {
  const safe = String(title).replace(/[<>&']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" fill="url(#g)"/>
  <text x="12" y="140" fill="#f5f5f7" font-family="Georgia, serif" font-size="14">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PLANNER_LANDING_SECTION_ORDER = Object.freeze([
  'header',
  'upcomingPlans',
  'entryCards',
  'recentActivity',
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
  source: 'mockup-fixture',
  pageTitle: 'Planner',
  pageTagline: 'Plan the perfect movie experience.',
  addPlanLabel: 'Start a new plan',
  upcoming: Object.freeze({
    sectionTitle: 'Upcoming plans',
    viewAllLabel: 'View all',
    footerLabel: 'Next 3 of 5 plans',
    plans: Object.freeze([
      Object.freeze({
        id: 'plan-long-horizon',
        dateStack: Object.freeze({ weekday: 'SAT', monthDay: 'MAY 17' }),
        title: 'The Long Horizon',
        detailLabel: '70mm at SIFF Downtown',
        timeLabel: '7:00 PM',
        imageUrl: thumbSvg('Horizon', '#2a3348', '#6b4a3a'),
        bookmarked: true,
      }),
      Object.freeze({
        id: 'plan-after-storm',
        dateStack: Object.freeze({ weekday: 'FRI', monthDay: 'MAY 23' }),
        title: 'After the Storm',
        detailLabel: 'AMC Pacific Place 11',
        timeLabel: '6:30 PM',
        imageUrl: thumbSvg('Storm', '#1a2438', '#3a4a6a'),
        bookmarked: true,
      }),
      Object.freeze({
        id: 'plan-blue-hour',
        dateStack: Object.freeze({ weekday: 'SUN', monthDay: 'MAY 25' }),
        title: 'Blue Hour + Saltwater Road',
        detailLabel: 'SIFF Uptown',
        timeLabel: '5:15 PM',
        imageUrl: thumbSvg('Blue Hour', '#14243a', '#3d6ea5'),
        bookmarked: true,
      }),
    ]),
  }),
  entries: Object.freeze([
    Object.freeze({
      id: 'my-schedule',
      title: 'My Schedule',
      description: 'See your calendar and all scheduled opportunities.',
      icon: 'schedule',
    }),
    Object.freeze({
      id: 'build-a-plan',
      title: 'Build a Plan',
      description: 'Choose movies, set preferences, and find your best plans.',
      icon: 'build',
    }),
  ]),
  recentActivity: Object.freeze({
    sectionTitle: 'Recent activity',
    viewAllLabel: 'View all',
    items: Object.freeze([
      Object.freeze({
        id: 'act-saved-blue-hour',
        label: "Saved 'Blue Hour'",
        dateLabel: 'May 13',
        icon: 'bookmark',
        tone: 'teal',
      }),
      Object.freeze({
        id: 'act-added-plan',
        label: 'Added 2 movies to a plan',
        dateLabel: 'May 12',
        icon: 'calendarPlus',
        tone: 'orange',
      }),
      Object.freeze({
        id: 'act-shared',
        label: "Shared 'Weekend Picks'",
        dateLabel: 'May 10',
        icon: 'share',
        tone: 'accent',
      }),
    ]),
  }),
});

/**
 * Stage 1 always returns the mockup fixture.
 * @returns {ReturnType<typeof getPlannerLandingMockupPresentation>}
 */
export function resolvePlannerLandingPresentation() {
  return getPlannerLandingMockupPresentation();
}
