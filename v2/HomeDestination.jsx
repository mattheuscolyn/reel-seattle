import { useEffect, useState } from 'react';
import { COLLECTION_IDS } from './destinations.js';
import EditorialIntro from './home/EditorialIntro.jsx';
import BrowseShowtimesStrip from './home/BrowseShowtimesStrip.jsx';
import FilmShelf from './home/FilmShelf.jsx';
import TopOpportunityFeature from './home/TopOpportunityFeature.jsx';
import {
  buildJustAnnouncedShelf,
  buildLeavingSoonShelf,
  buildOpeningThisWeekShelf,
  buildSpecialPresentationsShelf,
} from './home/shelfData.js';
import {
  getHomeLandingMockupPresentation,
  isHomeMockupMode,
} from './fixtures/homeLandingMockupPresentation.js';
import { captureHomeRestore } from './navigation/navState.js';

/**
 * Home destination — curated moviegoing dashboard.
 * Visual QC: `?homeMockup=1` swaps data only (fixture films / expanded state).
 * TMDB attribution lives under Profile → About & data sources (not on Home).
 */
export default function HomeDestination({
  loadStatus = 'loading',
  homeData = null,
  enrichmentIndex = null,
  errorMessage = null,
  onOpenFilmDetail,
  onOpenCollection,
  onOpenShowtimesBrowse,
  restoreState = null,
  onRestoreConsumed,
}) {
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

  const effectiveHomeData = mockup ? mockup.homeData : homeData;
  const dataForShelves = mockup
    ? mockup.homeData
    : loadStatus === 'ready'
      ? homeData
      : null;

  const leavingShelf = mockup
    ? mockup.leavingShelf
    : buildLeavingSoonShelf(dataForShelves, enrichmentIndex);
  const specialShelf = buildSpecialPresentationsShelf(
    dataForShelves,
    mockup ? null : enrichmentIndex,
  );
  const openingShelf = mockup
    ? mockup.openingShelf
    : buildOpeningThisWeekShelf(dataForShelves, enrichmentIndex);
  const announcedShelf = buildJustAnnouncedShelf(
    dataForShelves,
    mockup ? null : enrichmentIndex,
  );

  const openDetailFromHome = ({
    filmKey,
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
      opportunityKey,
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

  return (
    <div
      className="v2-home"
      data-home-source={mockup ? 'home-landing-mockup' : 'home-data'}
    >
      <EditorialIntro />

      <TopOpportunityFeature
        status={mockup ? 'ready' : loadStatus}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        errorMessage={mockup ? null : errorMessage}
        initialIndex={topOppIndex}
        onIndexChange={setTopOppIndex}
        mockSelections={mockup ? mockup.topOpportunities : null}
        onOpenFilmDetail={({ filmKey, opportunityKey, topOppIndex: idx }) => {
          setTopOppIndex(idx);
          openDetailFromHome({
            filmKey,
            opportunityKey,
            shelfId: expanded.shelfId,
            filmKeyExpanded: expanded.filmKey,
          });
        }}
      />

      <BrowseShowtimesStrip
        expandedShelfId={expanded.shelfId}
        expandedFilmKey={expanded.filmKey}
        topOppIndex={topOppIndex}
        onOpenShowtimesBrowse={onOpenShowtimesBrowse}
        onOpenCollection={onOpenCollection}
      />

      <FilmShelf
        id="v2-leaving"
        title="Leaving Soon"
        shelf={leavingShelf}
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
        onMoreDetails={({ filmKey, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
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
            collectionId: COLLECTION_IDS.formats,
            originPrimary: 'home',
          })
        }
        onMoreDetails={({ filmKey, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
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
        onMoreDetails={({ filmKey, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
            opportunityKey,
            shelfId: 'v2-opening',
            filmKeyExpanded: filmKey,
          })
        }
      />

      <FilmShelf
        id="v2-announced"
        title="Just Announced"
        shelf={announcedShelf}
        homeData={effectiveHomeData}
        enrichmentIndex={mockup ? null : enrichmentIndex}
        hideStatusNotes={Boolean(mockup)}
        hideSeeAll
        expandedFilmKey={
          expanded.shelfId === 'v2-announced' ? expanded.filmKey : null
        }
        onExpandFilm={(filmKey) => setShelfExpansion('v2-announced', filmKey)}
        onMoreDetails={({ filmKey, opportunityKey }) =>
          openDetailFromHome({
            filmKey,
            opportunityKey,
            shelfId: 'v2-announced',
            filmKeyExpanded: filmKey,
          })
        }
      />
    </div>
  );
}
