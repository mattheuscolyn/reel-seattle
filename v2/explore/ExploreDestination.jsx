import { useEffect, useState } from 'react';
import { COLLECTION_IDS } from './exploreIds.js';
import {
  loadDismissedFilmKeys,
} from './dismissedFilmsStore.js';
import {
  loadSeenFilmKeys,
} from './seenFilmsStore.js';
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
  saveRecentSearches,
} from './recentSearchesStore.js';
import ExploreBrowseBy from './ExploreBrowseBy.jsx';
import ExploreFilmActivity from './ExploreFilmActivity.jsx';
import ExploreQuickStart from './ExploreQuickStart.jsx';
import ExploreRecentSearches from './ExploreRecentSearches.jsx';
import ExploreSearch from './ExploreSearch.jsx';
import ExploreSuggestedStarts from './ExploreSuggestedStarts.jsx';
import { captureExploreRestore } from '../navigation/navState.js';
import { SEARCH_EXPLORE_HONESTY_NOTE } from './searchCopy.js';
import { SHOWTIMES_BROWSE_QUICK_START_ID } from '../showtimes/showtimesBrowseModel.js';

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
 * Section order: Search → Quick Start → Browse By → Suggested Starts →
 * Your Film Activity → Recent Searches.
 */
export default function ExploreDestination({
  homeData,
  onOpenCollection,
  onOpenFilmDetail: _onOpenFilmDetail,
  onOpenShowtimesBrowse,
  restoreState = null,
  onRestoreConsumed,
}) {
  const storage = getStorage();
  const [recent, setRecent] = useState(() => loadRecentSearches(storage));
  const [dismissedKeys, setDismissedKeys] = useState(() =>
    loadDismissedFilmKeys(storage),
  );
  const [seenKeys, setSeenKeys] = useState(() => loadSeenFilmKeys(storage));

  useEffect(() => {
    if (!restoreState) return;
    const y = restoreState.scrollY ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      onRestoreConsumed?.();
    });
  }, [restoreState, onRestoreConsumed]);

  // Refresh activity counts when returning to landing or remounting after FD Seen/NI.
  useEffect(() => {
    setDismissedKeys(loadDismissedFilmKeys(storage));
    setSeenKeys(loadSeenFilmKeys(storage));
  }, [restoreState, storage, homeData]);

  const openSurface = (collectionId, query = null) => {
    onOpenCollection?.({
      collectionId,
      originPrimary: 'explore',
      query,
      exploreRestore: captureExploreRestore(),
    });
  };

  const handleQuickStart = (id) => {
    if (id === SHOWTIMES_BROWSE_QUICK_START_ID) {
      onOpenShowtimesBrowse?.({
        originPrimary: 'explore',
        exploreRestore: captureExploreRestore(),
      });
      return;
    }
    openSurface(id);
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

      <ExploreSuggestedStarts
        onSelect={(id) => openSurface(id)}
        onViewAll={(id) => openSurface(id)}
      />

      <ExploreFilmActivity
        homeData={homeData}
        seenKeys={seenKeys}
        dismissedKeys={dismissedKeys}
        onManage={(id) => openSurface(id)}
        onOpenSeen={() => openSurface(COLLECTION_IDS.seen)}
        onOpenNotInterested={() => openSurface(COLLECTION_IDS.hidden)}
      />

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
            Recent searches, Seen, and Not interested are device-local only.{' '}
            {SEARCH_EXPLORE_HONESTY_NOTE} This Week is a rolling 7-day Pacific
            window. Collections, Coming Soon, Special Events, and 35mm remain
            incomplete without additional data.
          </p>
        </div>
      </details>
    </div>
  );
}
