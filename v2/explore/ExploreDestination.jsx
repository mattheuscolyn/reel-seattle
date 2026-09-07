import { useEffect, useState } from 'react';
import { COLLECTION_IDS } from './exploreIds.js';
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
  saveRecentSearches,
} from './recentSearchesStore.js';
import ExploreBrowseBy from './ExploreBrowseBy.jsx';
import ExploreQuickStart from './ExploreQuickStart.jsx';
import ExploreRecentSearches from './ExploreRecentSearches.jsx';
import ExploreSearch from './ExploreSearch.jsx';
import { browseUiForQuickStart } from './exploreQuickStart.js';
import { captureExploreRestore } from '../navigation/navState.js';
import { SEARCH_EXPLORE_HONESTY_NOTE } from './searchCopy.js';

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Explore landing — discovery hub (not an exhaustive movie list).
 *
 * Section order: Search → Quick Start → Browse By → Recent Searches.
 * Suggested-starts landing cards removed until personalized (EXP-03).
 * Film activity lives on Profile, not Explore.
 */
export default function ExploreDestination({
  homeData: _homeData,
  onOpenCollection,
  onOpenFilmDetail: _onOpenFilmDetail,
  onOpenShowtimesBrowse,
  restoreState = null,
  onRestoreConsumed,
}) {
  const storage = getStorage();
  const [recent, setRecent] = useState(() => loadRecentSearches(storage));

  useEffect(() => {
    if (!restoreState) return;
    const y = restoreState.scrollY ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      onRestoreConsumed?.();
    });
  }, [restoreState, onRestoreConsumed]);

  const openSurface = (collectionId, query = null) => {
    onOpenCollection?.({
      collectionId,
      originPrimary: 'explore',
      query,
      exploreRestore: captureExploreRestore(),
    });
  };

  const handleQuickStart = (id) => {
    const browseUi = browseUiForQuickStart(id);
    if (!browseUi) return;
    onOpenShowtimesBrowse?.({
      originPrimary: 'explore',
      exploreRestore: captureExploreRestore(),
      browseUi,
    });
  };

  const submitSearch = (query) => {
    const next = addRecentSearch(query, recent);
    setRecent(next);
    saveRecentSearches(storage, next);
    openSurface(COLLECTION_IDS.searchResults, query);
  };

  return (
    <div className="v2-explore-page">
      <ExploreSearch onSubmit={submitSearch} />

      <ExploreQuickStart onSelect={handleQuickStart} />

      <ExploreBrowseBy onSelect={(id) => openSurface(id)} />

      <ExploreRecentSearches
        searches={recent}
        onRerun={submitSearch}
        onRemove={(term) => {
          const next = removeRecentSearch(term, recent);
          setRecent(next);
          saveRecentSearches(storage, next);
        }}
        onClearAll={() => {
          setRecent([]);
          clearRecentSearches(storage);
        }}
      />

      <details className="v2-dev-details">
        <summary>Development notes</summary>
        <div className="v2-data-status" role="status">
          <p className="v2-data-status-label">Explore honesty</p>
          <p className="v2-data-status-message">
            Recent searches are device-local only. {SEARCH_EXPLORE_HONESTY_NOTE}{' '}
            All showtimes uses a rolling 7-day Pacific window. Collections,
            Coming Soon, Special Events, and 35mm remain incomplete without
            additional data.
          </p>
        </div>
      </details>
    </div>
  );
}
