import { useEffect, useMemo, useState } from 'react';
import { COLLECTION_IDS } from './destinations.js';
import FilmShelf from './home/FilmShelf.jsx';
import TopOpportunityFeature from './home/TopOpportunityFeature.jsx';
import {
  HOME_JUST_ANNOUNCED_MAX_CARDS,
  HOME_LEAVING_SOON_MAX_CARDS,
  HOME_SPECIAL_PRESENTATIONS_MAX_CARDS,
  buildJustAnnouncedShelf,
  buildLeavingSoonShelf,
  buildOpeningThisWeekShelf,
  buildSpecialPresentationsShelf,
} from './home/shelfData.js';
import { HOME_OPENING_SHELF_MAX_CARDS } from './home/openingShelfRanking.js';
import {
  HOME_SHORT_FILMS_MAX_CARDS,
  buildShortFilmsShelf,
} from './shortsPrograms/composeHomeShortFilms.js';
import {
  getHomeLandingMockupPresentation,
  isHomeMockupMode,
} from './fixtures/homeLandingMockupPresentation.js';
import { captureHomeRestore } from './navigation/navState.js';
import { capVisibleShelf } from './visibility/filmVisibility.js';
import { useDiscoveryVisibility } from './visibility/useDiscoveryVisibility.js';
import { useDestinationReveal } from './navigation/useDestinationReveal.js';
import { readHomeShelfModels } from './home/homeShelfModelCache.js';
import { pacificSortableDateTime } from './showtimes/showtimeEligibility.js';

const HOME_SHELF_SKELETONS = Object.freeze([
  Object.freeze({ id: 'v2-leaving', title: 'Leaving Soon' }),
  Object.freeze({ id: 'v2-special', title: 'Special Presentations' }),
  Object.freeze({ id: 'v2-opening', title: 'Opening This Week' }),
  Object.freeze({ id: 'v2-announced', title: 'Just Announced' }),
]);

function HomeShelfSkeleton({ id, title }) {
  return (
    <section id={id} className="v2-shelf" aria-hidden="true">
      <div className="v2-shelf-header">
        <h2 className="v2-shelf-heading">{title}</h2>
      </div>
      <div className="v2-shelf-row" data-shelf-visible-slots="4">
        {['a', 'b', 'c', 'd'].map((slot) => (
          <div key={slot} className="v2-shelf-item">
            <div className="v2-shelf-card v2-shelf-card-skeleton">
              <div className="v2-shelf-poster" />
              <span className="v2-shelf-skeleton-line" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Home destination — curated moviegoing dashboard.
 * Visual QC: `?homeMockup=1` swaps data only (fixture films / expanded state).
 * TMDB attribution lives under Profile → About & data sources (not on Home).
 */
export default function HomeDestination({
  loadStatus = 'loading',
  homeData = null,
  enrichmentIndex = null,
  shortsIndex = null,
  errorMessage = null,
  onOpenFilmDetail,
  onOpenShortDetail,
  onOpenCollection,
  onOpenShowtimesBrowse,
  restoreState = null,
  onRestoreConsumed,
}) {
  void onOpenShowtimesBrowse;
  const mockupMode = isHomeMockupMode();
  const mockup = mockupMode ? getHomeLandingMockupPresentation() : null;

  const [expanded, setExpanded] = useState(() =>
    mockup
      ? {
          shelfId: mockup.initialExpanded.shelfId,
          filmKey: mockup.initialExpanded.filmKey,
        }
      : { shelfId: null, filmKey: null },
  );
  const [topOppIndex, setTopOppIndex] = useState(
    mockup ? mockup.initialTopOppIndex : 0,
  );
  const contentRevealed = useDestinationReveal('home');

  useEffect(() => {
    if (!restoreState) return;
    setExpanded({
      shelfId: restoreState.expandedShelfId,
      filmKey: restoreState.expandedFilmKey,
    });
    setTopOppIndex(restoreState.topOppIndex ?? 0);
    const y = restoreState.scrollY ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      onRestoreConsumed?.();
    });
  }, [restoreState, onRestoreConsumed]);

  const { storage, preferences, revision } = useDiscoveryVisibility();
  const visibilityOptions = useMemo(
    () => ({
      storage,
      preferences,
      context: 'home',
    }),
    [storage, preferences, revision],
  );

  const effectiveHomeData = mockup ? mockup.homeData : homeData;
  const dataReady = loadStatus === 'ready' && homeData != null;
  const dataForShelves = mockup
    ? mockup.homeData
    : dataReady
      ? homeData
      : null;
  // Every Home mount paints the shell first. Loaded data is revealed on the
  // next frame, so a warm return does not rebuild shelves before paint.
  const showContent = Boolean(mockup) || (contentRevealed && dataReady);
  const showShelfSkeletons = !mockup && loadStatus !== 'error' && !showContent;
  const homeContentPhase = mockup
    ? 'ready'
    : showContent
      ? 'ready'
      : dataReady
        ? 'preparing'
        : 'loading';
  const featureStatus = mockup
    ? 'ready'
    : loadStatus === 'error'
      ? 'error'
      : showContent
        ? loadStatus
        : homeContentPhase;

  const shelfModels = useMemo(() => {
    if (showShelfSkeletons) return null;
    const uncapped = { maxCards: Number.POSITIVE_INFINITY };
    const buildModels = () => ({
      leaving: capVisibleShelf(
        mockup
          ? mockup.leavingShelf
          : buildLeavingSoonShelf(dataForShelves, enrichmentIndex, uncapped),
        visibilityOptions,
        HOME_LEAVING_SOON_MAX_CARDS,
      ),
      special: capVisibleShelf(
        buildSpecialPresentationsShelf(
          dataForShelves,
          mockup ? null : enrichmentIndex,
          uncapped,
        ),
        visibilityOptions,
        HOME_SPECIAL_PRESENTATIONS_MAX_CARDS,
      ),
      opening: capVisibleShelf(
        mockup
          ? mockup.openingShelf
          : buildOpeningThisWeekShelf(
              dataForShelves,
              enrichmentIndex,
              uncapped,
            ),
        visibilityOptions,
        HOME_OPENING_SHELF_MAX_CARDS,
      ),
      shortFilms: capVisibleShelf(
        mockup
          ? { status: 'unavailable', films: [] }
          : buildShortFilmsShelf(dataForShelves, shortsIndex, enrichmentIndex, {
              maxCards: null,
            }),
        visibilityOptions,
        HOME_SHORT_FILMS_MAX_CARDS,
      ),
      announced: capVisibleShelf(
        buildJustAnnouncedShelf(
          dataForShelves,
          mockup ? null : enrichmentIndex,
          uncapped,
        ),
        visibilityOptions,
        HOME_JUST_ANNOUNCED_MAX_CARDS,
      ),
    });
    if (mockup) return buildModels();
    return readHomeShelfModels(
      {
        homeData,
        enrichmentIndex,
        shortsIndex,
        revision,
        hideNotInterested: preferences.hideNotInterested === true,
        hideSeen: preferences.hideSeen === true,
        nowMinute: pacificSortableDateTime(),
      },
      buildModels,
    );
  }, [
    showShelfSkeletons,
    mockup,
    dataForShelves,
    homeData,
    enrichmentIndex,
    shortsIndex,
    visibilityOptions,
    revision,
    preferences.hideNotInterested,
    preferences.hideSeen,
  ]);

  const leavingShelf = shelfModels?.leaving;
  const specialShelf = shelfModels?.special;
  const openingShelf = shelfModels?.opening;
  const shortFilmsShelf = shelfModels?.shortFilms;
  const announcedShelf = shelfModels?.announced;

  const openDetailFromHome = ({
    filmKey,
    filmId,
    opportunityKey,
    shelfId,
    filmKeyExpanded,
  }) => {
    const homeRestore = captureHomeRestore({
      expandedShelfId: shelfId ?? expanded.shelfId,
      expandedFilmKey: filmKeyExpanded ?? expanded.filmKey,
      topOppIndex,
    });
    onOpenFilmDetail({
      filmKey,
      filmId: filmId ?? null,
      opportunityKey,
      originPrimary: 'home',
      homeRestore,
    });
  };

  const openShortFromHome = ({
    shortId,
    shortsProgramId,
    shelfId,
    filmKeyExpanded,
  }) => {
    const homeRestore = captureHomeRestore({
      expandedShelfId: shelfId ?? expanded.shelfId,
      expandedFilmKey: filmKeyExpanded ?? expanded.filmKey,
      topOppIndex,
    });
    onOpenShortDetail?.({
      shortId,
      shortsProgramId: shortsProgramId ?? null,
      originPrimary: 'home',
      homeRestore,
    });
  };

  const setShelfExpansion = (shelfId, filmKey) => {
    if (!filmKey) {
      setExpanded({ shelfId: null, filmKey: null });
      return;
    }
    setExpanded({ shelfId, filmKey });
  };

  const showShortFilmsShelf =
    !mockup &&
    Array.isArray(shortFilmsShelf?.films) &&
    shortFilmsShelf.films.length > 0;

  return (
    <div
      className="v2-home"
      data-home-source={mockup ? 'home-landing-mockup' : 'home-data'}
      data-destination-phase={showContent ? 'content' : 'shell'}
      data-home-content={homeContentPhase}
      data-home-loading={showShelfSkeletons ? 'true' : undefined}
      aria-busy={showShelfSkeletons ? 'true' : undefined}
    >
      <TopOpportunityFeature
        status={featureStatus}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        errorMessage={mockup ? null : errorMessage}
        initialIndex={topOppIndex}
        onIndexChange={setTopOppIndex}
        mockSelections={mockup ? mockup.topOpportunities : null}
        onOpenFilmDetail={({ filmKey, filmId, opportunityKey, topOppIndex: idx }) => {
          setTopOppIndex(idx);
          openDetailFromHome({
            filmKey,
            filmId,
            opportunityKey,
            shelfId: expanded.shelfId,
            filmKeyExpanded: expanded.filmKey,
          });
        }}
      />

      {showShelfSkeletons
        ? HOME_SHELF_SKELETONS.map((shelf) => (
            <HomeShelfSkeleton key={shelf.id} id={shelf.id} title={shelf.title} />
          ))
        : null}

      {!showShelfSkeletons ? (
      <>
      <FilmShelf
        id="v2-leaving"
        title="Leaving Soon"
        shelf={leavingShelf}
        eagerPosterCount={4}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        hideStatusNotes={Boolean(mockup)}
        expandedFilmKey={
          expanded.shelfId === 'v2-leaving' ? expanded.filmKey : null
        }
        onExpandFilm={(filmKey) => setShelfExpansion('v2-leaving', filmKey)}
        onSeeAll={() =>
          onOpenCollection({
            collectionId: COLLECTION_IDS.leavingSoon,
            originPrimary: 'home',
          })
        }
        onMoreDetails={({ filmKey, filmId, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
            filmId,
            opportunityKey,
            shelfId: 'v2-leaving',
            filmKeyExpanded: filmKey,
          })
        }
      />

      <FilmShelf
        id="v2-special"
        title="Special Presentations"
        shelf={specialShelf}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        hideStatusNotes={Boolean(mockup)}
        expandedFilmKey={
          expanded.shelfId === 'v2-special' ? expanded.filmKey : null
        }
        onExpandFilm={(filmKey) => setShelfExpansion('v2-special', filmKey)}
        onSeeAll={() =>
          onOpenCollection({
            collectionId: COLLECTION_IDS.specialPresentations,
            originPrimary: 'home',
          })
        }
        onMoreDetails={({ filmKey, filmId, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
            filmId,
            opportunityKey,
            shelfId: 'v2-special',
            filmKeyExpanded: filmKey,
          })
        }
      />

      <FilmShelf
        id="v2-opening"
        title="Opening This Week"
        shelf={openingShelf}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        hideStatusNotes={Boolean(mockup)}
        detailOverride={
          mockup && expanded.filmKey === 'fixture-open-2'
            ? mockup.blueHourDetail
            : null
        }
        expandedFilmKey={
          expanded.shelfId === 'v2-opening' ? expanded.filmKey : null
        }
        onExpandFilm={(filmKey) => setShelfExpansion('v2-opening', filmKey)}
        onSeeAll={() =>
          onOpenCollection({
            collectionId: COLLECTION_IDS.openingThisWeek,
            originPrimary: 'home',
          })
        }
        onMoreDetails={({ filmKey, filmId, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
            filmId,
            opportunityKey,
            shelfId: 'v2-opening',
            filmKeyExpanded: filmKey,
          })
        }
      />

      {showShortFilmsShelf ? (
        <FilmShelf
          id="v2-short-films"
          title="Short Films"
          shelf={shortFilmsShelf}
          homeData={effectiveHomeData}
          enrichmentIndex={enrichmentIndex}
          expandedFilmKey={
            expanded.shelfId === 'v2-short-films' ? expanded.filmKey : null
          }
          onExpandFilm={(filmKey) =>
            setShelfExpansion('v2-short-films', filmKey)
          }
          onSeeAll={() =>
            onOpenCollection({
              collectionId: COLLECTION_IDS.shortFilms,
              originPrimary: 'home',
            })
          }
          onMoreDetails={({
            shortId,
            primaryShortsProgramId,
            filmKey,
          }) =>
            openShortFromHome({
              shortId: shortId || filmKey,
              shortsProgramId: primaryShortsProgramId ?? null,
              shelfId: 'v2-short-films',
              filmKeyExpanded: filmKey,
            })
          }
        />
      ) : null}

      <FilmShelf
        id="v2-announced"
        title="Just Announced"
        shelf={announcedShelf}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        hideStatusNotes={Boolean(mockup)}
        expandedFilmKey={
          expanded.shelfId === 'v2-announced' ? expanded.filmKey : null
        }
        onExpandFilm={(filmKey) => setShelfExpansion('v2-announced', filmKey)}
        onSeeAll={() =>
          onOpenCollection({
            collectionId: COLLECTION_IDS.justAnnounced,
            originPrimary: 'home',
          })
        }
        onMoreDetails={({ filmKey, filmId, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
            filmId,
            opportunityKey,
            shelfId: 'v2-announced',
            filmKeyExpanded: filmKey,
          })
        }
      />
      </>
      ) : null}
    </div>
  );
}
