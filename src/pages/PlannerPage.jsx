import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DropdownMultiSelect from '../components/DropdownMultiSelect.jsx';
import PlannerResultCard from '../components/PlannerResultCard.jsx';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { uniqueSorted } from '../utils/arrayUtils.js';
import { isTodayOrFuture } from '../utils/dateUtils.js';
import { findSchedules } from '../utils/plannerEngine.js';
import {
  buildPlannerSearchFilters,
  FILM_COUNT_OPTIONS,
  formatFilmListInput,
  formatPlannerResultsHeading,
  formatPlannerSharedFiltersSummary,
  formatPlannerTruncatedMessage,
  formatVisibleResultsLabel,
  getMaxGapHelperText,
  getPlannerEmptyStateMessage,
  getPlannerEmptyStateSuggestion,
  parseFilmListInput,
  PLANNER_RESULTS_PAGE_SIZE,
  PLANNER_SORT_OPTIONS,
} from '../utils/plannerDisplay.js';
import {
  decodePlannerFilters,
  encodePlannerFilters,
  hasActivePlannerQuery,
  intersectWithOptions,
  plannerFiltersDiffer,
} from '../utils/plannerUrlState.js';
import { copyTextToClipboard, getShareUrlFromLocation } from '../utils/shareLinkUtils.js';

export default function PlannerPage() {
  const { rows, loading, error } = useShowtimesData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchRun, setHasSearchRun] = useState(false);
  const [copyLinkStatus, setCopyLinkStatus] = useState('idle');
  const [visibleResultCount, setVisibleResultCount] = useState(PLANNER_RESULTS_PAGE_SIZE);

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

  const decoded = useMemo(() => decodePlannerFilters(searchParams), [searchParams]);
  const selectedDate = decoded.selectedDate;
  const effectiveDate = dates.includes(selectedDate) ? selectedDate : dates[0] || '';
  const selectedTheaters = useMemo(
    () => intersectWithOptions(decoded.selectedTheaters, theaters),
    [decoded.selectedTheaters, theaters],
  );
  const filmCount = decoded.filmCount;
  const startAfter = decoded.startAfter;
  const finishBy = decoded.finishBy;
  const minGapMin = decoded.minGapMin;
  const maxGapMin = decoded.maxGapMin;
  const maxGapExplicit = decoded.maxGapExplicit;
  const includeFilms = decoded.includeFilms;
  const excludeFilms = decoded.excludeFilms;
  const firstFilm = decoded.firstFilm;
  const lastFilm = decoded.lastFilm;
  const sort = decoded.sort;
  const advancedOpen = decoded.advancedOpen;

  const plannerState = useMemo(
    () => ({
      selectedDate: effectiveDate,
      selectedTheaters,
      filmCount,
      startAfter,
      finishBy,
      minGapMin,
      maxGapMin,
      maxGapExplicit,
      includeFilms,
      excludeFilms,
      firstFilm,
      lastFilm,
      sort,
      advancedOpen,
    }),
    [
      effectiveDate,
      selectedTheaters,
      filmCount,
      startAfter,
      finishBy,
      minGapMin,
      maxGapMin,
      maxGapExplicit,
      includeFilms,
      excludeFilms,
      firstFilm,
      lastFilm,
      sort,
      advancedOpen,
    ],
  );

  const updateUrlFilters = (partial, { replace = true } = {}) => {
    const current = decodePlannerFilters(searchParams);
    const nextParams = encodePlannerFilters({ ...current, ...partial });
    if (plannerFiltersDiffer(nextParams, searchParams)) {
      setSearchParams(nextParams, { replace });
    }
  };

  const showUrlLoadedPrompt = useMemo(
    () =>
      !hasSearchRun &&
      !isSearching &&
      hasActivePlannerQuery({
        selectedDate,
        selectedTheaters,
        filmCount,
        startAfter,
        finishBy,
        minGapMin,
        maxGapMin,
        maxGapExplicit,
        includeFilms,
        excludeFilms,
        firstFilm,
        lastFilm,
        sort,
      }),
    [
      hasSearchRun,
      isSearching,
      selectedDate,
      selectedTheaters,
      filmCount,
      startAfter,
      finishBy,
      minGapMin,
      maxGapMin,
      maxGapExplicit,
      includeFilms,
      excludeFilms,
      firstFilm,
      lastFilm,
      sort,
    ],
  );

  useEffect(() => {
    if (dates.length === 0 && theaters.length === 0) return;

    const prunedDate = dates.includes(selectedDate) ? selectedDate : '';
    const prunedTheaters = intersectWithOptions(decoded.selectedTheaters, theaters);

    if (
      prunedDate !== selectedDate ||
      prunedTheaters.length !== decoded.selectedTheaters.length
    ) {
      const nextParams = encodePlannerFilters({
        ...decoded,
        selectedDate: prunedDate,
        selectedTheaters: prunedTheaters,
      });
      if (plannerFiltersDiffer(nextParams, searchParams)) {
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [dates, theaters, decoded, selectedDate, searchParams, setSearchParams]);

  useEffect(() => {
    if (copyLinkStatus === 'idle') return undefined;
    const timer = setTimeout(() => setCopyLinkStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyLinkStatus]);

  const findPlans = () => {
    if (!effectiveDate) return;

    setHasSearchRun(true);
    setIsSearching(true);
    setVisibleResultCount(PLANNER_RESULTS_PAGE_SIZE);

    setTimeout(() => {
      const filters = buildPlannerSearchFilters(plannerState);
      const { schedules, meta } = findSchedules({
        rows,
        filters,
        sort: sort || undefined,
      });
      setResults(schedules);
      setSearchMeta(meta);
      setIsSearching(false);
    }, 0);
  };

  const handleCopyShareLink = async () => {
    const params = encodePlannerFilters(plannerState);
    const url = getShareUrlFromLocation({
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
    });
    const { ok } = await copyTextToClipboard(url);
    setCopyLinkStatus(ok ? 'copied' : 'error');
  };

  const handleMaxGapChange = (value) => {
    const trimmed = value.trim();
    updateUrlFilters({
      maxGapMin: trimmed,
      maxGapExplicit: trimmed !== '',
    });
  };

  if (loading) {
    return (
      <>
        <h1 className="main-header">Movie Planner</h1>
        <div className="planner-loading-state">
          <span className="loading-spinner-large"></span>
          <p>Loading showtimes for planning...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h1 className="main-header">Movie Planner</h1>
        <div>{error}</div>
      </>
    );
  }

  if (dates.length === 0) {
    return (
      <>
        <h1 className="main-header">Movie Planner</h1>
        <div>No dates are available for planning.</div>
      </>
    );
  }

  return (
    <>
      <h1 className="main-header">Movie Planner</h1>
      <p className="planner-intro">
        Plan same-theater movie schedules across AMC, SIFF, and Beacon. Choose your filters, then
        click Find plans.
      </p>

      <div className="double-feature-controls planner-controls">
        <div className="double-feature-filters">
          <div className="filter-group">
            <label htmlFor="planner-date">Date</label>
            <select
              id="planner-date"
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
            <label htmlFor="planner-film-count">Number of movies</label>
            <select
              id="planner-film-count"
              value={filmCount}
              onChange={(e) => {
                const next = e.target.value;
                updateUrlFilters({
                  filmCount: next === 'max' ? 'max' : Number(next),
                });
              }}
              className="filter-select"
            >
              {FILM_COUNT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="planner-start-after">Start after (optional)</label>
            <input
              id="planner-start-after"
              type="text"
              placeholder="e.g., 2:00PM"
              value={startAfter}
              onChange={(e) => updateUrlFilters({ startAfter: e.target.value })}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label htmlFor="planner-finish-by">Finish by (optional)</label>
            <input
              id="planner-finish-by"
              type="text"
              placeholder="e.g., 10:00PM"
              value={finishBy}
              onChange={(e) => updateUrlFilters({ finishBy: e.target.value })}
              className="filter-input"
            />
          </div>
        </div>

        <div className="planner-advanced-section">
          <button
            type="button"
            className="planner-advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => updateUrlFilters({ advancedOpen: !advancedOpen })}
          >
            Advanced filters
            <span className="planner-advanced-toggle-icon">{advancedOpen ? '▾' : '▸'}</span>
          </button>

          {advancedOpen ? (
            <div className="planner-advanced-panel double-feature-filters">
              <div className="filter-group">
                <label htmlFor="planner-min-gap">Minimum gap (minutes)</label>
                <input
                  id="planner-min-gap"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g., 15"
                  value={minGapMin}
                  onChange={(e) => updateUrlFilters({ minGapMin: e.target.value })}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="planner-max-gap">Maximum gap (minutes)</label>
                <input
                  id="planner-max-gap"
                  type="number"
                  min="0"
                  step="1"
                  placeholder={filmCount === 2 ? `Default ${59}` : 'No limit'}
                  value={maxGapMin}
                  onChange={(e) => handleMaxGapChange(e.target.value)}
                  className="filter-input"
                />
                <p className="planner-field-hint">{getMaxGapHelperText(filmCount)}</p>
              </div>

              <div className="filter-group">
                <label htmlFor="planner-include">Required movies</label>
                <input
                  id="planner-include"
                  type="text"
                  placeholder="Comma-separated titles"
                  value={formatFilmListInput(includeFilms)}
                  onChange={(e) =>
                    updateUrlFilters({ includeFilms: parseFilmListInput(e.target.value) })
                  }
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="planner-exclude">Excluded movies</label>
                <input
                  id="planner-exclude"
                  type="text"
                  placeholder="Comma-separated titles"
                  value={formatFilmListInput(excludeFilms)}
                  onChange={(e) =>
                    updateUrlFilters({ excludeFilms: parseFilmListInput(e.target.value) })
                  }
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="planner-first">Preferred first movie</label>
                <input
                  id="planner-first"
                  type="text"
                  placeholder="Film title"
                  value={firstFilm}
                  onChange={(e) => updateUrlFilters({ firstFilm: e.target.value })}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="planner-last">Preferred last movie</label>
                <input
                  id="planner-last"
                  type="text"
                  placeholder="Film title"
                  value={lastFilm}
                  onChange={(e) => updateUrlFilters({ lastFilm: e.target.value })}
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label htmlFor="planner-sort">Sort results by</label>
                <select
                  id="planner-sort"
                  value={sort}
                  onChange={(e) => updateUrlFilters({ sort: e.target.value })}
                  className="filter-select"
                >
                  {PLANNER_SORT_OPTIONS.map((option) => (
                    <option key={option.value || 'default'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="search-button-container">
          <div className="double-feature-action-buttons">
            <button
              onClick={findPlans}
              disabled={isSearching || !effectiveDate}
              className="search-button"
            >
              {isSearching ? (
                <>
                  <span className="loading-spinner"></span>
                  Finding plans...
                </>
              ) : (
                'Find plans'
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
                Planner settings loaded from the URL ({formatPlannerSharedFiltersSummary(decoded)}).
                Click &quot;Find plans&quot; to generate results.
              </p>
              <button
                type="button"
                className="double-feature-run-search"
                onClick={findPlans}
                disabled={isSearching || !effectiveDate}
              >
                Find plans from shared filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="double-feature-results planner-results">
        {results.length > 0 && (
          <div className="planner-results-summary">
            <h2 className="double-feature-results-heading">
              {formatPlannerResultsHeading(results.length, filmCount)}
            </h2>
            <p className="planner-results-count">
              {formatVisibleResultsLabel(
                Math.min(visibleResultCount, results.length),
                results.length,
              )}
            </p>
            {searchMeta?.truncated ? (
              <p className="planner-truncated-notice" role="status">
                {formatPlannerTruncatedMessage(searchMeta, results.length)}
              </p>
            ) : null}
          </div>
        )}

        {isSearching ? (
          <div className="search-loading">
            <span className="loading-spinner-large"></span>
            <div className="search-loading-text">Searching for movie plans...</div>
          </div>
        ) : hasSearchRun && results.length === 0 ? (
          <div className="double-feature-empty-state planner-empty-state">
            <p className="planner-empty-title">{getPlannerEmptyStateMessage()}</p>
            <p className="planner-empty-suggestion">{getPlannerEmptyStateSuggestion()}</p>
          </div>
        ) : !hasSearchRun ? (
          <div className="planner-prompt">
            {showUrlLoadedPrompt
              ? 'Shared planner filters are ready. Click "Find plans from shared filters" above.'
              : 'Select filters above and click "Find plans" to generate schedules.'}
          </div>
        ) : (
          <>
            <div className="double-feature-list planner-result-list">
              {results.slice(0, visibleResultCount).map((schedule, index) => (
                <PlannerResultCard
                  key={`${schedule.theater_id || schedule.theater}-${schedule.movies.map((m) => `${m.showtime_film_key}@${m.time}`).join('|')}-${schedule.startMin}-${index}`}
                  schedule={schedule}
                />
              ))}
            </div>
            {visibleResultCount < results.length ? (
              <div className="planner-show-more-wrap">
                <button
                  type="button"
                  className="planner-show-more"
                  onClick={() =>
                    setVisibleResultCount((count) =>
                      Math.min(count + PLANNER_RESULTS_PAGE_SIZE, results.length),
                    )
                  }
                >
                  Show more results ({results.length - visibleResultCount} remaining)
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
