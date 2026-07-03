import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CollapsibleMovieCard from '../components/CollapsibleMovieCard.jsx';
import DataStatePanel from '../components/DataStatePanel.jsx';
import DropdownMultiSelect from '../components/DropdownMultiSelect.jsx';
import CurrentWindowSummary from '../components/CurrentWindowSummary.jsx';
import PipelineStatus from '../components/PipelineStatus.jsx';
import RecentlyAddedSection from '../components/RecentlyAddedSection.jsx';
import SortDropdown from '../components/SortDropdown.jsx';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { RECENTLY_ADDED_PREVIEW_LIMIT } from '../utils/recentlyAddedDisplay.js';
import { copyTextToClipboard, getShareUrlFromLocation } from '../utils/shareLinkUtils.js';
import {
  buildShowtimesPageResults,
  buildShowtimesFilterOptions,
  groupMoviesByParent,
} from '../utils/showtimesPageEngine.js';
import {
  decodeShowtimesFilters,
  encodeShowtimesFilters,
  intersectWithOptions,
  showtimesFiltersDiffer,
} from '../utils/showtimesUrlState.js';

export default function ShowtimesPage() {
  const { rows, loading, error } = useShowtimesData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [copyViewStatus, setCopyViewStatus] = useState('idle');
  
  // Default to collapsed on mobile (viewport width <= 768px)
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 768;
    }
    return true;
  });

  const { theaters, dates } = useMemo(() => buildShowtimesFilterOptions(rows), [rows]);

  const decoded = useMemo(() => decodeShowtimesFilters(searchParams), [searchParams]);
  const selectedDates = useMemo(
    () => intersectWithOptions(decoded.selectedDates, dates),
    [decoded.selectedDates, dates],
  );
  const selectedTheaters = useMemo(
    () => intersectWithOptions(decoded.selectedTheaters, theaters),
    [decoded.selectedTheaters, theaters],
  );
  const searchText = decoded.searchText;
  const sort = decoded.sort;

  const updateUrlFilters = (partial, { replace = true } = {}) => {
    const current = decodeShowtimesFilters(searchParams);
    const nextParams = encodeShowtimesFilters({ ...current, ...partial });
    if (showtimesFiltersDiffer(nextParams, searchParams)) {
      setSearchParams(nextParams, { replace });
    }
  };

  useEffect(() => {
    if (dates.length === 0 && theaters.length === 0) return;

    const prunedDates = intersectWithOptions(decoded.selectedDates, dates);
    const prunedTheaters = intersectWithOptions(decoded.selectedTheaters, theaters);
    if (
      prunedDates.length !== decoded.selectedDates.length ||
      prunedTheaters.length !== decoded.selectedTheaters.length
    ) {
      const nextParams = encodeShowtimesFilters({
        ...decoded,
        selectedDates: prunedDates,
        selectedTheaters: prunedTheaters,
      });
      if (showtimesFiltersDiffer(nextParams, searchParams)) {
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [dates, theaters, decoded, searchParams, setSearchParams]);

  const { movies: sortedMovies } = useMemo(
    () => buildShowtimesPageResults(rows, { selectedTheaters, selectedDates, sort, searchText }),
    [rows, selectedTheaters, selectedDates, sort, searchText],
  );

  const groupedMovies = useMemo(
    () => groupMoviesByParent(sortedMovies),
    [sortedMovies],
  );

  useEffect(() => {
    function setStickyHeaderTop() {
      const shell = document.querySelector('.app-shell-header');
      const stickyControls = document.querySelector('.sticky-controls');
      if (shell && stickyControls) {
        const shellHeight = shell.offsetHeight;
        document.documentElement.style.setProperty('--app-shell-offset', `${shellHeight}px`);
        const offset = shellHeight + stickyControls.offsetHeight - 8;
        document.documentElement.style.setProperty('--sticky-header-top', `${offset}px`);
        document.documentElement.style.setProperty('--sticky-date-header-top', `${offset + 60}px`);
        document.documentElement.style.setProperty('--sticky-theater-header-top', `${offset + 92}px`);
      }
    }

    setStickyHeaderTop();
    window.addEventListener('resize', setStickyHeaderTop);
    return () => window.removeEventListener('resize', setStickyHeaderTop);
  }, []);

  useEffect(() => {
    if (copyViewStatus === 'idle') return undefined;
    const timer = setTimeout(() => setCopyViewStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyViewStatus]);

  const handleCopyCurrentView = async () => {
    const url = getShareUrlFromLocation(window.location);
    const { ok } = await copyTextToClipboard(url);
    setCopyViewStatus(ok ? 'copied' : 'error');
  };

  return (
    <div className="page-content">
      <header className="page-hero">
        <h1 className="main-header page-title">Showtimes</h1>
        <p className="page-subtitle">
          Browse current Seattle-area showtimes from AMC, SIFF, and The Beacon.
        </p>
      </header>

      <CurrentWindowSummary />

      <PipelineStatus />

      <RecentlyAddedSection limit={RECENTLY_ADDED_PREVIEW_LIMIT} showViewAllLink />

      <div className="sticky-controls">
        <button
          type="button"
          className="filters-toggle"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          aria-expanded={filtersExpanded}
          aria-controls="showtimes-filters"
        >
          <span className="filters-toggle-label">
            {filtersExpanded ? 'Hide' : 'Show'} Filters
          </span>
          <span className={`filters-toggle-icon${filtersExpanded ? ' filters-toggle-icon--expanded' : ''}`}>
            ▼
          </span>
        </button>

        <div
          id="showtimes-filters"
          className={`filters-panel${filtersExpanded ? ' filters-panel--expanded' : ''}`}
        >
          <div className="showtimes-search">
            <input
              type="search"
              className="filter-input showtimes-search-input"
              placeholder="Search movies…"
              value={searchText}
              onChange={(e) => updateUrlFilters({ searchText: e.target.value }, { replace: true })}
              aria-label="Search movies"
            />
          </div>

          <div className="filters">
            <DropdownMultiSelect
              label="Theater"
              options={theaters}
              selected={selectedTheaters}
              setSelected={(value) => updateUrlFilters({ selectedTheaters: value }, { replace: true })}
            />
            <DropdownMultiSelect
              label="Date"
              options={dates}
              selected={selectedDates}
              setSelected={(value) => updateUrlFilters({ selectedDates: value }, { replace: true })}
            />
          </div>

          <div className="sort-row">
            <SortDropdown
              sort={sort}
              setSort={(value) => updateUrlFilters({ sort: value }, { replace: true })}
            />
          </div>

          <div className="showtimes-share-row">
            <button type="button" className="showtimes-copy-view" onClick={handleCopyCurrentView}>
              Copy current view
            </button>
            <div
              className={`copy-link-status${
                copyViewStatus === 'error' ? ' copy-link-status--error' : ''
              }`}
              aria-live="polite"
            >
              {copyViewStatus === 'copied' ? 'Link copied' : null}
              {copyViewStatus === 'error' ? 'Could not copy link' : null}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <DataStatePanel
          variant="loading"
          title="Loading showtimes"
          message="Fetching the latest Seattle-area showtime data…"
        />
      ) : error ? (
        <DataStatePanel variant="error" title="Could not load showtimes" message={error} />
      ) : rows.length === 0 ? (
        <DataStatePanel
          variant="empty"
          title="No showtimes available"
          message="Check back after the next data refresh, or try again later."
        />
      ) : (
        <div className="movie-list">
          {groupedMovies.length === 0 ? (
            <DataStatePanel
              variant="empty"
              title="No movies match your filters"
              message="Try clearing search text or widening your theater and date filters."
            />
          ) : null}
          {groupedMovies.map((movie, idx) => (
            <CollapsibleMovieCard
              key={movie.film + idx}
              movie={movie}
              selectedDates={selectedDates}
              selectedTheaters={selectedTheaters}
            />
          ))}
        </div>
      )}
    </div>
  );
}

