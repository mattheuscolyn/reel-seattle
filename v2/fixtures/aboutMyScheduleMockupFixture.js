/**
 * About My Schedule MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/About My Schedule Page.png.
 * Does not import planner or preference stores.
 *
 * Discrepancy vs D09: mockup claims one-way calendar sync; product decision
 * revises copy until sync ships. Stage 1 preserves mockup wording.
 */

export const ABOUT_MY_SCHEDULE_SECTION_ORDER = Object.freeze([
  'header',
  'whatItDoes',
  'twoViews',
  'whatCountsAsPlan',
  'featureCards',
  'privacy',
  'faq',
]);

/**
 * @returns {Readonly<object>}
 */
export function getAboutMyScheduleMockupPresentation() {
  return ABOUT_MY_SCHEDULE_MOCKUP_FIXTURE;
}

/**
 * @type {Readonly<object>}
 */
export const ABOUT_MY_SCHEDULE_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  title: 'About My Schedule',
  intro:
    'Your moviegoing calendar, built around plans—not generic events.',
  whatItDoes: Object.freeze({
    key: 'whatItDoes',
    title: 'What My Schedule does',
    leadBefore: 'My Schedule is ',
    leadAccent: 'your personal movie calendar.',
    bullets: Object.freeze([
      'See all your planned showtimes in one place',
      'Use Week view to plan in detail',
      'Use Month view to spot patterns at a glance',
      'Tap open time on the timeline to find movies around that time',
    ]),
  }),
  twoViews: Object.freeze({
    key: 'twoViews',
    title: 'How the two views work',
    week: Object.freeze({
      title: 'Week view',
      subtitle: 'Plan your days in detail.',
      bullets: Object.freeze([
        Object.freeze({
          icon: 'calendarCheck',
          text: 'Shows your films, theaters, and showtimes',
        }),
        Object.freeze({
          icon: 'search',
          text: 'Tap open time to search for movies that fit',
        }),
        Object.freeze({
          icon: 'edit',
          text: 'Tap a film to view details or make changes',
        }),
      ]),
    }),
    month: Object.freeze({
      title: 'Month view',
      subtitle: 'See your moviegoing patterns.',
      legend: Object.freeze([
        Object.freeze({ level: 0, label: 'No plans' }),
        Object.freeze({ level: 1, label: '1 movie' }),
        Object.freeze({ level: 2, label: '2 movies' }),
        Object.freeze({ level: 3, label: '3 movies' }),
        Object.freeze({ level: 4, label: '4+ movies' }),
      ]),
      bullets: Object.freeze([
        Object.freeze({
          icon: 'chart',
          text: 'Heatmap shows how many films are planned each day',
        }),
        Object.freeze({
          icon: 'palette',
          text: 'Darker color = more movies',
        }),
        Object.freeze({
          icon: 'calendar',
          text: 'Tap any day to open it in Week view',
        }),
      ]),
    }),
  }),
  whatCountsAsPlan: Object.freeze({
    key: 'whatCountsAsPlan',
    title: 'What counts as a plan',
    body: Object.freeze([
      'A film appears in My Schedule when you add a specific showtime to your plan. Saving a film without choosing a showtime does not place it on your schedule.',
    ]),
    bodyAccentPhrase: 'specific showtime',
    flow: Object.freeze([
      Object.freeze({ id: 'saved', label: 'Saved film', icon: 'bookmark' }),
      Object.freeze({
        id: 'showtime',
        label: 'Selected showtime',
        icon: 'ticket',
      }),
      Object.freeze({
        id: 'scheduled',
        label: 'Scheduled plan',
        icon: 'calendar',
      }),
    ]),
    youCanPlanLabel: 'You can plan:',
    planTypes: Object.freeze([
      Object.freeze({ id: 'single', label: 'Single films', icon: 'bookmark' }),
      Object.freeze({
        id: 'multi',
        label: 'Multi-movie plans',
        icon: 'multi',
      }),
      Object.freeze({
        id: 'breaks',
        label: 'Breaks between films',
        icon: 'cup',
      }),
      Object.freeze({
        id: 'imported',
        label: 'Imported events',
        icon: 'calendarImport',
      }),
    ]),
  }),
  featureCards: Object.freeze({
    key: 'featureCards',
    cards: Object.freeze([
      Object.freeze({
        id: 'colors',
        title: 'Understanding colors',
        summary: 'Colors help you quickly understand your schedule.',
        icon: 'palette',
        bullets: Object.freeze([
          'The meaning depends on your selected color coding mode',
          'Labels, icons, and text are always available',
          'You can change this anytime',
        ]),
        linkLabel: 'Review color coding settings',
        linkAction: 'color-coding-settings',
      }),
      Object.freeze({
        id: 'sync',
        title: 'Calendar sync',
        summary: 'Add your plans to your external calendar.',
        icon: 'calendarSync',
        bullets: Object.freeze([
          'Reel Seattle creates and updates events for you',
          'Changes made in Reel Seattle update synced events',
          "External edits won't sync back to Reel Seattle",
        ]),
        linkLabel: 'Manage calendar sync',
        linkAction: 'manage-calendar-sync',
      }),
      Object.freeze({
        id: 'tickets',
        title: 'Tickets',
        summary: 'Reel Seattle links to theater ticketing.',
        icon: 'ticket',
        bullets: Object.freeze([
          "View tickets opens the theater's website or app",
          "We don't store or manage your tickets",
        ]),
        linkLabel: 'Learn more about tickets',
        linkAction: 'learn-tickets',
      }),
    ]),
  }),
  privacy: Object.freeze({
    key: 'privacy',
    title: 'Privacy & control',
    points: Object.freeze([
      Object.freeze({
        id: 'private',
        icon: 'lock',
        text: 'Your schedule is private by default',
      }),
      Object.freeze({
        id: 'share',
        icon: 'people',
        text: 'You choose when to share plans',
      }),
      Object.freeze({
        id: 'clear',
        icon: 'trash',
        text: 'You can remove plans or clear your data',
      }),
    ]),
    linkLabel: 'Open Privacy Settings',
    linkAction: 'privacy-settings',
  }),
  faq: Object.freeze({
    key: 'faq',
    title: 'Frequently asked questions',
    items: Object.freeze([
      Object.freeze({
        id: 'saved-vs-schedule',
        question: "Why doesn't a saved movie appear in My Schedule?",
      }),
      Object.freeze({
        id: 'showtime-change',
        question: 'What happens when a showtime changes or is canceled?',
      }),
      Object.freeze({
        id: 'plan-without-tickets',
        question: 'Can I plan movies without buying tickets?',
      }),
      Object.freeze({
        id: 'phone-calendar',
        question: 'Can I add plans to my phone calendar?',
      }),
    ]),
  }),
});

/**
 * Stage 1 always returns the mockup fixture.
 * @returns {ReturnType<typeof getAboutMyScheduleMockupPresentation>}
 */
export function resolveAboutMySchedulePresentation() {
  return getAboutMyScheduleMockupPresentation();
}

/** Query seam for Stage 1 QC / tests (Settings entry deferred). */
export const ABOUT_MY_SCHEDULE_QUERY = 'aboutSchedule';

/**
 * @returns {boolean}
 */
export function isAboutMyScheduleQueryOpen() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(ABOUT_MY_SCHEDULE_QUERY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}
