import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DestinationPlaceholder from './DestinationPlaceholder.jsx';
import AppHeader from './home/AppHeader.jsx';
import PrimaryNav from './PrimaryNav.jsx';
import { resolveActivePrimaryId } from './destinations.js';
import { loadHomeData } from './data/loadHomeData.js';
import { loadFilmEnrichment } from './enrichment/loadFilmEnrichment.js';
import { reconcileUserFilmStores } from './stores/reconcileUserFilmStores.js';
import { subscribeFilmStoreMutations } from './auth/filmStoreMutationBridge.js';
import { isAllowedV2Hostname } from './isAllowedV2Hostname.js';
import { startAuthController } from './auth/authSessionStore.js';
import { useAuth } from './auth/useAuth.js';
import { consumeAuthReturnToProfile } from './auth/oauthRedirect.js';
import {
  readQcHeaderNotificationsModeFromLocation,
  resolveNotificationBellPresentation,
} from './notifications/notificationBellPresentation.js';
import {
  applyNotificationReadOverrides,
  countUnreadNotifications,
  markAllNotificationsReadInOverrides,
  markNotificationReadInOverrides,
  notificationNavigationTarget,
} from './notifications/notificationModel.js';
import NotificationsSheet from './notifications/NotificationsSheet.jsx';
import {
  fetchUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from './notifications/notificationsSync.js';
import {
  readQcNotificationsModeFromLocation,
  resolveNotificationsDataSource,
} from './fixtures/notificationsMockupFixture.js';
import { COLLECTION_IDS } from './explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openAboutMySchedule,
  openBuildPlan,
  openBuildPlanResults,
  openBuildPlanFilmManage,
  openBuildPlanTheaterManage,
  openBuildPlanPlanDetails,
  openCollection,
  openFilmDetail,
  openMyScheduleWeek,
  openMyScheduleMonth,
  openScheduleSettings,
  openTheaterDetail,
  openOpportunityDetail,
  openShowtimes,
  openShowtimesBrowse,
  openFormatDetail,
  openExperienceDetail,
  openCompareFormats,
  openFormatRecommendation,
  openAdminTmdbReview,
  selectPrimaryDestination,
  startPlannerFromFilm,
  updateSearchUi,
  updateShowtimesBrowseUi,
} from './navigation/navState.js';
import AboutMyScheduleSurface from './surfaces/AboutMyScheduleSurface.jsx';
import CollectionSurface from './surfaces/CollectionSurface.jsx';
import PersonalFilmCollectionSurface from './collections/PersonalFilmCollectionSurface.jsx';
import { isPersonalCollectionId } from './collections/personalCollectionModel.js';
import FilmDetailSurface from './surfaces/FilmDetailSurface.jsx';
import OpportunityDetailSurface from './surfaces/OpportunityDetailSurface.jsx';
import SearchResultsSurface from './surfaces/SearchResultsSurface.jsx';
import ShowtimesSurface from './surfaces/ShowtimesSurface.jsx';
import ShowtimesBrowseSurface from './surfaces/ShowtimesBrowseSurface.jsx';
import OpeningThisWeekSurface from './opening/OpeningThisWeekSurface.jsx';
import BuildPlanSurface from './planner/BuildPlanSurface.jsx';
import BuildPlanResultsSurface from './planner/BuildPlanResultsSurface.jsx';
import BuildPlanFilmManageSurface from './planner/BuildPlanFilmManageSurface.jsx';
import BuildPlanTheaterManageSurface from './planner/BuildPlanTheaterManageSurface.jsx';
import BuildPlanPlanDetailsSurface from './planner/BuildPlanPlanDetailsSurface.jsx';
import MyScheduleWeekSurface from './planner/MyScheduleWeekSurface.jsx';
import MyScheduleMonthSurface from './planner/MyScheduleMonthSurface.jsx';
import ScheduleSettingsSurface from './planner/ScheduleSettingsSurface.jsx';
import TheatersSurface from './theaters/TheatersSurface.jsx';
import TheaterDetailSurface from './theaters/TheaterDetailSurface.jsx';
import FormatsExperiencesSurface from './formatsExperiences/FormatsExperiencesSurface.jsx';
import FormatDetailSurface from './formatsExperiences/FormatDetailSurface.jsx';
import ExperienceDetailSurface from './formatsExperiences/ExperienceDetailSurface.jsx';
import CompareFormatsSurface from './formatsExperiences/CompareFormatsSurface.jsx';
import FormatRecommendationSurface from './formatsExperiences/FormatRecommendationSurface.jsx';
import TmdbMatchReviewSurface from './admin/tmdbReview/TmdbMatchReviewSurface.jsx';
import { createDefaultShowtimesBrowseUi } from './showtimes/showtimesBrowseModel.js';
import { resolveFilmDetailBackLabel } from './filmDetail/filmDetailModel.js';
import { isAboutMyScheduleQueryOpen } from './fixtures/aboutMyScheduleMockupFixture.js';
import {
  createBuildPlanFormState,
  isBuildPlanMockupMode,
} from './fixtures/buildPlanMockupFixture.js';
import {
  createBuildPlanFilmManageMockupForm,
  getBuildPlanFilmManageMockupMode,
} from './fixtures/buildPlanFilmManageMockupFixture.js';
import {
  clearBuildPlanFormSession,
  ensureBuildPlanFormSession,
} from './planner/buildPlanFormSession.js';
import { isPlanResultsMockupMode } from './planner/resolveBuildPlanResultsPresentation.js';
import {
  getBuildPlanPlanDetailsMockupPlan,
  isPlanDetailsMockupMode,
} from './fixtures/buildPlanPlanDetailsMockupFixture.js';
import { isMyScheduleWeekQueryOpen } from './fixtures/myScheduleWeekMockupFixture.js';
import { isMyScheduleMonthQueryOpen } from './fixtures/myScheduleMonthMockupFixture.js';
import { isScheduleSettingsQueryOpen } from './fixtures/scheduleSettingsMockupFixture.js';
import { isTheaterDetailQueryOpen } from './fixtures/theaterDetailMockupFixture.js';
import { isFilmDetailMockupFixtureMode, getFilmDetailMockupPresentation } from './fixtures/filmDetailMockupFixture.js';
import { isFilmDetailVisualFixtureMode } from './fixtures/filmDetailVisualFixtures.js';
import { getCachedTmdbOnlyFilm } from './filmDetail/tmdbOnlyFilmCache.js';
import { asTmdbFilmId } from './search/tmdbSearchClient.js';
import {
  applySaveToggle,
  buildSaveActionState,
} from './save/saveActionState.js';
import {
  applySeenToggle,
  buildSeenActionState,
} from './save/seenActionState.js';
import {
  applyNotInterestedToggle,
  buildNotInterestedActionState,
} from './save/notInterestedActionState.js';
import {
  isSavedPlanDetailsPlan,
  readSavedPlanIdQuery,
  resolveSavedPlanDetailsPlan,
  syncSavedPlanIdQuery,
} from './planner/planLifecycle.js';

function resolveHostname() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.hostname;
}

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

async function shareFilmDetail(title) {
  const text = `${title} — Reel Seattle`;
  const note =
    'Shareable Film Detail URLs are not available in this local v2 prototype yet.';
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Reel Seattle', text: `${text}. ${note}` });
      return 'Shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return null;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text}. ${note}`);
      return 'Copied share text (no durable Film Detail URL yet)';
    }
  } catch {
    // fall through
  }
  return 'Sharing is not available in this browser';
}

/**
 * Deep-link helper for TMDB-only (and any) Film Detail via `?filmId=`.
 * Prefer `tmdb:<id>` for external-only films.
 */
function readFilmIdQuery() {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URLSearchParams(window.location.search).get('filmId');
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function syncFilmIdQuery(filmId) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (filmId) url.searchParams.set('filmId', filmId);
    else url.searchParams.delete('filmId');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // ignore
  }
}

export default function V2App() {
  const hostname = resolveHostname();
  const auth = useAuth();
  const [nav, setNav] = useState(createInitialNavState);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cloudNotifications, setCloudNotifications] = useState(
    /** @type {import('./notifications/notificationModel.js').NotificationItem[]} */ ([]),
  );
  const [notificationReadOverrides, setNotificationReadOverrides] = useState(
    {},
  );
  const [homeRestorePending, setHomeRestorePending] = useState(null);
  const [exploreRestorePending, setExploreRestorePending] = useState(null);
  const [shareStatus, setShareStatus] = useState(null);
  const [profileStubStatus, setProfileStubStatus] = useState(null);
  const [saveRevision, setSaveRevision] = useState(0);
  const [fixtureSaved, setFixtureSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [seenRevision, setSeenRevision] = useState(0);
  const [fixtureSeen, setFixtureSeen] = useState(false);
  const [seenError, setSeenError] = useState(null);
  const [notInterestedRevision, setNotInterestedRevision] = useState(0);
  const [fixtureNotInterested, setFixtureNotInterested] = useState(false);
  const [notInterestedError, setNotInterestedError] = useState(null);
  const [acceptedPlansRevision, setAcceptedPlansRevision] = useState(0);
  const [scheduleSettingsRevision, setScheduleSettingsRevision] = useState(0);
  const [resultsShareHandler, setResultsShareHandler] = useState(null);
  const [planDetailsShareHandler, setPlanDetailsShareHandler] = useState(null);
  const [sharedHomeData, setSharedHomeData] = useState({
    status: 'loading',
    homeData: null,
    errorMessage: null,
  });
  const [enrichmentState, setEnrichmentState] = useState({
    status: 'loading',
    index: null,
    warning: null,
  });

  useEffect(() => {
    return subscribeFilmStoreMutations((event) => {
      if (event.preferenceType === 'saved') {
        setSaveRevision((value) => value + 1);
      } else if (event.preferenceType === 'seen') {
        setSeenRevision((value) => value + 1);
      } else if (event.preferenceType === 'not_interested') {
        setNotInterestedRevision((value) => value + 1);
      }
    });
  }, []);

  useEffect(() => {
    // Auth is non-blocking — Home/Explore/Planner stay usable while this runs.
    void startAuthController().then(() => {
      if (!consumeAuthReturnToProfile()) return;
      setNav((current) => selectPrimaryDestination(current, 'profile'));
      window.scrollTo(0, 0);
    });
  }, []);

  const qcHeaderNotifications = readQcHeaderNotificationsModeFromLocation();
  const qcNotifications = readQcNotificationsModeFromLocation();
  const notificationsQcActive = Boolean(
    qcNotifications ||
      (qcHeaderNotifications && qcHeaderNotifications !== 'logged-out'),
  );

  useEffect(() => {
    if (!auth?.signedIn || notificationsQcActive) {
      if (!auth?.signedIn) {
        setCloudNotifications([]);
        setNotificationReadOverrides({});
      }
      return undefined;
    }

    let cancelled = false;

    async function refreshNotifications() {
      const result = await fetchUserNotifications();
      if (cancelled || !result.ok) return;
      setCloudNotifications(result.items);
      setNotificationReadOverrides({});
    }

    void refreshNotifications();

    const onFocus = () => {
      void refreshNotifications();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [auth?.signedIn, notificationsQcActive]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadHomeData(), loadFilmEnrichment()])
      .then(([homeResult, enrichmentResult]) => {
        if (cancelled) return;
        if (!homeResult.ok) {
          setSharedHomeData({
            status: 'error',
            homeData: null,
            errorMessage: homeResult.error,
          });
        } else {
          setSharedHomeData({
            status: 'ready',
            homeData: homeResult.homeData,
            errorMessage: null,
          });
          try {
            reconcileUserFilmStores(
              typeof localStorage !== 'undefined' ? localStorage : null,
              homeResult.homeData,
            );
          } catch {
            // Store reconciliation must never block Home.
          }
        }
        setEnrichmentState({
          status: enrichmentResult.status,
          index: enrichmentResult.index,
          warning: enrichmentResult.warning,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setSharedHomeData({
          status: 'error',
          homeData: null,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        setEnrichmentState({
          status: 'unavailable',
          index: null,
          warning: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stage 1 seam: Settings sheet deferred — open About via ?aboutSchedule=1
  useEffect(() => {
    if (!isAboutMyScheduleQueryOpen()) return;
    setNav((current) => {
      if (current.surface?.type === 'about-my-schedule') return current;
      return openAboutMySchedule(current, { originPrimary: 'planner' });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const manageMode = getBuildPlanFilmManageMockupMode();
    if (manageMode) {
      ensureBuildPlanFormSession(() =>
        createBuildPlanFilmManageMockupForm(manageMode),
      );
      setNav((current) => {
        if (current.surface?.type === 'build-plan-film-manage') return current;
        return openBuildPlanFilmManage(current, {
          originPrimary: 'planner',
          mode: manageMode,
        });
      });
      window.scrollTo(0, 0);
      return;
    }
    if (isPlanDetailsMockupMode()) {
      setNav((current) => {
        if (current.surface?.type === 'build-plan-plan-details') return current;
        return openBuildPlanPlanDetails(current, {
          originPrimary: 'planner',
          plan: getBuildPlanPlanDetailsMockupPlan(),
          returnSurface: {
            type: 'build-plan-results',
            originPrimary: 'planner',
            returnSurface: null,
            formConfig: ensureBuildPlanFormSession(() =>
              createBuildPlanFormState(),
            ),
          },
        });
      });
      window.scrollTo(0, 0);
      return;
    }
    if (isPlanResultsMockupMode()) {
      const form = ensureBuildPlanFormSession(() => createBuildPlanFormState());
      setNav((current) => {
        if (
          current.surface?.type === 'build-plan-results' ||
          current.surface?.type === 'build-plan-plan-details'
        ) {
          return current;
        }
        return openBuildPlanResults(current, {
          originPrimary: 'planner',
          formConfig: form,
        });
      });
      window.scrollTo(0, 0);
      return;
    }
    if (!isBuildPlanMockupMode()) return;
    setNav((current) => {
      if (
        current.surface?.type === 'build-plan' ||
        current.surface?.type === 'build-plan-film-manage'
      ) {
        return current;
      }
      return openBuildPlan(current, { originPrimary: 'planner' });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!isMyScheduleWeekQueryOpen()) return;
    setNav((current) => {
      if (current.surface?.type === 'my-schedule-week') return current;
      return openMyScheduleWeek(current, { originPrimary: 'planner' });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const planId = readSavedPlanIdQuery();
    if (!planId) return;
    setNav((current) => {
      if (
        current.surface?.type === 'build-plan-plan-details' &&
        (current.surface.planId === planId ||
          current.surface.plan?.planId === planId ||
          current.surface.plan?.id === planId)
      ) {
        return current;
      }
      const plan = resolveSavedPlanDetailsPlan(planId, {
        storage: getBrowserStorage(),
      });
      return openBuildPlanPlanDetails(current, {
        originPrimary: 'planner',
        plan,
        planId,
        returnSurface: null,
      });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (nav.surface?.type !== 'build-plan-plan-details') {
      if (readSavedPlanIdQuery()) syncSavedPlanIdQuery(null);
      return;
    }
    const planId =
      nav.surface.planId ||
      (isSavedPlanDetailsPlan(nav.surface.plan)
        ? nav.surface.plan?.planId || nav.surface.plan?.id
        : null);
    if (planId) syncSavedPlanIdQuery(planId);
    else if (readSavedPlanIdQuery()) syncSavedPlanIdQuery(null);
  }, [nav.surface]);

  useEffect(() => {
    if (!isMyScheduleMonthQueryOpen()) return;
    setNav((current) => {
      if (current.surface?.type === 'my-schedule-month') return current;
      return openMyScheduleMonth(current, { originPrimary: 'planner' });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!isScheduleSettingsQueryOpen()) return;
    setNav((current) => {
      if (current.surface?.type === 'schedule-settings') return current;
      return openScheduleSettings(current, { originPrimary: 'planner' });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!isTheaterDetailQueryOpen()) return;
    setNav((current) => {
      if (current.surface?.type === 'theater-detail') return current;
      const params = new URLSearchParams(window.location.search);
      const theaterId =
        params.get('theaterId')?.trim() ||
        (params.get('theaterMockup') === '1' ? 'fixture-beacon' : 'the-beacon');
      return openTheaterDetail(current, {
        originPrimary: 'explore',
        theaterId,
      });
    });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const filmId = readFilmIdQuery();
    if (!filmId) return;
    setNav((current) => {
      if (
        current.surface?.type === 'film-detail' &&
        current.surface.filmKey === filmId
      ) {
        return current;
      }
      return openFilmDetail(current, {
        filmKey: filmId,
        originPrimary: current.primaryDestinationId || 'explore',
      });
    });
    window.scrollTo(0, 0);
  }, []);

  const prevFilmDetailRef = useRef(false);
  useEffect(() => {
    const isFilmDetailSurface = nav.surface?.type === 'film-detail';
    if (isFilmDetailSurface) {
      const key =
        typeof nav.surface.filmKey === 'string'
          ? nav.surface.filmKey.trim()
          : '';
      if (key) syncFilmIdQuery(key);
      prevFilmDetailRef.current = true;
      return;
    }
    if (prevFilmDetailRef.current) {
      syncFilmIdQuery(null);
      prevFilmDetailRef.current = false;
    }
  }, [nav.surface]);

  const handleSelectDestination = useCallback((destinationId) => {
    setHomeRestorePending(null);
    setExploreRestorePending(null);
    setShareStatus(null);
    setProfileStubStatus(null);
    clearBuildPlanFormSession();
    setNav((current) => selectPrimaryDestination(current, destinationId));
    window.scrollTo(0, 0);
  }, []);

  const handleOpenAdminTmdbReview = useCallback(() => {
    setNav((current) =>
      openAdminTmdbReview(current, {
        originPrimary: 'profile',
        returnSurface: null,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') !== 'tmdb-review') return;
    setNav((current) => {
      if (current.surface?.type === 'admin-tmdb-review') return current;
      return openAdminTmdbReview(current, { originPrimary: 'profile' });
    });
    window.scrollTo(0, 0);
  }, []);

  const handleOpenFilmDetail = useCallback((params) => {
    setShareStatus(null);
    setSaveError(null);
    setFixtureSaved(false);
    setSeenError(null);
    setFixtureSeen(false);
    setNotInterestedError(null);
    // Mockup fixture ships with Not interested selected; visual QC starts off.
    setFixtureNotInterested(isFilmDetailMockupFixtureMode());
    setNav((current) =>
      openFilmDetail(current, {
        ...params,
        returnSurface:
          params.returnSurface ??
          (current.surface?.type === 'collection' ||
          current.surface?.type === 'theater-detail' ||
          current.surface?.type === 'showtimes-browse' ||
          current.surface?.type === 'my-schedule-week' ||
          current.surface?.type === 'my-schedule-month' ||
          current.surface?.type === 'build-plan-plan-details'
            ? current.surface
            : null),
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenCollection = useCallback((params) => {
    setHomeRestorePending(null);
    setNav((current) => openCollection(current, params));
    window.scrollTo(0, 0);
  }, []);

  const handleOpenShowtimesBrowse = useCallback((params) => {
    setHomeRestorePending(null);
    setNav((current) => openShowtimesBrowse(current, params));
    window.scrollTo(0, 0);
  }, []);

  const handleShowtimesBrowseUiChange = useCallback((browseUi) => {
    setNav((current) => updateShowtimesBrowseUi(current, browseUi));
  }, []);

  const handleSearchStateChange = useCallback((searchUi) => {
    setNav((current) => updateSearchUi(current, searchUi));
  }, []);

  const handleOpenTheaterDetail = useCallback((params) => {
    setNav((current) =>
      openTheaterDetail(current, {
        originPrimary: params.originPrimary ?? 'explore',
        theaterId: params.theaterId,
        returnSurface: params.returnSurface ?? current.surface,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenFormatDetail = useCallback((params) => {
    setNav((current) =>
      openFormatDetail(current, {
        formatId: params.formatId,
        originPrimary: params.originPrimary ?? current.primaryDestinationId,
        returnSurface: params.returnSurface ?? current.surface,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenExperienceDetail = useCallback((params) => {
    setNav((current) =>
      openExperienceDetail(current, {
        experienceId: params.experienceId,
        originPrimary: params.originPrimary ?? current.primaryDestinationId,
        returnSurface: params.returnSurface ?? current.surface,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenCompareFormats = useCallback((params = {}) => {
    setNav((current) =>
      openCompareFormats(current, {
        originPrimary: params.originPrimary ?? current.primaryDestinationId,
        returnSurface: params.returnSurface ?? current.surface,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenFormatRecommendation = useCallback((params = {}) => {
    setNav((current) =>
      openFormatRecommendation(current, {
        originPrimary: params.originPrimary ?? current.primaryDestinationId,
        returnSurface: params.returnSurface ?? current.surface,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleBrowseFormatShowtimes = useCallback(
    ({ formatKeys, returnSurface } = {}) => {
      setHomeRestorePending(null);
      setNav((current) =>
        openShowtimesBrowse(current, {
          // Formats & Experiences is an Explore concept even when entered
          // from the Home quick path; keep Explore active in Showtimes.
          originPrimary: 'explore',
          returnSurface: returnSurface ?? current.surface,
          browseUi: {
            ...createDefaultShowtimesBrowseUi(),
            dateMode: 'week',
            formatKeys: Array.isArray(formatKeys) ? formatKeys : [],
          },
        }),
      );
      window.scrollTo(0, 0);
    },
    [],
  );

  const handleBrowseTheaterShowtimes = useCallback(
    ({ theaterId, returnSurface } = {}) => {
      if (!theaterId) return;
      setHomeRestorePending(null);
      setNav((current) =>
        openShowtimesBrowse(current, {
          originPrimary:
            current.surface?.originPrimary ??
            current.primaryDestinationId ??
            'explore',
          returnSurface: returnSurface ?? current.surface,
          browseUi: {
            ...createDefaultShowtimesBrowseUi(),
            dateMode: 'week',
            theaterIds: [theaterId],
          },
        }),
      );
      window.scrollTo(0, 0);
    },
    [],
  );

  const handleBack = useCallback(() => {
    setShareStatus(null);
    setSaveError(null);
    setSeenError(null);
    setNotInterestedError(null);
    setNav((current) => {
      const prevType = current.surface?.type;
      const next = navigateBack(current);
      const nextType = next.surface?.type;
      const stillInBuildPlanTree =
        nextType === 'build-plan' ||
        nextType === 'build-plan-film-manage' ||
        nextType === 'build-plan-results';
      if (
        (prevType === 'build-plan' ||
          prevType === 'build-plan-film-manage' ||
          prevType === 'build-plan-results') &&
        !stillInBuildPlanTree
      ) {
        clearBuildPlanFormSession();
      }
      if (next._restoredHome) setHomeRestorePending(next._restoredHome);
      if (next._restoredExplore) setExploreRestorePending(next._restoredExplore);
      const { _restoredHome, _restoredExplore, ...clean } = next;
      return clean;
    });
  }, []);

  const handleOpenOpportunity = useCallback((params) => {
    setNav((current) => openOpportunityDetail(current, params));
    window.scrollTo(0, 0);
  }, []);

  const handleOpenShowtimes = useCallback((params) => {
    setNav((current) => openShowtimes(current, params));
    window.scrollTo(0, 0);
  }, []);

  const handleStartPlanner = useCallback((seed) => {
    setNav((current) => startPlannerFromFilm(current, seed));
    window.scrollTo(0, 0);
  }, []);

  const handleOpenBuildPlan = useCallback(() => {
    setNav((current) =>
      openBuildPlan(current, { originPrimary: 'planner' }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenBuildPlanFilmManage = useCallback((mode) => {
    setNav((current) =>
      openBuildPlanFilmManage(current, {
        originPrimary: 'planner',
        mode,
        returnSurface:
          current.surface?.type === 'build-plan'
            ? {
                ...current.surface,
                resumeOpenSection: 'what',
              }
            : {
                type: 'build-plan',
                originPrimary: 'planner',
                returnSurface: null,
                resumeOpenSection: 'what',
              },
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenBuildPlanTheaterManage = useCallback(() => {
    setNav((current) =>
      openBuildPlanTheaterManage(current, {
        originPrimary: 'planner',
        returnSurface:
          current.surface?.type === 'build-plan'
            ? {
                ...current.surface,
                resumeOpenSection: 'where',
              }
            : {
                type: 'build-plan',
                originPrimary: 'planner',
                returnSurface: null,
                resumeOpenSection: 'where',
              },
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenBuildPlanResults = useCallback((formConfig = null) => {
    setNav((current) =>
      openBuildPlanResults(current, {
        originPrimary: 'planner',
        formConfig,
        returnSurface:
          current.surface?.type === 'build-plan'
            ? current.surface
            : {
                type: 'build-plan',
                originPrimary: 'planner',
                returnSurface: null,
              },
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenBuildPlanPlanDetails = useCallback((plan, origin = {}) => {
    setNav((current) => {
      const hasExplicitReturn = Object.prototype.hasOwnProperty.call(
        origin,
        'returnSurface',
      );
      const fromResults = current.surface?.type === 'build-plan-results';
      const fromSchedule =
        current.surface?.type === 'my-schedule-week' ||
        current.surface?.type === 'my-schedule-month';
      const returnSurface = hasExplicitReturn
        ? origin.returnSurface ?? null
        : fromResults
          ? {
              ...current.surface,
              sortId: origin.sortId ?? current.surface.sortId ?? null,
              scrollY:
                typeof origin.scrollY === 'number'
                  ? origin.scrollY
                  : typeof window !== 'undefined'
                    ? window.scrollY
                    : 0,
              activePlanId: plan?.id ?? plan?.planId ?? null,
            }
          : fromSchedule
            ? current.surface
            : null;
      const planId =
        typeof origin.planId === 'string'
          ? origin.planId
          : plan?.planId ||
            (typeof plan?.id === 'string' && plan.id.startsWith('accepted:')
              ? plan.id
              : null);
      return openBuildPlanPlanDetails(current, {
        originPrimary: 'planner',
        plan,
        planId,
        origin: {
          sortId: origin.sortId ?? null,
          scrollY:
            typeof origin.scrollY === 'number'
              ? origin.scrollY
              : typeof window !== 'undefined'
                ? window.scrollY
                : 0,
        },
        returnSurface,
      });
    });
    window.scrollTo(0, 0);
  }, []);

  const handleOpenSavedPlan = useCallback(
    (planId) => {
      const id = typeof planId === 'string' ? planId.trim() : '';
      if (!id) return;
      const plan = resolveSavedPlanDetailsPlan(id, {
        storage: getBrowserStorage(),
        enrichmentIndex: enrichmentState.index,
        homeData: sharedHomeData.homeData,
      });
      handleOpenBuildPlanPlanDetails(plan, {
        planId: id,
        returnSurface: null,
      });
    },
    [enrichmentState.index, sharedHomeData.homeData, handleOpenBuildPlanPlanDetails],
  );

  const handleOpenMyScheduleWeek = useCallback((options = {}) => {
    setNav((current) =>
      openMyScheduleWeek(current, {
        originPrimary: 'planner',
        focusDate: options.focusDate ?? null,
        focusPlanId: options.focusPlanId ?? null,
        returnSurface: Object.prototype.hasOwnProperty.call(
          options,
          'returnSurface',
        )
          ? options.returnSurface ?? null
          : null,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenMyScheduleMonth = useCallback(() => {
    setNav((current) =>
      openMyScheduleMonth(current, { originPrimary: 'planner' }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenScheduleSearch = useCallback(() => {
    setProfileStubStatus(
      'Search Results prefilter from My Schedule is deferred in Stage 1.',
    );
    window.setTimeout(() => setProfileStubStatus(null), 2500);
  }, []);

  const handleOpenScheduleSettings = useCallback(() => {
    setNav((current) =>
      openScheduleSettings(current, {
        originPrimary: 'planner',
        returnSurface:
          current.surface?.type === 'my-schedule-week' ||
          current.surface?.type === 'my-schedule-month'
            ? current.surface
            : {
                type: 'my-schedule-week',
                originPrimary: 'planner',
                returnSurface: null,
              },
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  const handleOpenAboutFromSettings = useCallback(() => {
    setNav((current) =>
      openAboutMySchedule(current, {
        originPrimary: 'planner',
        returnSurface:
          current.surface?.type === 'schedule-settings'
            ? current.surface
            : null,
      }),
    );
    window.scrollTo(0, 0);
  }, []);

  if (!isAllowedV2Hostname(hostname)) {
    return (
      <main className="v2-blocked">
        <h1>v2 shell blocked</h1>
        <p>
          This host is not authorized to run the Reel Seattle v2 application.
        </p>
      </main>
    );
  }

  const isSearchResults =
    nav.surface?.type === 'collection' &&
    nav.surface.collectionId === COLLECTION_IDS.searchResults;
  const isOpeningThisWeek =
    nav.surface?.type === 'collection' &&
    nav.surface.collectionId === COLLECTION_IDS.openingThisWeek;
  const isTheatersList =
    nav.surface?.type === 'collection' &&
    nav.surface.collectionId === COLLECTION_IDS.theaters;
  const isFormatsExperiences =
    nav.surface?.type === 'collection' &&
    nav.surface.collectionId === COLLECTION_IDS.formats;
  const isFormatDetail = nav.surface?.type === 'format-detail';
  const isExperienceDetail = nav.surface?.type === 'experience-detail';
  const isCompareFormats = nav.surface?.type === 'compare-formats';
  const isFormatRecommendation = nav.surface?.type === 'format-recommendation';
  const isAdminTmdbReview = nav.surface?.type === 'admin-tmdb-review';
  const isPersonalCollection =
    nav.surface?.type === 'collection' &&
    isPersonalCollectionId(nav.surface.collectionId);
  const isTheaterDetail = nav.surface?.type === 'theater-detail';
  const isFilmDetail = nav.surface?.type === 'film-detail';
  const isOpportunityDetail = nav.surface?.type === 'opportunity-detail';
  const isShowtimes = nav.surface?.type === 'showtimes';
  const isShowtimesBrowse = nav.surface?.type === 'showtimes-browse';
  const isAboutMySchedule = nav.surface?.type === 'about-my-schedule';
  const isBuildPlan = nav.surface?.type === 'build-plan';
  const isBuildPlanResults = nav.surface?.type === 'build-plan-results';
  const isBuildPlanPlanDetails =
    nav.surface?.type === 'build-plan-plan-details';
  const isBuildPlanFilmManage =
    nav.surface?.type === 'build-plan-film-manage';
  const isBuildPlanTheaterManage =
    nav.surface?.type === 'build-plan-theater-manage';
  const isBuildPlanChrome =
    isBuildPlan ||
    isBuildPlanFilmManage ||
    isBuildPlanResults ||
    isBuildPlanPlanDetails;
  const isMyScheduleWeek = nav.surface?.type === 'my-schedule-week';
  const isMyScheduleMonth = nav.surface?.type === 'my-schedule-month';
  const isScheduleSettings = nav.surface?.type === 'schedule-settings';
  const scheduleUnderSurface = isScheduleSettings
    ? nav.surface.returnSurface
    : null;
  const isScheduleUnderWeek = scheduleUnderSurface?.type === 'my-schedule-week';
  const isScheduleUnderMonth =
    scheduleUnderSurface?.type === 'my-schedule-month';

  // Film Detail keeps Explore active in bottom nav (approved chrome).
  const activePrimaryId = isFilmDetail
    ? 'explore'
    : resolveActivePrimaryId(nav);

  const filmKey = isFilmDetail ? nav.surface.filmKey : null;
  const filmOpportunityKey = isFilmDetail
    ? nav.surface.opportunityKey ?? null
    : null;
  const filmFromHome =
    filmKey && Array.isArray(sharedHomeData.homeData?.films)
      ? sharedHomeData.homeData.films.find(
          (f) =>
            f.filmKey === filmKey ||
            (asTmdbFilmId(f.filmId) && asTmdbFilmId(f.filmId) === asTmdbFilmId(filmKey)),
        )
      : null;
  const tmdbOnlyFilm =
    !filmFromHome && asTmdbFilmId(filmKey)
      ? (() => {
          const snapshot = getCachedTmdbOnlyFilm(filmKey);
          return {
            filmKey,
            filmId: asTmdbFilmId(filmKey),
            title: snapshot?.title ?? null,
            posterUrl: snapshot?.posterUrl ?? null,
            parentFilmKey: null,
          };
        })()
      : null;
  const filmForActions = filmFromHome ?? tmdbOnlyFilm;
  const filmTitle = isFilmDetail
    ? isFilmDetailMockupFixtureMode()
      ? getFilmDetailMockupPresentation().film.title
      : filmForActions?.title ?? null
    : null;
  const filmBackLabel = isFilmDetail
    ? isFilmDetailMockupFixtureMode()
      ? getFilmDetailMockupPresentation().originLabel
      : resolveFilmDetailBackLabel(
          nav.surface.originPrimary,
          nav.surface.returnSurface ?? null,
        )
    : null;

  const filmDetailMode = isFilmDetail
    ? isFilmDetailMockupFixtureMode()
      ? 'mockup-fixture'
      : isFilmDetailVisualFixtureMode()
        ? 'visual-fixture'
        : 'production'
    : null;

  const saveAction = useMemo(() => {
    void saveRevision;
    if (!isFilmDetail) {
      return buildSaveActionState({ mode: 'production', film: null });
    }
    return buildSaveActionState({
      mode: filmDetailMode,
      film: filmForActions,
      storage: getBrowserStorage(),
      fixtureIsSaved: fixtureSaved,
      error: saveError,
    });
  }, [
    isFilmDetail,
    filmDetailMode,
    filmForActions,
    fixtureSaved,
    saveError,
    saveRevision,
  ]);

  const handleToggleSave = useCallback(() => {
    if (!isFilmDetail || !saveAction.available) return;
    const result = applySaveToggle({
      storage: getBrowserStorage(),
      filmRef: saveAction.filmRef,
      persist: saveAction.persist,
      currentIsSaved: saveAction.isSaved,
    });
    if (!saveAction.persist) {
      setFixtureSaved(result.isSaved);
      setSaveError(null);
      return;
    }
    if (!result.ok) {
      setSaveError(result.error ?? 'storage_set_failed');
      return;
    }
    setSaveError(null);
    setSaveRevision((value) => value + 1);
  }, [isFilmDetail, saveAction]);

  const seenAction = useMemo(() => {
    void seenRevision;
    if (!isFilmDetail) {
      return buildSeenActionState({ mode: 'production', film: null });
    }
    return buildSeenActionState({
      mode: filmDetailMode,
      film: filmForActions,
      storage: getBrowserStorage(),
      fixtureIsSeen: fixtureSeen,
      error: seenError,
    });
  }, [
    isFilmDetail,
    filmDetailMode,
    filmForActions,
    fixtureSeen,
    seenError,
    seenRevision,
  ]);

  const handleToggleSeen = useCallback(() => {
    if (!isFilmDetail || !seenAction.available) return;
    const result = applySeenToggle({
      storage: getBrowserStorage(),
      filmRef: seenAction.filmRef,
      persist: seenAction.persist,
      currentIsSeen: seenAction.isSeen,
    });
    if (!seenAction.persist) {
      setFixtureSeen(result.isSeen);
      setSeenError(null);
      return;
    }
    if (!result.ok) {
      setSeenError(result.error ?? 'storage_set_failed');
      return;
    }
    setSeenError(null);
    setSeenRevision((value) => value + 1);
  }, [isFilmDetail, seenAction]);

  const notInterestedAction = useMemo(() => {
    void notInterestedRevision;
    if (!isFilmDetail) {
      return buildNotInterestedActionState({ mode: 'production', film: null });
    }
    return buildNotInterestedActionState({
      mode: filmDetailMode,
      film: filmForActions,
      storage: getBrowserStorage(),
      fixtureIsNotInterested: fixtureNotInterested,
      error: notInterestedError,
    });
  }, [
    isFilmDetail,
    filmDetailMode,
    filmForActions,
    fixtureNotInterested,
    notInterestedError,
    notInterestedRevision,
  ]);

  const handleToggleNotInterested = useCallback(() => {
    if (!isFilmDetail || !notInterestedAction.available) return;
    const result = applyNotInterestedToggle({
      storage: getBrowserStorage(),
      filmRef: notInterestedAction.filmRef,
      persist: notInterestedAction.persist,
      currentIsNotInterested: notInterestedAction.isNotInterested,
    });
    if (!notInterestedAction.persist) {
      setFixtureNotInterested(result.isNotInterested);
      setNotInterestedError(null);
      return;
    }
    if (!result.ok) {
      setNotInterestedError(result.error ?? 'storage_set_failed');
      return;
    }
    setNotInterestedError(null);
    setNotInterestedRevision((value) => value + 1);
  }, [isFilmDetail, notInterestedAction]);

  let mainContent;
  if (isFilmDetail) {
    mainContent = (
      <FilmDetailSurface
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        filmKey={filmKey}
        opportunityKey={filmOpportunityKey}
        saveAvailable={saveAction.available}
        isSaved={saveAction.isSaved}
        saveLabel={saveAction.label}
        saveError={saveAction.error}
        onToggleSave={handleToggleSave}
        seenAvailable={seenAction.available}
        isSeen={seenAction.isSeen}
        seenError={seenAction.error}
        onToggleSeen={handleToggleSeen}
        notInterestedAvailable={notInterestedAction.available}
        isNotInterested={notInterestedAction.isNotInterested}
        notInterestedError={notInterestedAction.error}
        onToggleNotInterested={handleToggleNotInterested}
        shareTitle={filmTitle}
        shareStatus={shareStatus}
        onShare={
          filmTitle
            ? async () => {
                const status = await shareFilmDetail(filmTitle);
                if (status) {
                  setShareStatus(status);
                  window.setTimeout(() => setShareStatus(null), 2500);
                }
              }
            : null
        }
        onOpenOpportunity={({ filmKey: fk, opportunityKey: ok }) =>
          handleOpenOpportunity({
            filmKey: fk ?? filmKey,
            opportunityKey: ok ?? null,
          })
        }
        onOpenShowtimes={({ filmKey: fk, theaterId, opportunityKey: ok }) =>
          handleOpenShowtimes({
            filmKey: fk ?? filmKey,
            theaterId: theaterId ?? null,
            opportunityKey: ok ?? null,
          })
        }
        onStartPlanner={handleStartPlanner}
      />
    );
  } else if (isOpportunityDetail) {
    mainContent = (
      <OpportunityDetailSurface
        homeData={sharedHomeData.homeData}
        filmKey={nav.surface.filmKey}
        opportunityKey={nav.surface.opportunityKey}
        onBack={handleBack}
      />
    );
  } else if (isShowtimes) {
    mainContent = (
      <ShowtimesSurface
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        filmKey={nav.surface.filmKey}
        theaterId={nav.surface.theaterId}
        opportunityKey={nav.surface.opportunityKey}
        onOpenTheaterDetail={(params) =>
          handleOpenTheaterDetail({
            ...params,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
      />
    );
  } else if (isShowtimesBrowse) {
    const browseBackLabel =
      nav.surface.originPrimary === 'home' ? 'Home' : 'Explore';
    mainContent = (
      <ShowtimesBrowseSurface
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        loadStatus={sharedHomeData.status}
        errorMessage={sharedHomeData.errorMessage}
        browseUi={nav.surface.browseUi}
        backLabel={browseBackLabel}
        originPrimary={nav.surface.originPrimary ?? 'explore'}
        onBack={handleBack}
        onBrowseUiChange={handleShowtimesBrowseUiChange}
        onOpenFilmDetail={({ filmKey, opportunityKey, returnSurface }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            homeRestore: nav.surface.homeRestore ?? null,
            exploreRestore: nav.surface.exploreRestore ?? null,
            returnSurface: returnSurface ?? nav.surface,
          })
        }
        onOpenTheaterDetail={({ theaterId, returnSurface }) =>
          handleOpenTheaterDetail({
            theaterId,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: returnSurface ?? nav.surface,
          })
        }
      />
    );
  } else if (isSearchResults) {
    mainContent = (
      <SearchResultsSurface
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        query={nav.surface.query}
        searchUi={nav.surface.searchUi}
        onBack={handleBack}
        onSearchStateChange={handleSearchStateChange}
        onOpenCollection={handleOpenCollection}
        onOpenFilmDetail={({ filmKey, opportunityKey }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: 'explore',
            exploreRestore: nav.surface.exploreRestore ?? null,
            homeRestore: null,
            returnSurface: {
              ...nav.surface,
              searchUi: nav.surface.searchUi ?? null,
            },
          })
        }
      />
    );
  } else if (isOpeningThisWeek) {
    const openingBackLabel =
      nav.surface.originPrimary === 'home' ? 'Home' : 'Explore';
    mainContent = (
      <OpeningThisWeekSurface
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        onBack={handleBack}
        backLabel={openingBackLabel}
        onOpenFilmDetail={({ filmKey, opportunityKey }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            exploreRestore: nav.surface.exploreRestore ?? null,
            homeRestore: null,
            returnSurface: nav.surface,
          })
        }
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Opening shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isTheaterDetail) {
    mainContent = (
      <TheaterDetailSurface
        theaterId={nav.surface.theaterId}
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        backLabel={
          nav.surface.returnSurface?.type === 'collection'
            ? 'Theaters'
            : 'Explore'
        }
        onBack={handleBack}
        onOpenFilmDetail={({ filmKey, opportunityKey }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            exploreRestore: nav.surface.returnSurface?.exploreRestore ?? null,
            homeRestore: null,
            returnSurface: nav.surface,
          })
        }
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Theater Detail shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isTheatersList) {
    mainContent = (
      <TheatersSurface
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        backLabel={
          nav.surface.originPrimary === 'home' ? 'Home' : 'Explore'
        }
        onOpenTheaterDetail={({ theaterId }) =>
          handleOpenTheaterDetail({
            theaterId,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onOpenFilmDetail={({ filmKey, opportunityKey }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            exploreRestore: nav.surface.exploreRestore ?? null,
            homeRestore: null,
            returnSurface: nav.surface,
          })
        }
        onOpenShowtimesBrowse={({ theaterId }) =>
          handleBrowseTheaterShowtimes({
            theaterId,
            returnSurface: nav.surface,
          })
        }
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Theaters shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isFormatsExperiences) {
    mainContent = (
      <FormatsExperiencesSurface
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onOpenFormatDetail={({ formatId }) =>
          handleOpenFormatDetail({
            formatId,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onOpenExperienceDetail={({ experienceId }) =>
          handleOpenExperienceDetail({
            experienceId,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
      />
    );
  } else if (isFormatDetail) {
    mainContent = (
      <FormatDetailSurface
        formatId={nav.surface.formatId}
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onCompareFormats={() =>
          handleOpenCompareFormats({
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onBrowseShowtimes={({ formatKeys }) =>
          handleBrowseFormatShowtimes({
            formatKeys,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
      />
    );
  } else if (isExperienceDetail) {
    mainContent = (
      <ExperienceDetailSurface
        experienceId={nav.surface.experienceId}
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onBrowseShowtimes={({ formatKeys }) =>
          handleBrowseFormatShowtimes({
            formatKeys,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onFeedback={() => {
          setProfileStubStatus(
            'Feedback isn’t wired in this Formats & Experiences shell yet.',
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isCompareFormats) {
    mainContent = (
      <CompareFormatsSurface
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onHelpMeChoose={() =>
          handleOpenFormatRecommendation({
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onOpenFormatDetail={({ formatId }) =>
          handleOpenFormatDetail({
            formatId,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
      />
    );
  } else if (isFormatRecommendation) {
    mainContent = (
      <FormatRecommendationSurface
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onCompareFormats={() =>
          handleOpenCompareFormats({
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onBrowseShowtimes={({ formatKeys } = {}) =>
          handleBrowseFormatShowtimes({
            formatKeys,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
        onOpenFormatDetail={({ formatId }) =>
          handleOpenFormatDetail({
            formatId,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            returnSurface: nav.surface,
          })
        }
      />
    );
  } else if (nav.surface?.type === 'collection') {
    mainContent = isPersonalCollectionId(nav.surface.collectionId) ? (
      <PersonalFilmCollectionSurface
        collectionId={nav.surface.collectionId}
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        onOpenCollection={(params) =>
          handleOpenCollection({
            ...params,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            exploreRestore: nav.surface.exploreRestore ?? null,
          })
        }
        onOpenFilmDetail={({ filmKey, opportunityKey }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: nav.surface.originPrimary ?? 'explore',
            exploreRestore: nav.surface.exploreRestore ?? null,
            homeRestore: null,
            returnSurface: nav.surface,
          })
        }
      />
    ) : (
      <CollectionSurface
        collectionId={nav.surface.collectionId}
        query={nav.surface.query}
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        onBack={handleBack}
        onOpenCollection={handleOpenCollection}
        onOpenFilmDetail={({ filmKey, opportunityKey }) =>
          handleOpenFilmDetail({
            filmKey,
            opportunityKey,
            originPrimary: 'explore',
            exploreRestore: nav.surface.exploreRestore ?? null,
            homeRestore: null,
            returnSurface: nav.surface,
          })
        }
      />
    );
  } else if (isAboutMySchedule) {
    mainContent = (
      <AboutMyScheduleSurface
        onBack={handleBack}
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 About shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isBuildPlan) {
    mainContent = (
      <BuildPlanSurface
        onBack={handleBack}
        backLabel="Planner"
        resumeOpenSection={nav.surface?.resumeOpenSection ?? null}
        onOpenFilmManage={handleOpenBuildPlanFilmManage}
        onOpenTheaterManage={handleOpenBuildPlanTheaterManage}
        onRequestResults={handleOpenBuildPlanResults}
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Build a Plan shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isBuildPlanFilmManage) {
    mainContent = (
      <BuildPlanFilmManageSurface
        mode={nav.surface?.mode ?? 'wouldLove'}
        onDone={handleBack}
        onBack={handleBack}
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
      />
    );
  } else if (isBuildPlanTheaterManage) {
    mainContent = (
      <BuildPlanTheaterManageSurface
        onDone={handleBack}
        onBack={handleBack}
      />
    );
  } else if (isBuildPlanResults) {
    mainContent = (
      <BuildPlanResultsSurface
        onBack={handleBack}
        backLabel="Build a Plan"
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        formConfig={nav.surface?.formConfig ?? null}
        onAcceptedPlanChange={() =>
          setAcceptedPlansRevision((value) => value + 1)
        }
        onViewPlanDetails={(plan, origin) =>
          handleOpenBuildPlanPlanDetails(plan, origin)
        }
        onShareReady={(handler) => setResultsShareHandler(() => handler)}
        initialSortId={nav.surface?.sortId ?? null}
        restoreScrollY={nav.surface?.scrollY ?? null}
        restoreActivePlanId={nav.surface?.activePlanId ?? null}
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Results shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isBuildPlanPlanDetails) {
    const detailsPlanId = nav.surface?.planId ?? null;
    const detailsPlan =
      nav.surface?.plan ??
      (detailsPlanId
        ? resolveSavedPlanDetailsPlan(detailsPlanId, {
            storage: getBrowserStorage(),
            enrichmentIndex: enrichmentState.index,
            homeData: sharedHomeData.homeData,
          })
        : null);
    mainContent = (
      <BuildPlanPlanDetailsSurface
        plan={detailsPlan}
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onShareReady={(handler) => setPlanDetailsShareHandler(() => handler)}
        onOpenFilmDetail={(params) =>
          handleOpenFilmDetail({
            ...params,
            originPrimary: 'planner',
          })
        }
        onViewInSchedule={({ planId, focusDate }) =>
          handleOpenMyScheduleWeek({
            focusDate,
            focusPlanId: planId,
            returnSurface: {
              type: 'build-plan-plan-details',
              originPrimary: 'planner',
              returnSurface: null,
              plan: detailsPlan,
              planId: planId ?? detailsPlanId,
            },
          })
        }
        onAcceptedPlanChange={() =>
          setAcceptedPlansRevision((value) => value + 1)
        }
      />
    );
  } else if (isMyScheduleWeek || isScheduleUnderWeek) {
    mainContent = (
      <div
        className={isScheduleSettings ? 'v2-schedule-with-sheet' : undefined}
      >
        <div inert={isScheduleSettings || undefined}>
          <MyScheduleWeekSurface
            homeData={sharedHomeData.homeData}
            enrichmentIndex={enrichmentState.index}
            acceptedPlansRevision={acceptedPlansRevision}
            scheduleSettingsRevision={scheduleSettingsRevision}
            focusDate={nav.surface?.focusDate ?? null}
            focusPlanId={nav.surface?.focusPlanId ?? null}
            onAcceptedPlanChange={() =>
              setAcceptedPlansRevision((value) => value + 1)
            }
            onOpenSearch={handleOpenScheduleSearch}
            onOpenSettings={handleOpenScheduleSettings}
            onOpenMonth={handleOpenMyScheduleMonth}
            onOpenFilmDetail={(params) =>
              handleOpenFilmDetail({
                ...params,
                originPrimary: 'planner',
              })
            }
            onOpenPlanDetails={(plan) =>
              handleOpenBuildPlanPlanDetails(plan, {
                returnSurface: {
                  type: 'my-schedule-week',
                  originPrimary: 'planner',
                  returnSurface: null,
                  focusDate: nav.surface?.focusDate ?? null,
                  focusPlanId: nav.surface?.focusPlanId ?? null,
                },
              })
            }
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Schedule shell yet.`,
              );
              window.setTimeout(() => setProfileStubStatus(null), 2500);
            }}
          />
        </div>
        {isScheduleSettings ? (
          <ScheduleSettingsSurface
            onClose={handleBack}
            onOpenAbout={handleOpenAboutFromSettings}
            onSettingsChange={() =>
              setScheduleSettingsRevision((value) => value + 1)
            }
            onAcceptedPlanChange={() =>
              setAcceptedPlansRevision((value) => value + 1)
            }
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Schedule Settings shell yet.`,
              );
              window.setTimeout(() => setProfileStubStatus(null), 2500);
            }}
          />
        ) : null}
      </div>
    );
  } else if (isMyScheduleMonth || isScheduleUnderMonth) {
    mainContent = (
      <div
        className={isScheduleSettings ? 'v2-schedule-with-sheet' : undefined}
      >
        <div inert={isScheduleSettings || undefined}>
          <MyScheduleMonthSurface
            homeData={sharedHomeData.homeData}
            enrichmentIndex={enrichmentState.index}
            acceptedPlansRevision={acceptedPlansRevision}
            scheduleSettingsRevision={scheduleSettingsRevision}
            onOpenWeek={handleOpenMyScheduleWeek}
            onOpenSearch={handleOpenScheduleSearch}
            onOpenSettings={handleOpenScheduleSettings}
            onOpenFilmDetail={(params) =>
              handleOpenFilmDetail({
                ...params,
                originPrimary: 'planner',
              })
            }
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Schedule shell yet.`,
              );
              window.setTimeout(() => setProfileStubStatus(null), 2500);
            }}
          />
        </div>
        {isScheduleSettings ? (
          <ScheduleSettingsSurface
            onClose={handleBack}
            onOpenAbout={handleOpenAboutFromSettings}
            onSettingsChange={() =>
              setScheduleSettingsRevision((value) => value + 1)
            }
            onAcceptedPlanChange={() =>
              setAcceptedPlansRevision((value) => value + 1)
            }
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Schedule Settings shell yet.`,
              );
              window.setTimeout(() => setProfileStubStatus(null), 2500);
            }}
          />
        ) : null}
      </div>
    );
  } else if (isScheduleSettings) {
    mainContent = (
      <div className="v2-schedule-with-sheet">
        <div inert>
          <MyScheduleWeekSurface
            homeData={sharedHomeData.homeData}
            enrichmentIndex={enrichmentState.index}
            acceptedPlansRevision={acceptedPlansRevision}
            scheduleSettingsRevision={scheduleSettingsRevision}
            focusDate={nav.surface?.focusDate ?? null}
            focusPlanId={nav.surface?.focusPlanId ?? null}
            onAcceptedPlanChange={() =>
              setAcceptedPlansRevision((value) => value + 1)
            }
            onOpenSearch={handleOpenScheduleSearch}
            onOpenSettings={handleOpenScheduleSettings}
            onOpenMonth={handleOpenMyScheduleMonth}
            onOpenFilmDetail={(params) =>
              handleOpenFilmDetail({
                ...params,
                originPrimary: 'planner',
              })
            }
            onOpenPlanDetails={(plan) =>
              handleOpenBuildPlanPlanDetails(plan, {
                returnSurface: {
                  type: 'my-schedule-week',
                  originPrimary: 'planner',
                  returnSurface: null,
                  focusDate: nav.surface?.focusDate ?? null,
                  focusPlanId: nav.surface?.focusPlanId ?? null,
                },
              })
            }
          />
        </div>
        <ScheduleSettingsSurface
          onClose={handleBack}
          onOpenAbout={handleOpenAboutFromSettings}
          onSettingsChange={() =>
            setScheduleSettingsRevision((value) => value + 1)
          }
          onAcceptedPlanChange={() =>
            setAcceptedPlansRevision((value) => value + 1)
          }
          onStubAction={(_actionId, label) => {
            setProfileStubStatus(
              `${label} isn’t available in this Schedule Settings shell yet.`,
            );
            window.setTimeout(() => setProfileStubStatus(null), 2500);
          }}
        />
      </div>
    );
  } else if (isAdminTmdbReview) {
    mainContent = (
      <TmdbMatchReviewSurface
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        onBack={handleBack}
      />
    );
  } else {
    mainContent = (
      <DestinationPlaceholder
        destinationId={nav.primaryDestinationId}
        loadStatus={sharedHomeData.status}
        homeData={sharedHomeData.homeData}
        enrichmentIndex={enrichmentState.index}
        errorMessage={sharedHomeData.errorMessage}
        onSelectDestination={handleSelectDestination}
        onOpenFilmDetail={handleOpenFilmDetail}
        onOpenCollection={handleOpenCollection}
        onOpenShowtimesBrowse={handleOpenShowtimesBrowse}
        homeRestore={homeRestorePending}
        exploreRestore={exploreRestorePending}
        onHomeRestoreConsumed={() => setHomeRestorePending(null)}
        onExploreRestoreConsumed={() => setExploreRestorePending(null)}
        plannerSeed={nav.plannerSeed}
        onOpenBuildPlan={handleOpenBuildPlan}
        onOpenMyScheduleWeek={() => handleOpenMyScheduleWeek()}
        onOpenSavedPlan={handleOpenSavedPlan}
        acceptedPlansRevision={acceptedPlansRevision}
        onProfileStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Profile shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
        onOpenAdminTmdbReview={handleOpenAdminTmdbReview}
        onPlannerStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Planner shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  }

  const isProfilePrimary =
    !nav.surface && nav.primaryDestinationId === 'profile';

  const notificationsData = resolveNotificationsDataSource({
    qcNotifications,
    qcHeaderNotifications,
    productionItems: auth?.signedIn ? cloudNotifications : [],
  });
  const notificationItems = applyNotificationReadOverrides(
    notificationsData.items,
    notificationReadOverrides,
  );
  const hasUnreadNotifications =
    countUnreadNotifications(notificationItems) > 0;

  const notificationBell = resolveNotificationBellPresentation({
    signedIn: Boolean(auth?.signedIn),
    hasUnreadNotifications,
    qcMode:
      qcHeaderNotifications ??
      (qcNotifications === 'unread'
        ? 'unread'
        : qcNotifications === 'all-read' || qcNotifications === 'empty'
          ? 'read'
          : null),
  });

  useEffect(() => {
    if (!notificationBell.visible && notificationsOpen) {
      setNotificationsOpen(false);
    }
  }, [notificationBell.visible, notificationsOpen]);

  const handleOpenNotifications = useCallback(() => {
    if (!notificationBell.visible) return;
    setNotificationsOpen(true);
  }, [notificationBell.visible]);

  const handleCloseNotifications = useCallback(() => {
    setNotificationsOpen(false);
    window.setTimeout(() => {
      document.querySelector('.v2-header-notifications')?.focus?.();
    }, 0);
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    const stamp = new Date().toISOString();
    setNotificationReadOverrides((current) =>
      markAllNotificationsReadInOverrides(notificationItems, current, stamp),
    );
    if (notificationsData.source === 'production' && auth?.signedIn) {
      void markAllUserNotificationsRead({ readAtIso: stamp }).then((result) => {
        if (!result.ok) return;
        setCloudNotifications((items) =>
          items.map((item) =>
            item.readAt ? item : { ...item, readAt: stamp, actionLabel: null },
          ),
        );
      });
    }
  }, [auth?.signedIn, notificationItems, notificationsData.source]);

  const handleOpenNotification = useCallback(
    (item) => {
      const stamp = new Date().toISOString();
      setNotificationReadOverrides((current) =>
        markNotificationReadInOverrides(
          notificationItems,
          item?.id,
          current,
          stamp,
        ),
      );
      if (
        notificationsData.source === 'production' &&
        auth?.signedIn &&
        item?.id
      ) {
        void markUserNotificationRead(item.id, { readAtIso: stamp }).then(
          (result) => {
            if (!result.ok) return;
            setCloudNotifications((items) =>
              items.map((row) =>
                row.id === item.id
                  ? { ...row, readAt: stamp, actionLabel: null }
                  : row,
              ),
            );
          },
        );
      }
      const target = notificationNavigationTarget(item);
      setNotificationsOpen(false);
      if (!target) return;
      handleOpenFilmDetail({
        filmKey: target.filmKey,
        opportunityKey: target.opportunityKey,
        originPrimary: nav.primaryDestinationId || 'home',
      });
    },
    [
      auth?.signedIn,
      handleOpenFilmDetail,
      nav.primaryDestinationId,
      notificationItems,
      notificationsData.source,
    ],
  );

  return (
    <div
      className={
        [
          isFilmDetail ? 'v2-shell v2-shell-fd' : 'v2-shell',
          notificationsOpen ? 'v2-shell-with-notifications' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
    >
      <span className="v2-visually-hidden">Local only</span>

      <div inert={notificationsOpen || undefined}>
      <AppHeader
        onProfileClick={() => handleSelectDestination('profile')}
        showNotificationsBell={notificationBell.visible}
        hasUnreadNotifications={notificationBell.hasUnread}
        onNotificationsOpen={handleOpenNotifications}
        headerMode={
          isBuildPlanPlanDetails
            ? 'plan-details'
            : isBuildPlanChrome
              ? 'build-plan'
              : isProfilePrimary
                ? 'profile'
                : 'default'
        }
        centerTitle={isBuildPlanPlanDetails ? 'Plan Details' : null}
        variant={isFilmDetail ? 'film-detail' : 'default'}
        backLabel={
          isFilmDetail
            ? filmBackLabel
            : isShowtimes
              ? 'Film'
              : isShowtimesBrowse
              ? nav.surface.originPrimary === 'home'
                ? 'Home'
                : 'Explore'
              : isSearchResults
                ? 'Explore'
                : isPersonalCollection
                  ? nav.surface.originPrimary === 'home'
                    ? 'Home'
                    : 'Explore'
                : isBuildPlanPlanDetails
                  ? nav.surface?.returnSurface?.type === 'build-plan-results'
                    ? 'results'
                    : nav.surface?.returnSurface?.type === 'my-schedule-week' ||
                        nav.surface?.returnSurface?.type === 'my-schedule-month'
                      ? 'schedule'
                      : 'Planner'
                  : isBuildPlanChrome
                    ? 'Planner'
                    : null
        }
        backStyle={
          isPersonalCollection || isBuildPlanChrome ? 'chevron' : 'label'
        }
        onBack={
          isFilmDetail ||
          isShowtimes ||
          isSearchResults ||
          isPersonalCollection ||
          isBuildPlanChrome ||
          isShowtimesBrowse
            ? handleBack
            : null
        }
        shareTitle={isFilmDetail ? null : filmTitle}
        shareStatus={isFilmDetail ? null : shareStatus}
        savePressed={false}
        saveAvailable={false}
        saveLabel="Save"
        onSave={null}
        onShare={
          isFilmDetail
            ? null
            : isBuildPlanPlanDetails && planDetailsShareHandler
              ? () => planDetailsShareHandler()
            : isBuildPlanResults && resultsShareHandler
              ? () => resultsShareHandler()
              : null
        }
      />

      <main className="v2-main" id="v2-main">
        {mainContent}
      </main>

      {profileStubStatus ? (
        <p className="v2-visually-hidden" role="status" aria-live="polite">
          {profileStubStatus}
        </p>
      ) : null}

      {isAdminTmdbReview ? null : (
        <PrimaryNav
          activeDestinationId={activePrimaryId}
          onSelectDestination={handleSelectDestination}
        />
      )}
      </div>

      {notificationsOpen && notificationBell.visible ? (
        <NotificationsSheet
          items={notificationItems}
          source={notificationsData.source}
          onClose={handleCloseNotifications}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onOpenNotification={handleOpenNotification}
        />
      ) : null}
    </div>
  );
}
