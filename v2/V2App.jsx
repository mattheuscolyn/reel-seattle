import { useCallback, useEffect, useMemo, useState } from 'react';
import DestinationPlaceholder from './DestinationPlaceholder.jsx';
import AppHeader from './home/AppHeader.jsx';
import PrimaryNav from './PrimaryNav.jsx';
import { resolveActivePrimaryId } from './destinations.js';
import { loadHomeData } from './data/loadHomeData.js';
import { isAllowedV2Hostname } from './isAllowedV2Hostname.js';
import { COLLECTION_IDS } from './explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openAboutMySchedule,
  openBuildPlan,
  openBuildPlanResults,
  openCollection,
  openFilmDetail,
  openMyScheduleWeek,
  openMyScheduleMonth,
  openScheduleSettings,
  openTheaterDetail,
  openOpportunityDetail,
  openShowtimes,
  selectPrimaryDestination,
  startPlannerFromFilm,
  updateSearchUi,
} from './navigation/navState.js';
import AboutMyScheduleSurface from './surfaces/AboutMyScheduleSurface.jsx';
import CollectionSurface from './surfaces/CollectionSurface.jsx';
import FilmDetailSurface from './surfaces/FilmDetailSurface.jsx';
import OpportunityDetailSurface from './surfaces/OpportunityDetailSurface.jsx';
import SearchResultsSurface from './surfaces/SearchResultsSurface.jsx';
import ShowtimesSurface from './surfaces/ShowtimesSurface.jsx';
import OpeningThisWeekSurface from './opening/OpeningThisWeekSurface.jsx';
import BuildPlanSurface from './planner/BuildPlanSurface.jsx';
import BuildPlanResultsSurface from './planner/BuildPlanResultsSurface.jsx';
import MyScheduleWeekSurface from './planner/MyScheduleWeekSurface.jsx';
import MyScheduleMonthSurface from './planner/MyScheduleMonthSurface.jsx';
import ScheduleSettingsSurface from './planner/ScheduleSettingsSurface.jsx';
import TheatersSurface from './theaters/TheatersSurface.jsx';
import TheaterDetailSurface from './theaters/TheaterDetailSurface.jsx';
import { resolveFilmDetailBackLabel } from './filmDetail/filmDetailModel.js';
import { isAboutMyScheduleQueryOpen } from './fixtures/aboutMyScheduleMockupFixture.js';
import { isMyScheduleWeekQueryOpen } from './fixtures/myScheduleWeekMockupFixture.js';
import { isMyScheduleMonthQueryOpen } from './fixtures/myScheduleMonthMockupFixture.js';
import { isScheduleSettingsQueryOpen } from './fixtures/scheduleSettingsMockupFixture.js';
import { isTheaterDetailQueryOpen } from './fixtures/theaterDetailMockupFixture.js';
import { isFilmDetailMockupFixtureMode } from './fixtures/filmDetailMockupFixture.js';
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
  const [sharedHomeData, setSharedHomeData] = useState({
    status: 'loading',
    homeData: null,
    errorMessage: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadHomeData()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setSharedHomeData({
            status: 'error',
            homeData: null,
            errorMessage: result.error,
          });
          return;
        }
        setSharedHomeData({
          status: 'ready',
          homeData: result.homeData,
          errorMessage: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setSharedHomeData({
          status: 'error',
          homeData: null,
          errorMessage: error instanceof Error ? error.message : String(error),
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
      return openTheaterDetail(current, { originPrimary: 'explore' });
    });
    window.scrollTo(0, 0);
  }, []);

  const handleSelectDestination = useCallback((destinationId) => {
    setHomeRestorePending(null);
    setExploreRestorePending(null);
    setShareStatus(null);
    setProfileStubStatus(null);
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
          current.surface?.type === 'theater-detail'
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
      const next = navigateBack(current);
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

  const handleOpenBuildPlanResults = useCallback(() => {
    setNav((current) =>
      openBuildPlanResults(current, {
        originPrimary: 'planner',
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
          Reel Seattle v2 is a local development prototype and only runs on
          localhost.
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
  const isAboutMySchedule = nav.surface?.type === 'about-my-schedule';
  const isBuildPlan = nav.surface?.type === 'build-plan';
  const isBuildPlanResults = nav.surface?.type === 'build-plan-results';
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
  const filmTitle = isFilmDetail ? filmFromHome?.title ?? null : null;
  const filmBackLabel = isFilmDetail
    ? resolveFilmDetailBackLabel(
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
  } else if (isSearchResults) {
    mainContent = (
      <SearchResultsSurface
        homeData={sharedHomeData.homeData}
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
        onRequestResults={handleOpenBuildPlanResults}
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Build a Plan shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isBuildPlanResults) {
    mainContent = (
      <BuildPlanResultsSurface
        onBack={handleBack}
        backLabel="Build a Plan"
        onStubAction={(_actionId, label) => {
          setProfileStubStatus(
            `${label} isn’t available in this Stage 1 Results shell yet.`,
          );
          window.setTimeout(() => setProfileStubStatus(null), 2500);
        }}
      />
    );
  } else if (isMyScheduleWeek || isScheduleUnderWeek) {
    mainContent = (
      <div
        className={isScheduleSettings ? 'v2-schedule-with-sheet' : undefined}
      >
        <div inert={isScheduleSettings || undefined}>
          <MyScheduleWeekSurface
            onOpenSearch={handleOpenScheduleSearch}
            onOpenSettings={handleOpenScheduleSettings}
            onOpenMonth={handleOpenMyScheduleMonth}
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Stage 1 Schedule shell yet.`,
              );
              window.setTimeout(() => setProfileStubStatus(null), 2500);
            }}
          />
        </div>
        {isScheduleSettings ? (
          <ScheduleSettingsSurface
            onClose={handleBack}
            onOpenAbout={handleOpenAboutFromSettings}
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Stage 1 Schedule Settings shell yet.`,
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
            onOpenWeek={handleOpenMyScheduleWeek}
            onOpenSearch={handleOpenScheduleSearch}
            onOpenSettings={handleOpenScheduleSettings}
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Stage 1 Schedule shell yet.`,
              );
              window.setTimeout(() => setProfileStubStatus(null), 2500);
            }}
          />
        </div>
        {isScheduleSettings ? (
          <ScheduleSettingsSurface
            onClose={handleBack}
            onOpenAbout={handleOpenAboutFromSettings}
            onStubAction={(_actionId, label) => {
              setProfileStubStatus(
                `${label} isn’t available in this Stage 1 Schedule Settings shell yet.`,
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
            onOpenSearch={handleOpenScheduleSearch}
            onOpenSettings={handleOpenScheduleSettings}
            onOpenMonth={handleOpenMyScheduleMonth}
          />
        </div>
        <ScheduleSettingsSurface
          onClose={handleBack}
          onOpenAbout={handleOpenAboutFromSettings}
          onStubAction={(_actionId, label) => {
            setProfileStubStatus(
              `${label} isn’t available in this Stage 1 Schedule Settings shell yet.`,
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
        errorMessage={sharedHomeData.errorMessage}
        onSelectDestination={handleSelectDestination}
        onOpenFilmDetail={handleOpenFilmDetail}
        onOpenCollection={handleOpenCollection}
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
        headerMode={isProfilePrimary ? 'profile' : 'default'}
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
            : isSearchResults
              ? 'Explore'
              : null
        }
        onBack={
          isFilmDetail || isSearchResults ? handleBack : null
        }
        shareTitle={filmTitle}
        shareStatus={shareStatus}
        savePressed={isFilmDetail ? saveAction.isSaved : false}
        saveAvailable={isFilmDetail ? saveAction.available : false}
        saveLabel={isFilmDetail ? saveAction.label : 'Save'}
        onSave={
          isFilmDetail && saveAction.available ? handleToggleSave : null
        }
        onShare={
          isFilmDetail && filmTitle
            ? async () => {
                const status = await shareFilmDetail(filmTitle);
                if (status) {
                  setShareStatus(status);
                  window.setTimeout(() => setShareStatus(null), 2500);
                }
              }
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
