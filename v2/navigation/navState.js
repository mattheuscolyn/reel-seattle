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
 * @property {{ mode?: string, startDate?: string, endDate?: string }} [dateSelection]
 * @property {{ preset?: string, customStartMin?: number | null, customEndMin?: number | null }} [time]
 * @property {boolean} [favoritesOnly]
 * @property {'any' | 'saved' | 'not_saved'} [savedMode]
 * @property {'any' | 'not_seen' | 'seen'} [seenMode]
 * @property {'any' | 'hide' | 'only'} [notInterestedMode]
 * @property {'earliest' | 'title_az' | 'shortest' | 'longest'} [sortMode]
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
 * @property {object | null} [plan]
 * @property {string | null} [planId]
 */

/**
 * @typedef {object} TheaterDetailSurface
 * @property {'theater-detail'} type
 * @property {string} theaterId
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @typedef {object} AdminTmdbReviewSurface
 * @property {'admin-tmdb-review'} type
 * @property {string} originPrimary
 * @property {object | null} [returnSurface]
 */

/**
 * @returns {{
 *   primaryDestinationId: string,
 *   surface: null | FilmDetailSurface | CollectionSurface | OpportunityDetailSurface | ShowtimesSurface | BuildPlanSurface | BuildPlanResultsSurface | BuildPlanPlanDetailsSurface | TheaterDetailSurface,
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
      returnSurface: params.returnSurface ?? null,
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
  const originPrimary = resolveDestinationId(params.originPrimary ?? 'explore');
  return {
    ...state,
    // Profile-origin collections keep Profile as the primary destination.
    // Home/Explore origins still land on Explore (Opening This Week tab
    // highlight is handled separately in resolveActivePrimaryId).
    primaryDestinationId: originPrimary === 'profile' ? 'profile' : 'explore',
    plannerSeed: null,
    surface: {
      type: 'collection',
      collectionId,
      originPrimary,
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
 * Plan Details deep surface — generated Results plan and/or saved planId.
 * @param {object} state
 * @param {{
 *   plan?: object | null,
 *   planId?: string | null,
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 *   origin?: object | null,
 * }} params
 */
export function openBuildPlanPlanDetails(state, params = {}) {
  const planId =
    (typeof params.planId === 'string' && params.planId.trim()) ||
    (typeof params.plan?.planId === 'string' && params.plan.planId.trim()) ||
    (typeof params.plan?.id === 'string' &&
    String(params.plan.id).startsWith('accepted:')
      ? String(params.plan.id).trim()
      : null);
  if (!params.plan && !planId) return state;
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  const resultsOrigin =
    params.origin && typeof params.origin === 'object' ? params.origin : {};
  const hasExplicitReturn = Object.prototype.hasOwnProperty.call(
    params,
    'returnSurface',
  );
  const returnSurface = hasExplicitReturn
    ? params.returnSurface ?? null
    : state.surface?.type === 'build-plan-results'
      ? {
          ...state.surface,
          sortId: resultsOrigin.sortId ?? state.surface.sortId ?? null,
          scrollY:
            typeof resultsOrigin.scrollY === 'number'
              ? resultsOrigin.scrollY
              : state.surface.scrollY ?? null,
          activePlanId:
            params.plan?.id ?? planId ?? state.surface.activePlanId ?? null,
        }
      : null;
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'build-plan-plan-details',
      originPrimary,
      returnSurface,
      plan: params.plan ?? null,
      planId,
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
 * Build a Plan locked-showtime performance picker.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} params
 */
export function openBuildPlanShowtimeManage(state, params = {}) {
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
      type: 'build-plan-showtime-manage',
      originPrimary,
      returnSurface,
    },
  };
}

/**
 * Build a Plan theater-manage deep surface (custom theater selection).
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} params
 */
export function openBuildPlanTheaterManage(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'planner',
  );
  const returnSurface =
    params.returnSurface ??
    (state.surface?.type === 'build-plan'
      ? {
          ...state.surface,
          resumeOpenSection: 'where',
        }
      : {
          type: 'build-plan',
          originPrimary,
          returnSurface: null,
          resumeOpenSection: 'where',
        });
  return {
    ...state,
    primaryDestinationId: originPrimary,
    surface: {
      type: 'build-plan-theater-manage',
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
 * Format detail within Formats & Experiences.
 * @param {object} state
 * @param {{
 *   formatId: string,
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} params
 */
export function openFormatDetail(state, params) {
  if (!params?.formatId) return state;
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'explore',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary === 'home' ? 'home' : 'explore',
    plannerSeed: null,
    surface: {
      type: 'format-detail',
      formatId: params.formatId,
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Experience detail within Formats & Experiences.
 * @param {object} state
 * @param {{
 *   experienceId: string,
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} params
 */
export function openExperienceDetail(state, params) {
  if (!params?.experienceId) return state;
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'explore',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary === 'home' ? 'home' : 'explore',
    plannerSeed: null,
    surface: {
      type: 'experience-detail',
      experienceId: params.experienceId,
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Compare Formats surface.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openCompareFormats(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'explore',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary === 'home' ? 'home' : 'explore',
    plannerSeed: null,
    surface: {
      type: 'compare-formats',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Help Me Choose a Format surface.
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openFormatRecommendation(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'explore',
  );
  return {
    ...state,
    primaryDestinationId: originPrimary === 'home' ? 'home' : 'explore',
    plannerSeed: null,
    surface: {
      type: 'format-recommendation',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
    },
  };
}

/**
 * Internal TMDB match review (admin-only).
 * @param {object} state
 * @param {{
 *   originPrimary?: string,
 *   returnSurface?: object | null,
 * }} [params]
 */
export function openAdminTmdbReview(state, params = {}) {
  const originPrimary = resolveDestinationId(
    params.originPrimary ?? state.primaryDestinationId ?? 'profile',
  );
  return {
    ...state,
    primaryDestinationId: 'profile',
    plannerSeed: null,
    surface: {
      type: 'admin-tmdb-review',
      originPrimary,
      returnSurface: params.returnSurface ?? null,
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
    state.surface.type === 'build-plan' ||
    state.surface.type === 'build-plan-results' ||
    state.surface.type === 'build-plan-plan-details' ||
    state.surface.type === 'build-plan-film-manage' ||
    state.surface.type === 'build-plan-showtime-manage' ||
    state.surface.type === 'build-plan-theater-manage' ||
    state.surface.type === 'theater-detail' ||
    state.surface.type === 'format-detail' ||
    state.surface.type === 'experience-detail' ||
    state.surface.type === 'compare-formats' ||
    state.surface.type === 'format-recommendation' ||
    state.surface.type === 'admin-tmdb-review'
  ) {
    if (state.surface.type === 'showtimes-browse') {
      if (state.surface.returnSurface) {
        return {
          ...state,
          primaryDestinationId: resolveDestinationId(
            state.surface.originPrimary,
          ),
          surface: state.surface.returnSurface,
          plannerSeed: null,
        };
      }
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
        state.surface.type === 'build-plan' ||
        state.surface.type === 'build-plan-results' ||
        state.surface.type === 'build-plan-plan-details' ||
        state.surface.type === 'build-plan-film-manage' ||
        state.surface.type === 'build-plan-showtime-manage'
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
