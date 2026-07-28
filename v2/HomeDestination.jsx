import { useEffect, useState } from 'react';
import { COLLECTION_IDS } from './destinations.js';
import EditorialIntro from './home/EditorialIntro.jsx';
import ExploreMore from './home/ExploreMore.jsx';
import FilmShelf from './home/FilmShelf.jsx';
import PlannerCta from './home/PlannerCta.jsx';
import TopOpportunityFeature from './home/TopOpportunityFeature.jsx';
import {
  buildLeavingSoonShelf,
  buildOpeningThisWeekShelf,
} from './home/shelfData.js';
import { captureHomeRestore } from './navigation/navState.js';

/**
 * Home destination — real Top Opportunity + honest shelves + inline expansion.
 */
export default function HomeDestination({
  loadStatus = 'loading',
  homeData = null,
  errorMessage = null,
  onSelectDestination,
  onOpenFilmDetail,
  onOpenCollection,
  restoreState = null,
  onRestoreConsumed,
}) {
  const [expanded, setExpanded] = useState({
    shelfId: null,
    filmKey: null,
  });
  const [topOppIndex, setTopOppIndex] = useState(0);

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

  const openingShelf = buildOpeningThisWeekShelf(
    loadStatus === 'ready' ? homeData : null,
  );
  const leavingShelf = buildLeavingSoonShelf(
    loadStatus === 'ready' ? homeData : null,
  );

  const openDetailFromHome = ({ filmKey, opportunityKey, shelfId, filmKeyExpanded }) => {
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
    <div className="v2-home">
      <EditorialIntro />

      <TopOpportunityFeature
        status={loadStatus}
        homeData={homeData}
        errorMessage={errorMessage}
        initialIndex={topOppIndex}
        onIndexChange={setTopOppIndex}
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

      <FilmShelf
        id="v2-opening"
        title="Opening This Week"
        shelf={openingShelf}
        homeData={homeData}
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
        id="v2-leaving"
        title="Leaving Soon"
        shelf={leavingShelf}
        homeData={homeData}
        expandedFilmKey={
          expanded.shelfId === 'v2-leaving' ? expanded.filmKey : null
        }
        onExpandFilm={(filmKey) => setShelfExpansion('v2-leaving', filmKey)}
        onSeeAll={() =>
          onOpenCollection({
            collectionId: COLLECTION_IDS.leavingSoon,
            originPrimary: 'explore',
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

      <PlannerCta onActivate={() => onSelectDestination?.('planner')} />

      <ExploreMore onSelectRow={() => onSelectDestination?.('explore')} />

      <details className="v2-dev-details">
        <summary>Development notes</summary>
        <div className="v2-data-status" role="status">
          <p className="v2-data-status-label">Home data honesty</p>
          <p className="v2-data-status-message">
            Top Opportunity uses selectTopOpportunities on live HomeData.
            Opening This Week may show recently added films provisionally when
            present — not a theatrical opening-week classifier. Leaving Soon
            remains gated and unavailable. Visual-only fixtures are not used in
            normal Home rendering.
          </p>
        </div>
      </details>
    </div>
  );
}
