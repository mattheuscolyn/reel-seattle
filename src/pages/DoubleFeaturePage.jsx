import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DropdownMultiSelect from '../components/DropdownMultiSelect.jsx';
import DoubleFeatureResultCard from '../components/DoubleFeatureResultCard.jsx';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { uniqueSorted } from '../utils/arrayUtils.js';
import { isTodayOrFuture } from '../utils/dateUtils.js';
import {
  buildDoubleFeatureMovieOptions,
  filterDoubleFeatureRows,
  findDoubleFeaturePairs,
} from '../utils/doubleFeatureEngine.js';
import {
  decodeDoubleFeatureFilters,
  doubleFeatureFiltersDiffer,
  encodeDoubleFeatureFilters,
  hasActivePlannerQuery,
  intersectWithOptions,
} from '../utils/doubleFeatureUrlState.js';
import { copyTextToClipboard, getShareUrlFromLocation } from '../utils/shareLinkUtils.js';

export default function DoubleFeaturePage() {
  const { rows, loading, error } = useShowtimesData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchRun, setHasSearchRun] = useState(false);
  const [copyLinkStatus, setCopyLinkStatus] = useState('idle');

  const theaters = useMemo(
    () => (rows.length === 0 ? [] : uniqueSorted(rows.map((row) => row.Theater))),
    [rows],
  );
  const dates = useMemo(
    () =>
      rows.length === 0
        ? []
        : uniqueSorted(rows.map((row) => row.Date).filter(isTodayOrFuture)),
    [rows],
  );

  const decoded = useMemo(() => decodeDoubleFeatureFilters(searchParams), [searchParams]);
  const selectedDate = decoded.selectedDate;
  const effectiveDate = selectedDate || dates[0] || '';
  const selectedTheaters = useMemo(
    () => intersectWithOptions(decoded.selectedTheaters, theaters),
    [decoded.selectedTheaters, theaters],
  );
  const earliestStartTime = decoded.earliestStartTime;
  const earliestEndTime = decoded.earliestEndTime;
  const movieFilterType = decoded.movieFilterType;
  const selectedMovies = decoded.selectedMovies;

  const updateUrlFilters = (partial, { replace = true } = {}) => {
    const current = decodeDoubleFeatureFilters(searchParams);
    const nextParams = encodeDoubleFeatureFilters({ ...current, ...partial });
    if (doubleFeatureFiltersDiffer(nextParams, searchParams)) {
      setSearchParams(nextParams, { replace });
    }
  };

  const plannerFilters = useMemo(
    () => ({
      selectedDate: effectiveDate,
      selectedTheaters,
      earliestStartTime,
      earliestEndTime,
      movieFilterType,
      selectedMovies,
    }),
    [
      effectiveDate,
      selectedTheaters,
      earliestStartTime,
      earliestEndTime,
      movieFilterType,
      selectedMovies,
    ],
  );

  const filteredMovies = useMemo(() => {
    if (!effectiveDate) return [];
    const filtered = filterDoubleFeatureRows(rows, plannerFilters);
    return buildDoubleFeatureMovieOptions(filtered);
  }, [effectiveDate, plannerFilters, rows]);

  const movieOptions = useMemo(
    () => filteredMovies.map((movie) => movie.film),
    [filteredMovies],
  );
  const validSelectedMovies = useMemo(
    () => intersectWithOptions(selectedMovies, movieOptions),
    [selectedMovies, movieOptions],
  );

  const showUrlLoadedPrompt = useMemo(
    () =>
      !hasSearchRun &&
      !isSearching &&
      hasActivePlannerQuery({
        selectedDate,
        selectedTheaters,
        earliestStartTime,
        earliestEndTime,
        movieFilterType,
        selectedMovies: validSelectedMovies,
      }),
    [
      hasSearchRun,
      isSearching,
      selectedDate,
      selectedTheaters,
      earliestStartTime,
      earliestEndTime,
      movieFilterType,
      validSelectedMovies,
    ],
  );

  useEffect(() => {
    if (dates.length === 0 && theaters.length === 0) return;

    const prunedDate = dates.includes(selectedDate) ? selectedDate : '';
    const prunedTheaters = intersectWithOptions(decoded.selectedTheaters, theaters);
    const prunedMovies = intersectWithOptions(decoded.selectedMovies, movieOptions);

    if (
      prunedDate !== selectedDate ||
      prunedTheaters.length !== decoded.selectedTheaters.length ||
      prunedMovies.length !== decoded.selectedMovies.length
    ) {
      const nextParams = encodeDoubleFeatureFilters({
        ...decoded,
        selectedDate: prunedDate,
        selectedTheaters: prunedTheaters,
        selectedMovies: prunedMovies,
      });
      if (doubleFeatureFiltersDiffer(nextParams, searchParams)) {
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [
    dates,
    theaters,
    movieOptions,
    decoded,
    selectedDate,
    searchParams,
    setSearchParams,
  ]);

  const findDoubleFeatures = () => {
    setHasSearchRun(true);
    setIsSearching(true);

    setTimeout(() => {
      const pairs = findDoubleFeaturePairs(rows, {
        ...plannerFilters,
        selectedMovies: validSelectedMovies,
      });
      setResults(pairs);
      setIsSearching(false);
    }, 0);
  };

  useEffect(() => {
    if (copyLinkStatus === 'idle') return undefined;
    const timer = setTimeout(() => setCopyLinkStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyLinkStatus]);

  const handleCopyShareLink = async () => {
    const url = getShareUrlFromLocation(window.location);
    const { ok } = await copyTextToClipboard(url);
    setCopyLinkStatus(ok ? 'copied' : 'error');
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <>
        <h1 className="main-header">Double Feature Planner</h1>
        <div>{error}</div>
      </>
    );
  }

  if (dates.length === 0) {
    return (
      <>
        <h1 className="main-header">Double Feature Planner</h1>
        <div>No dates are available for double feature planning.</div>
      </>
    );
  }

  return (
    <>
      <h1 className="main-header">Double Feature Planner</h1>
      <div className="double-feature-controls">
        <div className="double-feature-filters">
          <div className="filter-group">
            <label>Date</label>
            <select
              value={effectiveDate}
              onChange={(e) => updateUrlFilters({ selectedDate: e.target.value })}
              className="filter-select"
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Theaters</label>
            <DropdownMultiSelect
              label="Select Theaters"
              options={theaters}
              selected={selectedTheaters}
              setSelected={(value) => updateUrlFilters({ selectedTheaters: value })}
            />
          </div>

          <div className="filter-group">
            <label>Earliest Start Time (optional)</label>
            <input
              type="text"
              placeholder="e.g., 7:30PM"
              value={earliestStartTime}
              onChange={(e) => updateUrlFilters({ earliestStartTime: e.target.value })}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>Earliest End Time (optional)</label>
            <input
              type="text"
              placeholder="e.g., 10:00PM"
              value={earliestEndTime}
              onChange={(e) => updateUrlFilters({ earliestEndTime: e.target.value })}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>Movie Filter</label>
            <select
              value={movieFilterType}
              onChange={(e) => {
                const nextType = e.target.value;
                updateUrlFilters({
                  movieFilterType: nextType,
                  selectedMovies: nextType === 'none' ? [] : validSelectedMovies,
                });
              }}
              className="filter-select"
            >
              <option value="none">None</option>
              <option value="whitelist">Whitelist</option>
              <option value="blacklist">Blacklist</option>
            </select>
          </div>

          {movieFilterType !== 'none' && (
            <div className="filter-group">
              <label>
                {movieFilterType === 'whitelist' ? 'Include Movies' : 'Exclude Movies'}
              </label>
              {filteredMovies.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: '14px', padding: '10px 14px' }}>
                  No movies match your current filters. Adjust date, theaters, or time filters.
                </div>
              ) : (
                <DropdownMultiSelect
                  label={`Select Movies (${validSelectedMovies.length})`}
                  options={movieOptions}
                  selected={validSelectedMovies}
                  setSelected={(value) => updateUrlFilters({ selectedMovies: value })}
                />
              )}
            </div>
          )}
        </div>
        <div className="search-button-container">
          <div className="double-feature-action-buttons">
            <button
              onClick={findDoubleFeatures}
              disabled={isSearching || !effectiveDate}
              className="search-button"
            >
              {isSearching ? (
                <>
                  <span className="loading-spinner"></span>
                  Searching...
                </>
              ) : (
                'Find Double Features'
              )}
            </button>
            <button
              type="button"
              className="double-feature-copy-link"
              onClick={handleCopyShareLink}
            >
              Copy share link
            </button>
          </div>
          <div
            className={`double-feature-copy-link-status${
              copyLinkStatus === 'error' ? ' double-feature-copy-link-status--error' : ''
            }`}
            aria-live="polite"
          >
            {copyLinkStatus === 'copied' ? 'Link copied' : null}
            {copyLinkStatus === 'error' ? 'Could not copy link' : null}
          </div>
          {showUrlLoadedPrompt ? (
            <div className="double-feature-url-prompt" role="status">
              <p>
                Planner settings loaded from the URL. Click &quot;Find Double Features&quot; or
                Run search to generate results.
              </p>
              <button
                type="button"
                className="double-feature-run-search"
                onClick={findDoubleFeatures}
                disabled={isSearching || !effectiveDate}
              >
                Run search
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="double-feature-results">
        {results.length > 0 && (
          <h2 className="double-feature-results-heading">
            {results.length} Double Feature Option{results.length !== 1 ? 's' : ''} Found
          </h2>
        )}
        {isSearching ? (
          <div className="search-loading">
            <span className="loading-spinner-large"></span>
            <div className="search-loading-text">Searching for double features...</div>
          </div>
        ) : results.length === 0 ? (
          showUrlLoadedPrompt ? null : (
            <div className="double-feature-empty-state">
              No double features found matching your criteria. Try adjusting your filters and click
              &quot;Find Double Features&quot; again.
            </div>
          )
        ) : (
          <div className="double-feature-list">
            {results.map((result) => (
              <DoubleFeatureResultCard
                key={`${result.theater}-${result.movieA.film}-${result.movieA.showtime}-${result.movieB.film}-${result.movieB.showtime}`}
                pair={result}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
