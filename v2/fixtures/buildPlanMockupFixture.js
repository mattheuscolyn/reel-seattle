/**
 * Build a Plan presentation + mockup form defaults.
 *
 * Visual authority: Canonical Mockup Images/Build a Plan Page.png (+ Expanded).
 * Mockup QC: `?buildPlanMockup=1` (& optional `section=`).
 * Production form uses createLiveBuildPlanFormState() — never seeds fixture films.
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';
import {
  buildCollapsedSectionSummaries,
  buildPlanFooterSummary,
  parseBuildPlanSectionQuery,
} from '../planner/buildPlanAccordion.js';

export const BUILD_PLAN_MOCKUP_QUERY = 'buildPlanMockup';
export const BUILD_PLAN_SECTION_QUERY = 'section';
export const BUILD_PLAN_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.buildPlanMockup';

export const BUILD_PLAN_SECTION_ORDER = Object.freeze([
  'header',
  'presets',
  'customDivider',
  'when',
  'where',
  'what',
  'fineTuning',
  'summaryCta',
]);

export const BUILD_PLAN_CTA_LABEL = 'Build my movie day';

/**
 * @returns {boolean}
 */
export function isBuildPlanMockupMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(BUILD_PLAN_MOCKUP_QUERY) === '1') return true;
    if (params.get(BUILD_PLAN_MOCKUP_QUERY) === '0') return false;
    return window.localStorage?.getItem(BUILD_PLAN_MOCKUP_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Initial accordion section from `?section=` when in mockup mode.
 * @returns {null | 'when' | 'what' | 'where' | 'fineTuning'}
 */
export function getBuildPlanMockupOpenSection() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return parseBuildPlanSectionQuery(params.get(BUILD_PLAN_SECTION_QUERY));
  } catch {
    return null;
  }
}

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
 * Canonical presentation chrome (labels/copy). Shared by production + mockup.
 */
export const BUILD_PLAN_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  pageTitle: 'Build a Plan',
  pageTagline: 'Create the perfect movie day (or night).',
  presetsLabel: '1. Start with a preset',
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
      id: 'last-chance',
      title: 'Last Chance',
      line1: 'Prioritize films',
      line2: 'leaving soon',
      icon: 'clock',
      accent: 'orange',
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
    timeWindowLabel: 'Time window',
    addDayLabel: 'Add another day',
  }),
  where: Object.freeze({
    step: 2,
    title: 'Where?',
    support: 'Choose theaters and locations.',
    theaterPreferenceLabel: 'Theater preference',
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
  what: Object.freeze({
    step: 3,
    title: 'What?',
    support: 'Choose films you want to include or avoid.',
    manageLabel: 'Manage',
    mustIncludeLabel: 'Must include',
    wouldLoveLabel: 'Would love to see',
    notInterestedLabel: 'Not interested in',
    addAnotherLabel: 'Add another',
    moreOptionsLabel: 'More options (format, theater, showtime)',
  }),
  fineTuning: Object.freeze({
    step: 4,
    title: 'Fine tuning',
    titleFull: 'Fine tuning (optional)',
    support: 'Adjust additional preferences.',
    resetLabel: 'Reset',
    fields: Object.freeze([
      Object.freeze({
        id: 'planSize',
        label: 'Plan size',
        icon: 'calendarPlus',
      }),
      Object.freeze({
        id: 'minGap',
        label: 'Minimum break',
        icon: 'clock',
      }),
      Object.freeze({
        id: 'maxGap',
        label: 'Max gap between movies',
        icon: 'clock',
      }),
    ]),
    toggles: Object.freeze([
      Object.freeze({
        id: 'allowRepeats',
        label: 'Allow repeat films',
        support: 'Allow the same film more than once in a plan.',
        icon: 'layers',
      }),
    ]),
  }),
  summary: Object.freeze({
    title: 'Your movie day',
  }),
  /** Deterministic mockup-only form values (QC). */
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
        detailLabel: 'Central Cinema · 70mm · Sat 7:00 PM',
        theaterLabel: 'Central Cinema',
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
      filmCard({
        id: 'love-blue-hour',
        title: 'Blue Hour',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.blueHour,
      }),
      filmCard({
        id: 'love-saltwater',
        title: 'Saltwater Road',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.saltwaterRoad,
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
      filmCard({
        id: 'ni-young-wa',
        title: 'Young Washington',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.north,
      }),
      filmCard({
        id: 'ni-quiet',
        title: 'Quiet City',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.quietCity,
      }),
      filmCard({
        id: 'ni-perfect',
        title: 'Perfect Moment',
        detailLabel: 'Any theater',
        theaterLabel: 'Any theater',
        imageUrl: PLACEHOLDER_POSTERS.perfect,
      }),
    ]),
    theaterPrefId: 'indie',
    selectedTheaters: [],
    locationDisplay: 'Capitol Hill, Seattle, WA',
    locationShort: 'Capitol Hill',
    planSize: { min: 2, max: 4 },
    maxGap: '90 min',
    minGap: '45m',
    walking: '15 min',
    premiumFormats: 'Any',
    budget: 'Any',
    accessibility: 'Any',
    includeSpecialEvents: true,
    allowRepeats: true,
    excludeSoldOut: false,
  }),
});

/**
 * Mutable clone of fixture defaults for mockup-mode React state.
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
    lockedShowtimes: [],
    theaterPrefId: d.theaterPrefId,
    selectedTheaters: d.selectedTheaters ?? [],
    locationDisplay: d.locationDisplay,
    locationShort: d.locationShort,
    planSize: d.planSize,
    maxGap: d.maxGap,
    minGap: d.minGap ?? '45m',
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
  const next = {
    ...base,
    selectedPresetId: presetId,
    lockedShowtimes: Array.isArray(base?.lockedShowtimes)
      ? base.lockedShowtimes
      : [],
  };
  if (presetId === 'after-work') {
    next.startAfter = '5:00 PM';
    next.finishBefore = '11:00 PM';
    next.planSize = { min: 1, max: 2 };
  } else if (presetId === 'saturday-marathon') {
    next.startAfter = '11:00 AM';
    next.finishBefore = '11:00 PM';
    next.planSize = { min: 3, max: 3 };
  } else if (presetId === 'last-chance') {
    next.planSize = { min: 1, max: 2 };
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
 * @param {ReturnType<typeof createBuildPlanFormState>} form
 */
export function buildPlanSummaryLines(form) {
  const footer = buildPlanFooterSummary(form);
  const collapsed = buildCollapsedSectionSummaries(form, {
    theaterPrefs: BUILD_PLAN_MOCKUP_FIXTURE.where.theaterPrefs,
  });
  const theater =
    BUILD_PLAN_MOCKUP_FIXTURE.where.theaterPrefs.find(
      (p) => p.id === form.theaterPrefId,
    )?.title ?? 'Any theater';
  return {
    dateShort: form.dateShort,
    timeWindow: `${form.startAfter}–${form.finishBefore}`,
    planSize: form.planSize,
    locationShort: form.locationShort,
    line1: footer.line1,
    line2: footer.line2,
    collapsed,
    detailLine: `${form.mustInclude.length} must include · ${form.wouldLove.length} interested · ${form.notInterested.length} exclusions · ${theater}`,
  };
}

export { parseBuildPlanSectionQuery, buildCollapsedSectionSummaries };
