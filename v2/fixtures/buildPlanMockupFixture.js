/**
 * Build a Plan MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/Build a Plan Page.png.
 * Local UI state defaults only. Does not import stores, planner engines,
 * production showtimes, or persistence keys.
 *
 * Prompt conflict note: an early Stage 1 prompt listed presets
 * “One Great Film / Double Feature / Movie Day”. The canonical mockup and
 * data audit use After Work / Saturday Marathon / Premium Adventure /
 * Last Chance / Surprise Me — mockup wins for Stage 1.
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';

export const BUILD_PLAN_SECTION_ORDER = Object.freeze([
  'header',
  'presets',
  'customDivider',
  'when',
  'what',
  'where',
  'fineTuning',
  'summaryCta',
]);

export const BUILD_PLAN_CTA_LABEL = 'Build my movie day';

function filmCard({ id, title, detailLabel, imageUrl, theaterLabel = null }) {
  return Object.freeze({
    id,
    title,
    detailLabel,
    theaterLabel,
    imageUrl,
  });
}

export function getBuildPlanMockupPresentation() {
  return BUILD_PLAN_MOCKUP_FIXTURE;
}

/**
 * Canonical presentation + default form values for Stage 1.
 */
export const BUILD_PLAN_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  pageTitle: 'Build a Plan',
  pageTagline: 'Create the perfect movie day (or night).',
  presetsLabel: 'Start with a preset',
  customDividerLabel: 'or build custom',
  clearAllLabel: 'Clear all',
  ctaLabel: BUILD_PLAN_CTA_LABEL,
  resultsDeferredMessage:
    'Build a Plan Results isn’t available in this Stage 1 Planner shell yet.',
  presets: Object.freeze([
    Object.freeze({
      id: 'after-work',
      title: 'After Work',
      line1: 'Weekday evenings',
      line2: '1–2 movies',
      icon: 'briefcase',
      accent: 'violet',
    }),
    Object.freeze({
      id: 'saturday-marathon',
      title: 'Saturday Marathon',
      line1: 'Anytime',
      line2: 'Triple feature',
      icon: 'popcorn',
      accent: 'red',
    }),
    Object.freeze({
      id: 'premium-adventure',
      title: 'Premium Adventure',
      line1: 'Best formats,',
      line2: 'epic experiences',
      icon: 'ticket',
      accent: 'gold',
    }),
    Object.freeze({
      id: 'last-chance',
      title: 'Last Chance',
      line1: 'Prioritize films',
      line2: 'leaving soon',
      icon: 'clock',
      accent: 'orange',
    }),
    Object.freeze({
      id: 'surprise-me',
      title: 'Surprise Me',
      line1: 'Wide open',
      line2: 'serendipity',
      icon: 'spark',
      accent: 'gradient',
    }),
  ]),
  when: Object.freeze({
    step: 1,
    title: 'When?',
    support: 'Choose the day and time window.',
    flexibleLabel: 'Flexible',
    dateLabelPrefix: 'Date',
    startAfterLabel: 'Start after',
    finishBeforeLabel: 'Finish before',
    addDayLabel: '+ Add another day',
  }),
  what: Object.freeze({
    step: 2,
    title: 'What?',
    support: 'Add the films you want to include or avoid.',
    addFromListLabel: 'Add from list',
    mustIncludeLabel: 'Must include',
    wouldLoveLabel: 'Would love to see',
    notInterestedLabel: 'Not interested in',
    optionalLabel: 'Optional',
    addFilmLabel: 'Add film',
    moreOptionsLabel: 'More options (format, theater, showtime)',
  }),
  where: Object.freeze({
    step: 3,
    title: 'Where?',
    support: 'Choose theaters and locations.',
    locationLabel: 'Location preference',
    editLabel: 'Edit',
    theaterPrefs: Object.freeze([
      Object.freeze({
        id: 'any',
        title: 'Any theater',
        detail: 'All options',
        icon: 'globe',
      }),
      Object.freeze({
        id: 'amc',
        title: 'Prefer AMC',
        detail: 'Use A-List when possible',
        icon: 'ticket',
      }),
      Object.freeze({
        id: 'indie',
        title: 'Prefer indie',
        detail: 'Independent theaters',
        icon: 'building',
      }),
      Object.freeze({
        id: 'custom',
        title: 'Custom selection',
        detail: 'Pick specific theaters',
        icon: 'pin',
      }),
    ]),
  }),
  fineTuning: Object.freeze({
    step: 4,
    title: 'Fine tuning',
    support: 'Adjust additional preferences.',
    resetLabel: 'Reset',
    fields: Object.freeze([
      Object.freeze({
        id: 'planSize',
        label: 'Plan size',
        icon: 'calendarPlus',
      }),
      Object.freeze({
        id: 'maxGap',
        label: 'Max gap between movies',
        icon: 'clock',
      }),
      Object.freeze({
        id: 'walking',
        label: 'Walking distance',
        icon: 'walk',
      }),
      Object.freeze({
        id: 'premiumFormats',
        label: 'Premium formats',
        icon: 'film',
      }),
      Object.freeze({
        id: 'budget',
        label: 'Budget',
        icon: 'wallet',
      }),
      Object.freeze({
        id: 'accessibility',
        label: 'Accessibility',
        icon: 'accessibility',
      }),
    ]),
    toggles: Object.freeze([
      Object.freeze({
        id: 'includeSpecialEvents',
        label: 'Include special events',
        support: 'Q&As, premieres, etc.',
        icon: 'party',
      }),
      Object.freeze({
        id: 'allowRepeats',
        label: 'Allow repeats',
        support: "Include movies I've seen.",
        icon: 'layers',
      }),
      Object.freeze({
        id: 'excludeSoldOut',
        label: 'Exclude sold out',
        support: 'Skip sold out showtimes.',
        icon: 'ban',
      }),
    ]),
  }),
  summary: Object.freeze({
    title: 'Your movie day',
  }),
  /** Default local form state matching the mockup. */
  defaultForm: Object.freeze({
    selectedPresetId: 'after-work',
    flexible: true,
    dateDisplay: 'Sat, Jul 19, 2026',
    dateShort: 'Sat, Jul 19',
    startAfter: '2:00 PM',
    finishBefore: '11:00 PM',
    mustInclude: Object.freeze([
      filmCard({
        id: 'must-2001',
        title: '2001: A Space Odyssey',
        detailLabel: 'Central Cinema • 70mm • Sat 7:00 PM',
        imageUrl: PLACEHOLDER_POSTERS.spaceOdyssey,
      }),
    ]),
    wouldLove: Object.freeze([
      filmCard({
        id: 'love-perfect-blue',
        title: 'Perfect Blue',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.perfectBlue,
      }),
      filmCard({
        id: 'love-memories',
        title: 'Memories of Murder',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.memoriesOfMurder,
      }),
    ]),
    notInterested: Object.freeze([
      filmCard({
        id: 'ni-minions',
        title: 'Minions & Monsters',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.minionsMonsters,
      }),
      filmCard({
        id: 'ni-moana',
        title: 'Moana',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.moana,
      }),
    ]),
    theaterPrefId: 'any',
    locationDisplay: 'Capitol Hill, Seattle, WA',
    locationShort: 'Capitol Hill',
    planSize: '2 – 4 movies',
    maxGap: '90 min',
    walking: '15 min',
    premiumFormats: 'IMAX, 70mm, Dolby',
    budget: 'Any',
    accessibility: 'Any',
    includeSpecialEvents: true,
    allowRepeats: false,
    excludeSoldOut: false,
  }),
});

/**
 * Mutable clone of fixture defaults for local React state.
 * @returns {object}
 */
export function createBuildPlanFormState() {
  const d = BUILD_PLAN_MOCKUP_FIXTURE.defaultForm;
  return {
    selectedPresetId: d.selectedPresetId,
    flexible: d.flexible,
    dateDisplay: d.dateDisplay,
    dateShort: d.dateShort,
    startAfter: d.startAfter,
    finishBefore: d.finishBefore,
    mustInclude: d.mustInclude.map((f) => ({ ...f })),
    wouldLove: d.wouldLove.map((f) => ({ ...f })),
    notInterested: d.notInterested.map((f) => ({ ...f })),
    theaterPrefId: d.theaterPrefId,
    locationDisplay: d.locationDisplay,
    locationShort: d.locationShort,
    planSize: d.planSize,
    maxGap: d.maxGap,
    walking: d.walking,
    premiumFormats: d.premiumFormats,
    budget: d.budget,
    accessibility: d.accessibility,
    includeSpecialEvents: d.includeSpecialEvents,
    allowRepeats: d.allowRepeats,
    excludeSoldOut: d.excludeSoldOut,
  };
}

/**
 * Light local adjustments when a preset is chosen (no engine).
 * @param {string | null} presetId
 * @param {ReturnType<typeof createBuildPlanFormState>} base
 */
export function applyBuildPlanPreset(presetId, base) {
  const next = { ...base, selectedPresetId: presetId };
  if (presetId === 'after-work') {
    next.startAfter = '5:00 PM';
    next.finishBefore = '11:00 PM';
    next.planSize = '1 – 2 movies';
  } else if (presetId === 'saturday-marathon') {
    next.startAfter = '11:00 AM';
    next.finishBefore = '11:00 PM';
    next.planSize = '3 movies';
  } else if (presetId === 'premium-adventure') {
    next.premiumFormats = 'IMAX, 70mm, Dolby';
    next.planSize = '1 – 3 movies';
  } else if (presetId === 'last-chance') {
    next.planSize = '1 – 2 movies';
  } else if (presetId === 'surprise-me') {
    next.flexible = true;
    next.planSize = '2 – 4 movies';
  }
  return next;
}

/**
 * @returns {ReturnType<typeof getBuildPlanMockupPresentation>}
 */
export function resolveBuildPlanPresentation() {
  return getBuildPlanMockupPresentation();
}

/**
 * Build summary chips from local form state.
 * @param {ReturnType<typeof createBuildPlanFormState>} form
 */
export function buildPlanSummaryLines(form) {
  const theater =
    BUILD_PLAN_MOCKUP_FIXTURE.where.theaterPrefs.find(
      (p) => p.id === form.theaterPrefId,
    )?.title ?? 'Any theater';
  return {
    dateShort: form.dateShort,
    timeWindow: `${form.startAfter} – ${form.finishBefore}`,
    planSize: form.planSize,
    locationShort: form.locationShort,
    detailLine: `${form.mustInclude.length} must include • ${form.wouldLove.length} would love • ${form.notInterested.length} exclusions • ${theater}`,
  };
}
