/**
 * Build a Plan Results MOCKUP FIXTURE — visual authority for QC.
 *
 * Content matches Canonical Mockup Images/Build a Plan Results Page.png.
 * Fixture itineraries only — no planner engine in mockup mode.
 *
 * QC: `?planResultsMockup=1&interaction=none|time|film|break`
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';

export const PLAN_RESULTS_INTERACTION_QUERY = 'interaction';

export const BUILD_PLAN_RESULTS_SECTION_ORDER = Object.freeze([
  'summary',
  'sort',
  'plans',
]);

/**
 * @returns {null | 'none' | 'time' | 'film' | 'break'}
 */
export function getBuildPlanResultsInteraction() {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(PLAN_RESULTS_INTERACTION_QUERY);
    if (raw === 'time' || raw === 'film' || raw === 'break' || raw === 'none') {
      return raw === 'none' ? null : raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const BUILD_PLAN_RESULTS_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'best-match', label: 'Best match', icon: 'spark' }),
  Object.freeze({ id: 'smallest-gaps', label: 'Smallest gaps', icon: 'clock' }),
  Object.freeze({
    id: 'shortest-runtime',
    label: 'Shortest runtime',
    icon: 'hourglass',
  }),
  Object.freeze({
    id: 'earliest-finish',
    label: 'Earliest finish',
    icon: 'sun',
  }),
  Object.freeze({
    id: 'leaves-soonest',
    label: 'Leaves soonest',
    icon: 'calendar',
  }),
]);

function film({
  id,
  title,
  startTime,
  endTime,
  theater,
  runtimeLabel,
  formatBadge,
  imageUrl,
  preference = 'neutral',
}) {
  return Object.freeze({
    id,
    title,
    startTime,
    endTime,
    theater,
    runtimeLabel,
    formatBadge,
    imageUrl,
    preference,
  });
}

function breakRow({ id, label }) {
  return Object.freeze({ id, type: 'break', label });
}

function plan({
  id,
  rank,
  items,
  movieCountLabel,
  totalRuntime,
  walkLabel,
  breaksLabel,
  finishesLabel,
}) {
  return Object.freeze({
    id,
    rank,
    items: Object.freeze(items),
    movieCountLabel,
    totalRuntime,
    walkLabel,
    breaksLabel,
    finishesLabel,
  });
}

export function getBuildPlanResultsMockupPresentation() {
  return BUILD_PLAN_RESULTS_MOCKUP_FIXTURE;
}

export const BUILD_PLAN_RESULTS_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  pageTitle: 'Your Movie Day Results',
  summaryLine: 'Sat, Jul 19 • 2:00 PM – 11:00 PM • 2 – 4 movies',
  plansFoundLabel: '18 plans found',
  loadMoreLabel: 'Load more plans',
  shareLabel: 'Share',
  viewPlanLabel: 'View plan details',
  savePlanLabel: 'Add to My Schedule',
  savedPlanLabel: 'Added to My Schedule',
  moreActionsLabel: 'More actions',
  addToScheduleLabel: 'Add to My Schedule',
  filmSheet: Object.freeze({
    sectionTitle: 'Adjust film in plans',
    cancelLabel: 'Cancel',
    applyLabel: 'Apply',
  }),
  sortLabel: 'Sort by',
  preferenceChips: Object.freeze([
    Object.freeze({
      id: 'must-2001',
      kind: 'must',
      label: 'Must include',
      value: '2001: A Space Odyssey',
      removable: true,
    }),
    Object.freeze({
      id: 'love-perfect',
      kind: 'love',
      label: 'Would love',
      value: 'Perfect Blue',
      removable: true,
    }),
    Object.freeze({
      id: 'ni-count',
      kind: 'ni',
      label: 'Not interested',
      value: '2 films',
      removable: true,
    }),
    Object.freeze({
      id: 'more',
      kind: 'more',
      label: '',
      value: '+2 more',
      removable: false,
    }),
  ]),
  quickAdjust: Object.freeze([
    Object.freeze({
      id: 'startAfter',
      label: 'Start after',
      value: '2:00 PM',
      icon: 'sun',
    }),
    Object.freeze({
      id: 'endBefore',
      label: 'End before',
      value: '11:00 PM',
      icon: 'moon',
    }),
    Object.freeze({
      id: 'maxWalk',
      label: 'Max walk',
      value: '15 min',
      icon: 'walk',
    }),
    Object.freeze({
      id: 'planSize',
      label: 'Plan size',
      value: '2 – 4 movies',
      icon: 'ticket',
    }),
    Object.freeze({
      id: 'adjust',
      label: 'Adjust',
      value: '',
      icon: 'sliders',
    }),
  ]),
  sortOptions: BUILD_PLAN_RESULTS_SORT_OPTIONS,
  refine: Object.freeze({
    title: 'Refine your results',
    support:
      'Tap any item in a plan above to adjust it directly. Results update instantly.',
    resetLabel: 'Reset all',
    fields: Object.freeze([
      Object.freeze({
        id: 'startAfter',
        label: 'Start after',
        value: '2:00 PM',
        icon: 'sun',
      }),
      Object.freeze({
        id: 'endBefore',
        label: 'End before',
        value: '11:00 PM',
        icon: 'moon',
      }),
      Object.freeze({
        id: 'maxWalk',
        label: 'Max walk',
        value: '15 min',
        icon: 'walk',
      }),
      Object.freeze({
        id: 'planSize',
        label: 'Plan size',
        value: '2 – 4 movies',
        icon: 'calendar',
      }),
    ]),
    premiumFormatsLabel: 'Premium formats',
    premiumFormatsValue: 'Any',
    toggles: Object.freeze([
      Object.freeze({
        id: 'amcAListOnly',
        label: 'AMC A-List only',
        defaultOn: false,
      }),
      Object.freeze({
        id: 'includeSpecialEvents',
        label: 'Include special events',
        defaultOn: true,
      }),
      Object.freeze({
        id: 'excludeSoldOut',
        label: 'Exclude sold out',
        defaultOn: false,
      }),
    ]),
  }),
  defaultSortId: 'best-match',
  defaultActivePlanId: 'plan-1',
  plansBySort: Object.freeze({
    'best-match': Object.freeze(['plan-1', 'plan-2', 'plan-3']),
    'smallest-gaps': Object.freeze(['plan-2', 'plan-1', 'plan-3']),
    'shortest-runtime': Object.freeze(['plan-3', 'plan-2', 'plan-1']),
    'earliest-finish': Object.freeze(['plan-3', 'plan-2', 'plan-1']),
    'leaves-soonest': Object.freeze(['plan-1', 'plan-3', 'plan-2']),
  }),
  plans: Object.freeze([
    plan({
      id: 'plan-1',
      rank: 1,
      movieCountLabel: '3 MOVIES',
      totalRuntime: '9h 47m total',
      walkLabel: '2.2 mi walk',
      breaksLabel: '2 breaks / 2h 26m total',
      finishesLabel: 'Finishes 10:42 PM',
      items: [
        film({
          id: 'p1-f1',
          title: '2001: A Space Odyssey',
          startTime: '2:15 PM',
          endTime: '5:04 PM',
          theater: 'Central Cinema',
          runtimeLabel: '2h 49m',
          formatBadge: '70MM',
          imageUrl: PLACEHOLDER_POSTERS.spaceOdyssey,
          preference: 'must',
        }),
        breakRow({ id: 'p1-b1', label: '1h 16m break' }),
        film({
          id: 'p1-f2',
          title: 'Perfect Blue',
          startTime: '5:20 PM',
          endTime: '6:41 PM',
          theater: 'SIFF Film Center',
          runtimeLabel: '1h 21m',
          formatBadge: 'SUBTITLED',
          imageUrl: PLACEHOLDER_POSTERS.perfectBlue,
          preference: 'love',
        }),
        breakRow({ id: 'p1-b2', label: '1h 10m break' }),
        film({
          id: 'p1-f3',
          title: 'Memories of Murder',
          startTime: '8:30 PM',
          endTime: '10:42 PM',
          theater: 'AMC Pacific Place 11',
          runtimeLabel: '2h 12m',
          formatBadge: 'SUBTITLED',
          imageUrl: PLACEHOLDER_POSTERS.memoriesOfMurder,
          preference: 'love',
        }),
      ],
    }),
    plan({
      id: 'plan-2',
      rank: 2,
      movieCountLabel: '3 MOVIES',
      totalRuntime: '9h 30m total',
      walkLabel: '1.6 mi walk',
      breaksLabel: '2 breaks / 2h 26m total',
      finishesLabel: 'Finishes 9:27 PM',
      items: [
        film({
          id: 'p2-f1',
          title: '2001: A Space Odyssey',
          startTime: '2:45 PM',
          endTime: '5:34 PM',
          theater: 'Central Cinema',
          runtimeLabel: '2h 49m',
          formatBadge: '70MM',
          imageUrl: PLACEHOLDER_POSTERS.spaceOdyssey,
          preference: 'must',
        }),
        breakRow({ id: 'p2-b1', label: '1h 01m break' }),
        film({
          id: 'p2-f2',
          title: 'Perfect Blue',
          startTime: '4:55 PM',
          endTime: '6:16 PM',
          theater: 'SIFF Film Center',
          runtimeLabel: '1h 21m',
          formatBadge: 'SUBTITLED',
          imageUrl: PLACEHOLDER_POSTERS.perfectBlue,
          preference: 'love',
        }),
        breakRow({ id: 'p2-b2', label: '55m break' }),
        film({
          id: 'p2-f3',
          title: 'Jurassic Park',
          startTime: '7:20 PM',
          endTime: '9:27 PM',
          theater: 'Central Cinema',
          runtimeLabel: '2h 07m',
          formatBadge: '35MM',
          imageUrl: PLACEHOLDER_POSTERS.longHorizon,
          preference: 'neutral',
        }),
      ],
    }),
    plan({
      id: 'plan-3',
      rank: 3,
      movieCountLabel: '3 MOVIES',
      totalRuntime: '7h 40m total',
      walkLabel: '1.4 mi walk',
      breaksLabel: '2 breaks / 2h 19m total',
      finishesLabel: 'Finishes 9:05 PM',
      items: [
        film({
          id: 'p3-f1',
          title: 'Perfect Blue',
          startTime: '2:15 PM',
          endTime: '3:36 PM',
          theater: 'SIFF Film Center',
          runtimeLabel: '1h 21m',
          formatBadge: 'SUBTITLED',
          imageUrl: PLACEHOLDER_POSTERS.perfectBlue,
          preference: 'love',
        }),
        breakRow({ id: 'p3-b1', label: '1h 09m break' }),
        film({
          id: 'p3-f2',
          title: 'The Long Horizon',
          startTime: '4:45 PM',
          endTime: '7:05 PM',
          theater: 'SIFF Downtown',
          runtimeLabel: '2h 20m',
          formatBadge: 'DCP',
          imageUrl: PLACEHOLDER_POSTERS.longHorizon,
          preference: 'neutral',
        }),
        breakRow({ id: 'p3-b2', label: '1h 10m break' }),
        film({
          id: 'p3-f3',
          title: "It's a Wonderful Life",
          startTime: '6:55 PM',
          endTime: '9:05 PM',
          theater: 'The Beacon',
          runtimeLabel: '2h 10m',
          formatBadge: '35MM',
          imageUrl: PLACEHOLDER_POSTERS.harbor,
          preference: 'neutral',
        }),
      ],
    }),
  ]),
});

/**
 * @returns {ReturnType<typeof getBuildPlanResultsMockupPresentation>}
 * @deprecated Prefer resolveBuildPlanResultsPagePresentation (live default).
 * Kept for Stage 1 fixture unit tests / QC helpers.
 */
export function resolveBuildPlanResultsPresentation() {
  return getBuildPlanResultsMockupPresentation();
}

/**
 * Deterministic fixture reorder for sort chips (not real ranking).
 * @param {string} sortId
 */
export function getBuildPlanResultsOrderedPlans(sortId) {
  const presentation = BUILD_PLAN_RESULTS_MOCKUP_FIXTURE;
  const order =
    presentation.plansBySort[sortId] ?? presentation.plansBySort['best-match'];
  const byId = new Map(presentation.plans.map((p) => [p.id, p]));
  return order.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Default local UI state for Results.
 */
export function createBuildPlanResultsUiState() {
  const p = BUILD_PLAN_RESULTS_MOCKUP_FIXTURE;
  const films = p.plans.flatMap((planItem) =>
    planItem.items.filter((i) => i.type !== 'break'),
  );
  const filmPreferences = Object.fromEntries(
    films.map((f) => [f.id, f.preference ?? 'neutral']),
  );
  return {
    sortId: p.defaultSortId,
    activePlanId: p.defaultActivePlanId,
    selectedFilmIds: films.map((f) => f.id),
    filmPreferences,
    favoritedPlanIds: [],
    amcAListOnly: false,
    includeSpecialEvents: true,
    excludeSoldOut: false,
    dismissedChipIds: [],
  };
}
