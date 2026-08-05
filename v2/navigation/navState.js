/**
 * Modest navigation-state helpers for the v2 shell.
 * Film Detail is a contextual deep surface — not owned by Explore.
 */

import { resolveDestinationId } from '../destinations.js';
import { EXPLORE_SURFACE_IDS } from '../explore/exploreIds.js';

/**
 * @typedef {object} HomeRestoreState
 * @property {number} scrollY
 * @property {string | null} expandedShelfId
 * @property {string | null} expandedFilmKey
 * @property {number} topOppIndex
 */

/**
 * @typedef {object} ExploreRestoreState
 * @property {number} scrollY
 */

/**
 * @typedef {object} FilmDetailSurface
 * @property {'film-detail'} type
 * @property {string} filmKey
 * @property {string | null} opportunityKey
 * @property {string} originPrimary
 * @property {HomeRestoreState | null} homeRestore
 * @property {ExploreRestoreState | null} [exploreRestore]
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} OpportunityDetailSurface
 * @property {'opportunity-detail'} type
 * @property {string} filmKey
 * @property {string | null} opportunityKey
 * @property {string} originPrimary
 * @property {object | null} returnSurface
 */

/**
 * @typedef {object} ShowtimesBrowseUiState
 * @property {'today' | 'tomorrow' | 'week'} [dateMode]
 * @property {string[]} [theaterIds]
 * @property {string[]} [formatKeys]
 * @property {string} [timeRangeId]
 * @property {string | null} [expandedFilmKey]
 * @property {number} [scrollY]
 */

/**
 * @typedef {object} ShowtimesBrowseSurface
 * @property {'showtimes-browse'} type
 * @property {string} originPrimary
 * @property {HomeRestoreState | null} [homeRestore]
 * @property {ExploreRestoreState | null} [exploreRestore]
 * @property {ShowtimesBrowseUiState | null} [browseUi]
 */

/**
 * @typedef {object} PlannerSeed
 * @property {string} filmKey
 * @property {string | null} opportunityKey
 * @property {'single' | 'multi'} mode
 */

/**
 * @typedef {object} SearchUiState
 * @property {string} [query]
 * @property {string} [typeFilter]
 * @property {string | null} [timeFilter]
 * @property {string[]} [theaterIds]
 * @property {string[]} [formatTags]
 * @property {number | null} [runtimeMin]
 * @property {number | null} [runtimeMax]
 * @property {string | null} [expandedFilmKey]
 * @property {number} [scrollY]
 */

/**
 * @typedef {object} CollectionSurface
 * @property {'collection'} type
 * @property {string} collectionId
 * @property {string} originPrimary
 * @property {string | null} [query]
 * @property {ExploreRestoreState | null} [exploreRestore]
 * @property {SearchUiState | null} [searchUi]
 */

/**
 * @typedef {object} AboutMyScheduleSurface
 * @property {'about-my-schedule'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} BuildPlanSurface
 * @property {'build-plan'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} BuildPlanResultsSurface
 * @property {'build-plan-results'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 * @property {object | null} [formConfig]
 */

/**
 * @typedef {object} BuildPlanPlanDetailsSurface
 * @property {'build-plan-plan-details'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 * @property {object} plan
 */

/**
 * @typedef {object} MyScheduleWeekSurface
 * @property {'my-schedule-week'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} MyScheduleMonthSurface
 * @property {'my-schedule-month'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} ScheduleSettingsSurface
 * @property {'schedule-settings'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} TheaterDetailSurface
 * @property {'theater-detail'} type
 * @property {string} theaterId
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @returns {{
 *   primaryDestinationId: string,
 *   surface: null | FilmDetailSurface | CollectionSurface | OpportunityDetailSurface | ShowtimesSurface | AboutMyScheduleSurface | BuildPlanSurface | BuildPlanResultsSurface | BuildPlanPlanDetailsSurface | MyScheduleWeekSurface | MyScheduleMonthSurface | ScheduleSettingsSurface | TheaterDetailSurface,
 *   plannerSeed: PlannerSeed | null,
 * }}
 */
export function createInitialNavState() {
  return {
    primaryDestinationId: 'home',
    surface: null,
    plannerSeed: null,
  };
}

/**
 * @param {object} state
 * @param {string} destinationId
 */
export function selectPrimaryDestination(state, destinationId) {
  return {
    primaryDestinationId: resolveDestinationId(destinationId),
    surface: null,
    plannerSeed: null,
  };
}

/**
 * @param {object} state
 * @param {{
 *   filmKey: string,
 *   opportunityKey?: string | null,
 *   originPrimary?: string,
 *   homeRestore?: HomeRestoreState | null,
 *   exploreRestore?: ExploreRestoreState | null,
 *   returnSurface?: object | null,
 * }} params
 */
export function openFilmDetail(state, params) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId,
  );
  return {
    ...state,
    primaryDestinationId: originPrimary,
    plannerSeed: null,
    surface: {
      type: 'film-detail',
      filmKey: params.filmKey,
      opportunityKey: params.opportunityKey ?? null,
      originPrimary,
      homeRestore: params.homeRestore ?? null,
      exploreRestore: params.exploreRestore ?? null,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * @param {object} state
 * @param {{
 *   filmKey: string,
 *   opportunityKey?: string | null,
 * }} params
 */
export function openOpportunityDetail(state, params) {
  const originSurface = state.surface;
  if (
    originSurface?.type !== 'film-detail' &&
    originSurface?.type !== 'showtimes'
  ) {
    return state;
  }
  return {
    ...state,
    surface: {
      type: 'opportunity-detail',
      filmKey: params.filmKey,
      opportunityKey: params.opportunityKey ?? null,
      originPrimary: originSurface.originPrimary,
      returnSurface: originSurface,
    },
  };
}

/**
 * @param {object} state
 * @param {{
 *   filmKey: string,
 *   theaterId?: string | null,
 *   opportunityKey?: string | null,
 * }} params
 */
export function openShowtimes(state, params) {
  if (state.surface?.type !== 'film-detail') return state;
  return {
    ...state,
    surface: {
      type: 'showtimes',
      filmKey: params.filmKey,
      theaterId: params.theaterId ?? null,
      opportunityKey: params.opportunityKey ?? null,
      originPrimary: state.surface.originPrimary,
      returnSurface: state.surface,
    },
  };
}

/**
 * City-wide Showtimes browser (not a primary tab).
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   homeRestore?: HomeRestoreState | null,
 *   exploreRestore?: ExploreRestoreState | null,
 *   browseUi?: ShowtimesBrowseUiState | null,
 * }} [params]
 */
export function openShowtimesBrowse(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'explore',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary === 'home' ? 'home' : 'explore',
    plannerSeed: null,
    surface: {
      type: 'showtimes-browse',
      originPrimary,
      homeRestore: params.homeRestore ?? null,
      exploreRestore: params.exploreRestore ?? null,
      browseUi: params.browseUi ?? null,
    },
  };
}

/**
 * Patch UI state onto the showtimes-browse surface.
 * @param {object} state
 * @param {ShowtimesBrowseUiState} browseUi
 */
export function updateShowtimesBrowseUi(state, browseUi) {
  if (state.surface?.type !== 'showtimes-browse') return state;
  return {
    ...state,
    surface: {
      ...state.surface,
      browseUi: { ...(state.surface.browseUi ?? {}), ...browseUi },
    },
  };
}

/**
 * Enter Planner with a modest seed from Film Detail (no calendar write yet).
 * @param {object} state
 * @param {PlannerSeed} seed
 */
export function startPlannerFromFilm(state, seed) {
  if (!seed?.filmKey) return state;
  return {
    primaryDestinationId: 'planner',
    surface: null,
    plannerSeed: {
      filmKey: seed.filmKey,
      opportunityKey: seed.opportunityKey ?? null,
      mode: seed.mode === 'multi' ? 'multi' : 'single',
    },
  };
}

/**
 * @param {object} state
 * @param {{
 *   collectionId: string,
 *   originPrimary?: string,
 *   query?: string | null,
 *   exploreRestore?: ExploreRestoreState | null,
 * }} params
 */
export function openCollection(state, params) {
  const collectionId = params.collectionId;
  if (!EXPLORE_SURFACE_IDS.has(collectionId)) {
    return state;
  }
  return {
    ...state,
    primaryDestinationId: 'explore',
    plannerSeed: null,
    surface: {
      type: 'collection',
      collectionId,
      originPrimary: resolveDestinationId(params.originPrimary ?? 'explore'),
      query: params.query ?? null,
      exploreRestore: params.exploreRestore ?? null,
      searchUi: params.searchUi ?? null,
    },
  };
}

/**
 * Patch search UI state onto the current search-results collection surface.
 * @param {object} state
 * @param {SearchUiState} searchUi
 */
export function updateSearchUi(state, searchUi) {
  if (state.surface?.type !== 'collection') return state;
  if (state.surface.collectionId !== 'search-results') return state;
  return {
    ...state,
    surface: {
      ...state.surface,
      query: searchUi.query ?? state.surface.query,
      searchUi: { ...(state.surface.searchUi ?? {}), ...searchUi },
    },
  };
}

/**
 * Stage 1 About My Schedule deep surface.
 * Settings entry is deferred; open via query seam or future Settings row.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openAboutMySchedule(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'about-my-schedule',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Stage 1 Build a Plan configuration deep surface.
 * Results generation remains deferred.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openBuildPlan(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'build-plan',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Build a Plan Results deep surface (T-PENG-01 live itineraries by default).
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 *   formConfig?: object | null,
 * }} [params]
 */
export function openBuildPlanResults(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  const returnSurface =
    params.returnSurface ??
    (state.surface?.type === 'build-plan'
      ? state.surface
      : {
          type: 'build-plan',
          originPrimary,
          returnSurface: null,
        });
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'build-plan-results',
      originPrimary,
      returnSurface,
      formConfig: params.formConfig ?? null,
    },
  };
}

/**
 * Plan Details deep surface opened from Build a Plan Results.
 * @param {object} state
 * @param {{
 *   plan: object,
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} params
 */
export function openBuildPlanPlanDetails(state, params = {}) {
  if (!params.plan) return state;
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  const resultsOrigin =
    params.origin && typeof params.origin === 'object' ? params.origin : {};
  const returnSurface =
    params.returnSurface ??
    (state.surface?.type === 'build-plan-results'
      ? {
          ...state.surface,
          sortId: resultsOrigin.sortId ?? state.surface.sortId ?? null,
          scrollY:
            typeof resultsOrigin.scrollY === 'number'
              ? resultsOrigin.scrollY
              : state.surface.scrollY ?? null,
          activePlanId: params.plan?.id ?? state.surface.activePlanId ?? null,
        }
      : state.surface?.type === 'my-schedule-week' ||
          state.surface?.type === 'my-schedule-month'
        ? state.surface
        : {
            type: 'build-plan-results',
            originPrimary,
            returnSurface: null,
            formConfig: null,
            sortId: resultsOrigin.sortId ?? null,
            scrollY:
              typeof resultsOrigin.scrollY === 'number'
                ? resultsOrigin.scrollY
                : null,
            activePlanId: params.plan?.id ?? null,
          });
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'build-plan-plan-details',
      originPrimary,
      returnSurface,
      plan: params.plan,
    },
  };
}

/**
 * Build a Plan film-manage deep surface (Must / Would love / Not interested).
 * @param {object} state
 * @param {{
 *   mode: 'mustInclude' | 'wouldLove' | 'notInterested',
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} params
 */
export function openBuildPlanFilmManage(state, params = {}) {
  const mode = params.mode;
  if (
    mode !== 'mustInclude' &&
    mode !== 'wouldLove' &&
    mode !== 'notInterested'
  ) {
    return state;
  }
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  const returnSurface =
    params.returnSurface ??
    (state.surface?.type === 'build-plan'
      ? {
          ...state.surface,
          resumeOpenSection: 'what',
        }
      : {
          type: 'build-plan',
          originPrimary,
          returnSurface: null,
          resumeOpenSection: 'what',
        });
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'build-plan-film-manage',
      mode,
      originPrimary,
      returnSurface,
    },
  };
}

/**
 * Stage 1 My Schedule Week deep surface (fixture timeline).
 * Month view, settings sheet, persistence, and calendar sync deferred.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openMyScheduleWeek(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'my-schedule-week',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Stage 1 My Schedule Month deep surface (fixture heatmap).
 * Month view calculations, navigation, persistence, and calendar sync deferred.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openMyScheduleMonth(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'my-schedule-month',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Stage 1 Schedule Settings sheet over My Schedule.
 * Persistence, calendar sync, and production preferences deferred.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openScheduleSettings(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  const returnSurface =
    params.returnSurface ??
    (state.surface?.type === 'my-schedule-week' ||
    state.surface?.type === 'my-schedule-month'
      ? state.surface
      : {
          type: 'my-schedule-week',
          originPrimary,
          returnSurface: null,
        });
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'schedule-settings',
      originPrimary,
      returnSurface,
    },
  };
}

/**
 * Stage 1 Theater Detail deep surface (fixture-backed).
 * @param {object} state
 * @param {{
 *   theaterId?: string,
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openTheaterDetail(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'explore',
  );
  const theaterId = params.theaterId ?? 'the-beacon';
  const returnSurface =
    params.returnSurface ??
    (state.surface?.type === 'collection' &&
    state.surface.collectionId === 'theaters'
      ? state.surface
      : null);
  return {
    ...state,
    primaryDestinationId: originPrimary,
    plannerSeed: null,
    surface: {
      type: 'theater-detail',
      theaterId,
      originPrimary,
      returnSurface,
    },
  };
}

/**
 * Back from a deep surface.
 * @param {object} state
 */
export function navigateBack(state) {
  if (!state.surface) return state;

  if (
    state.surface.type === 'opportunity-detail' ||
    state.surface.type === 'showtimes' ||
    state.surface.type === 'showtimes-browse' ||
    state.surface.type === 'about-my-schedule' ||
    state.surface.type === 'build-plan' ||
    state.surface.type === 'build-plan-results' ||
    state.surface.type === 'build-plan-plan-details' ||
    state.surface.type === 'build-plan-film-manage' ||
    state.surface.type === 'my-schedule-week' ||
    state.surface.type === 'my-schedule-month' ||
    state.surface.type === 'schedule-settings' ||
    state.surface.type === 'theater-detail'
  ) {
    if (state.surface.type === 'showtimes-browse') {
      return {
        ...state,
        primaryDestinationId: resolveDestinationId(state.surface.originPrimary),
        surface: null,
        plannerSeed: null,
        _restoredHome: state.surface.homeRestore ?? null,
        _restoredExplore: state.surface.exploreRestore ?? null,
      };
    }
    return {
      ...state,
      primaryDestinationId: resolveDestinationId(state.surface.originPrimary),
      surface: state.surface.returnSurface ?? null,
      plannerSeed:
        state.surface.type === 'about-my-schedule' ||
        state.surface.type === 'build-plan' ||
        state.surface.type === 'build-plan-results' ||
        state.surface.type === 'build-plan-plan-details' ||
        state.surface.type === 'build-plan-film-manage' ||
        state.surface.type === 'my-schedule-week' ||
        state.surface.type === 'my-schedule-month' ||
        state.surface.type === 'schedule-settings'
          ? state.plannerSeed
          : null,
    };
  }

  if (state.surface.type === 'film-detail') {
    const origin = resolveDestinationId(state.surface.originPrimary);
    if (state.surface.returnSurface) {
      return {
        primaryDestinationId: origin,
        surface: state.surface.returnSurface,
        plannerSeed: null,
        _restoredExplore: state.surface.exploreRestore ?? null,
      };
    }
    return {
      primaryDestinationId: origin,
      surface: null,
      plannerSeed: null,
      _restoredHome: state.surface.homeRestore ?? null,
      _restoredExplore: state.surface.exploreRestore ?? null,
    };
  }

  if (state.surface.type === 'collection') {
    return {
      primaryDestinationId: resolveDestinationId(state.surface.originPrimary),
      surface: null,
      plannerSeed: null,
      _restoredExplore: state.surface.exploreRestore ?? null,
    };
  }

  return { ...state, surface: null, plannerSeed: null };
}

/**
 * @param {{
 *   expandedShelfId?: string | null,
 *   expandedFilmKey?: string | null,
 *   topOppIndex?: number,
 * }} ui
 */
export function captureHomeRestore(ui = {}) {
  const scrollY =
    typeof window !== 'undefined' && Number.isFinite(window.scrollY)
      ? window.scrollY
      : 0;
  return {
    scrollY,
    expandedShelfId: ui.expandedShelfId ?? null,
    expandedFilmKey: ui.expandedFilmKey ?? null,
    topOppIndex: Number.isFinite(ui.topOppIndex) ? ui.topOppIndex : 0,
  };
}

export function captureExploreRestore() {
  const scrollY =
    typeof window !== 'undefined' && Number.isFinite(window.scrollY)
      ? window.scrollY
      : 0;
  return { scrollY };
}

export { EXPLORE_SURFACE_IDS };
