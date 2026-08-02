/**
 * Shared Build a Plan film-manage variant configuration.
 * Modes: mustInclude | wouldLove | notInterested
 */

export const BUILD_PLAN_FILM_MANAGE_MODES = Object.freeze([
  'mustInclude',
  'wouldLove',
  'notInterested',
]);

/** Existing Build a Plan UI cap (Add another hidden at 2). */
export const MUST_INCLUDE_MAX = 2;

/** Canonical Would Love manage mockup footer. */
export const WOULD_LOVE_MAX = 15;

/** No documented UI cap; practical session bound for UX feedback. */
export const NOT_INTERESTED_MAX = null;

/**
 * @param {string | null | undefined} raw
 * @returns {null | 'mustInclude' | 'wouldLove' | 'notInterested'}
 */
export function parseBuildPlanFilmManageMode(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '');
  if (key === 'mustinclude' || key === 'must') return 'mustInclude';
  if (key === 'wouldlove' || key === 'wouldlovetosee' || key === 'love') {
    return 'wouldLove';
  }
  if (
    key === 'notinterested' ||
    key === 'notinterestedin' ||
    key === 'ni' ||
    key === 'excluded'
  ) {
    return 'notInterested';
  }
  return null;
}

/**
 * @param {'mustInclude' | 'wouldLove' | 'notInterested'} mode
 */
export function getBuildPlanFilmManageConfig(mode) {
  if (mode === 'mustInclude') {
    return Object.freeze({
      mode: 'mustInclude',
      bucketKey: 'mustInclude',
      pageTitle: 'Must include',
      pageSupport: 'Choose films the planner must include in your day.',
      primaryFilterId: 'saved',
      primaryFilterLabel: 'Saved',
      primaryFilterIcon: 'bookmark',
      selectedHeading: 'Selected films',
      candidateHeading: 'Add more films',
      listModeLabel: 'Recommended for this plan',
      footerCountLabel: (n) => `${n} selected`,
      footerSupport: `You can select up to ${MUST_INCLUDE_MAX} films`,
      selectionCap: MUST_INCLUDE_MAX,
      emptySelected: 'No must-include films yet',
      emptyCandidates: 'No more films to add',
      capReachedMessage: `You can select up to ${MUST_INCLUDE_MAX} must-include films.`,
      addAria: (title) => `Add ${title} to must include`,
      removeAria: (title) => `Remove ${title} from must include`,
    });
  }
  if (mode === 'notInterested') {
    return Object.freeze({
      mode: 'notInterested',
      bucketKey: 'notInterested',
      pageTitle: 'Not interested in',
      pageSupport: 'Choose films you want the planner to avoid.',
      primaryFilterId: 'notInterested',
      primaryFilterLabel: 'Not interested',
      primaryFilterIcon: 'ban',
      selectedHeading: 'Excluded films',
      candidateHeading: 'Exclude more films',
      listModeLabel: 'Browse all films',
      footerCountLabel: (n) => `${n} selected`,
      footerSupport: 'Excluded from planner results',
      selectionCap: NOT_INTERESTED_MAX,
      emptySelected: 'No excluded films yet',
      emptyCandidates: 'No more films to exclude',
      capReachedMessage: null,
      addAria: (title) => `Exclude ${title} from planner results`,
      removeAria: (title) => `Stop excluding ${title}`,
    });
  }
  return Object.freeze({
    mode: 'wouldLove',
    bucketKey: 'wouldLove',
    pageTitle: 'Would love to see',
    pageSupport: 'Choose films you’d like the planner to prioritize.',
    primaryFilterId: 'saved',
    primaryFilterLabel: 'Saved',
    primaryFilterIcon: 'bookmark',
    selectedHeading: 'Selected films',
    candidateHeading: 'Add more films',
    listModeLabel: 'Recommended for this plan',
    footerCountLabel: (n) => `${n} selected`,
    footerSupport: `You can select up to ${WOULD_LOVE_MAX} films`,
    selectionCap: WOULD_LOVE_MAX,
    emptySelected: 'No films selected yet',
    emptyCandidates: 'No more films to add',
    capReachedMessage: `You can select up to ${WOULD_LOVE_MAX} films.`,
    addAria: (title) => `Add ${title} to would love to see`,
    removeAria: (title) => `Remove ${title} from would love to see`,
  });
}

export const BUILD_PLAN_FILM_MANAGE_SHARED_FILTERS = Object.freeze([
  Object.freeze({
    id: 'saved',
    label: 'Saved',
    icon: 'bookmark',
    available: true,
  }),
  Object.freeze({
    id: 'theater',
    label: 'Theater',
    icon: 'building',
    available: true,
  }),
  Object.freeze({
    id: 'format',
    label: 'Format',
    icon: 'film',
    available: true,
  }),
]);
