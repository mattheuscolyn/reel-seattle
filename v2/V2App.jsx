import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { consumeAuthReturnToProfile } from './auth/oauthRedirect.js';
import { COLLECTION_IDS } from './explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openAboutMySchedule,
  openBuildPlan,
  openBuildPlanResults,
  openBuildPlanFilmManage,
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
  selectPrimaryDestination,
  startPlannerFromFilm,
  updateSearchUi,
  updateShowtimesBrowseUi,
} from './navigation/navState.js';
import AboutMyScheduleSurface from './surfaces/AboutMyScheduleSurface.jsx';
import CollectionSurface from './surfaces/CollectionSurface.jsx';
import FilmDetailSurface from './surfaces/FilmDetailSurface.jsx';
import OpportunityDetailSurface from './surfaces/OpportunityDetailSurface.jsx';
import SearchResultsSurface from './surfaces/SearchResultsSurface.jsx';
import ShowtimesSurface from './surfaces/ShowtimesSurface.jsx';
import ShowtimesBrowseSurface from './surfaces/ShowtimesBrowseSurface.jsx';
import OpeningThisWeekSurface from './opening/OpeningThisWeekSurface.jsx';
import BuildPlanSurface from './planner/BuildPlanSurface.jsx';
import BuildPlanResultsSurface from './planner/BuildPlanResultsSurface.jsx';
import BuildPlanFilmManageSurface from './planner/BuildPlanFilmManageSurface.jsx';
import BuildPlanPlanDetailsSurface from './planner/BuildPlanPlanDetailsSurface.jsx';
import MyScheduleWeekSurface from './planner/MyScheduleWeekSurface.jsx';
import MyScheduleMonthSurface from './planner/MyScheduleMonthSurface.jsx';
import ScheduleSettingsSurface from './planner/ScheduleSettingsSurface.jsx';
import TheatersSurface from './theaters/TheatersSurface.jsx';
import TheaterDetailSurface from './theaters/TheaterDetailSurface.jsx';
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

export default function V2App() {
  const hostname = resolveHostname();
  const [nav, setNav] = useState(createInitialNavState);
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

  const handleSelectDestination = useCallback((destinationId) => {
    setHomeRestorePending(null);
    setExploreRestorePending(null);
    setShareStatus(null);
    setProfileStubStatus(null);
    clearBuildPlanFormSession();
    setNav((current) => selectPrimaryDestination(current, destinationId));
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
      const explicitReturn = origin.returnSurface ?? null;
      const fromResults = current.surface?.type === 'build-plan-results';
      const fromSchedule =
        current.surface?.type === 'my-schedule-week' ||
        current.surface?.type === 'my-schedule-month';
      const returnSurface =
        explicitReturn ??
        (fromResults
          ? {
              ...current.surface,
              sortId: origin.sortId ?? current.surface.sortId ?? null,
              scrollY:
                typeof origin.scrollY === 'number'
                  ? origin.scrollY
                  : typeof window !== 'undefined'
                    ? window.scrollY
                    : 0,
              activePlanId: plan?.id ?? null,
            }
          : fromSchedule
            ? current.surface
            : {
                type: 'build-plan-results',
                originPrimary: 'planner',
                returnSurface: null,
                formConfig: current.surface?.formConfig ?? null,
                sortId: origin.sortId ?? null,
                scrollY:
                  typeof origin.scrollY === 'number' ? origin.scrollY : 0,
                activePlanId: plan?.id ?? null,
              });
      return openBuildPlanPlanDetails(current, {
        originPrimary: 'planner',
        plan,
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

  const handleOpenMyScheduleWeek = useCallback(() => {
    setNav((current) =>
      openMyScheduleWeek(current, { originPrimary: 'planner' }),
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
      ? sharedHomeData.homeData.films.find((f) => f.filmKey === filmKey)
      : null;
  const filmTitle = isFilmDetail
    ? isFilmDetailMockupFixtureMode()
      ? getFilmDetailMockupPresentation().film.title
      : filmFromHome?.title ?? null
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
      film: filmFromHome,
      storage: getBrowserStorage(),
      fixtureIsSaved: fixtureSaved,
      error: saveError,
    });
  }, [
    isFilmDetail,
    filmDetailMode,
    filmFromHome,
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
      film: filmFromHome,
      storage: getBrowserStorage(),
      fixtureIsSeen: fixtureSeen,
      error: seenError,
    });
  }, [
    isFilmDetail,
    filmDetailMode,
    filmFromHome,
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
      film: filmFromHome,
      storage: getBrowserStorage(),
      fixtureIsNotInterested: fixtureNotInterested,
      error: notInterestedError,
    });
  }, [
    isFilmDetail,
    filmDetailMode,
    filmFromHome,
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
        filmKey={nav.surface.filmKey}
        theaterId={nav.surface.theaterId}
        opportunityKey={nav.surface.opportunityKey}
        onBack={handleBack}
        onOpenOpportunity={handleOpenOpportunity}
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
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Theaters shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (nav.surface?.type === 'collection') {
    mainContent = (
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
    mainContent = (
      <BuildPlanPlanDetailsSurface
        plan={nav.surface?.plan ?? null}
        homeData={sharedHomeData.homeData}
        onBack={handleBack}
        onShareReady={(handler) => setPlanDetailsShareHandler(() => handler)}
        onOpenFilmDetail={(params) =>
          handleOpenFilmDetail({
            ...params,
            originPrimary: 'planner',
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
        onOpenMyScheduleWeek={handleOpenMyScheduleWeek}
        onProfileStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Profile shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
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

  return (
    <div className={isFilmDetail ? 'v2-shell v2-shell-fd' : 'v2-shell'}>
      <span className="v2-visually-hidden">Local only</span>

      <AppHeader
        onProfileClick={() => handleSelectDestination('profile')}
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
        onSettingsClick={
          isProfilePrimary
            ? () => {
                setProfileStubStatus(
                  'Settings isn’t available in this Stage 1 Profile shell yet.',
                );
                window.setTimeout(() => setProfileStubStatus(null), 2500);
              }
            : null
        }
        variant={isFilmDetail ? 'film-detail' : 'default'}
        backLabel={
          isFilmDetail
            ? filmBackLabel
            : isShowtimesBrowse
              ? nav.surface.originPrimary === 'home'
                ? 'Home'
                : 'Explore'
              : isSearchResults
                ? 'Explore'
                : isBuildPlanPlanDetails
                  ? 'results'
                  : isBuildPlanChrome
                    ? 'Planner'
                    : null
        }
        backStyle={isBuildPlanChrome ? 'chevron' : 'label'}
        onBack={
          isFilmDetail ||
          isSearchResults ||
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

      <PrimaryNav
        activeDestinationId={activePrimaryId}
        onSelectDestination={handleSelectDestination}
      />
    </div>
  );
}
