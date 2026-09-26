import { useEffect, useMemo, useState } from 'react';
import { COLLECTION_IDS, COLLECTION_TITLES } from './exploreIds.js';
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
import {
  BROWSE_ROWS,
  BROWSE_SHOWTIMES_ID,
  isBrowseShowtimesId,
} from './exploreBrowseBy.js';
import {
  browseUiForQuickStart,
  buildQuickStartItems,
  browseDestinationId,
  showtimesDestinationId,
} from './exploreQuickStart.js';
import { recordQuickStartVisit } from './quickStartHistoryStore.js';
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
 * Browse By leads with Showtimes, then Movies and the remaining destinations.
 * Quick Start is a shortcut layer built from local history + defaults.
 */
export default function ExploreDestination({
  homeData = null,
  onOpenCollection,
  onOpenFilmDetail: _onOpenFilmDetail,
  onOpenShowtimesBrowse,
  onOpenTheaterDetail = null,
  onOpenFormatDetail = null,
  onOpenCollectionDetail = null,
  restoreState = null,
  onRestoreConsumed,
}) {
  const storage = getStorage();
  const [recent, setRecent] = useState(() => loadRecentSearches(storage));
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    if (!restoreState) return;
    const y = restoreState.scrollY ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      onRestoreConsumed?.();
    });
  }, [restoreState, onRestoreConsumed]);

  const quickStartItems = useMemo(() => {
    void historyRevision;
    return buildQuickStartItems({ storage, homeData });
  }, [storage, homeData, historyRevision]);

  const bumpHistory = () => setHistoryRevision((n) => n + 1);

  const openSurface = (collectionId, query = null) => {
    onOpenCollection?.({
      collectionId,
      originPrimary: 'explore',
      query,
      exploreRestore: captureExploreRestore(),
    });
  };

  const openShowtimes = (quickStartId = 'all-showtimes') => {
    const browseUi = browseUiForQuickStart(quickStartId);
    if (!browseUi) return;
    onOpenShowtimesBrowse?.({
      originPrimary: 'explore',
      exploreRestore: captureExploreRestore(),
      browseUi,
    });
  };

  const recordBrowseVisit = (browseId, label) => {
    recordQuickStartVisit(storage, {
      destinationId: browseDestinationId(browseId),
      kind: browseId === BROWSE_SHOWTIMES_ID ? 'showtimes' : 'browse',
      label,
    });
    bumpHistory();
  };

  const handleBrowseBy = (id) => {
    if (isBrowseShowtimesId(id)) {
      recordBrowseVisit(id, 'Showtimes');
      openShowtimes('all-showtimes');
      return;
    }
    const row = BROWSE_ROWS.find((r) => r.id === id);
    const label =
      row?.label ||
      COLLECTION_TITLES[id] ||
      (typeof id === 'string' ? id : null);
    recordBrowseVisit(id, label);
    openSurface(id);
  };

  const handleQuickStart = (item) => {
    if (!item?.action) return;
    const action = item.action;

    if (action.type === 'showtimes-browse') {
      recordQuickStartVisit(storage, {
        destinationId: showtimesDestinationId(action.quickStartId),
        kind: 'showtimes',
        label: item.label,
      });
      bumpHistory();
      openShowtimes(action.quickStartId);
      return;
    }

    if (action.type === 'collection') {
      recordBrowseVisit(action.collectionId, item.label);
      openSurface(action.collectionId);
      return;
    }

    if (action.type === 'theater') {
      recordQuickStartVisit(storage, {
        destinationId: `theater:${action.theaterId}`,
        kind: 'theater',
        label: item.label,
      });
      bumpHistory();
      onOpenTheaterDetail?.({
        theaterId: action.theaterId,
        originPrimary: 'explore',
        exploreRestore: captureExploreRestore(),
      });
      return;
    }

    if (action.type === 'format') {
      recordQuickStartVisit(storage, {
        destinationId: `format:${action.formatId}`,
        kind: 'format',
        label: item.label,
      });
      bumpHistory();
      onOpenFormatDetail?.({
        formatId: action.formatId,
        originPrimary: 'explore',
        exploreRestore: captureExploreRestore(),
      });
      return;
    }

    if (action.type === 'collection-detail') {
      recordQuickStartVisit(storage, {
        destinationId: `collection:${action.collectionId}`,
        kind: 'collection',
        label: item.label,
      });
      bumpHistory();
      if (typeof onOpenCollectionDetail === 'function') {
        onOpenCollectionDetail({
          collectionId: action.collectionId,
          originPrimary: 'explore',
          exploreRestore: captureExploreRestore(),
        });
      } else {
        openSurface(COLLECTION_IDS.collections);
      }
    }
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

      <ExploreQuickStart items={quickStartItems} onSelect={handleQuickStart} />

      <ExploreBrowseBy onSelect={handleBrowseBy} />

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
            Recent searches are device-local only. Quick Start shortcuts may
            reflect local Explore navigation history on this device.{' '}
            {SEARCH_EXPLORE_HONESTY_NOTE} All showtimes uses a rolling 7-day
            Pacific window. Special Events uses high-confidence screening-level
            event classification from showtimes.
          </p>
        </div>
      </details>
    </div>
  );
}
