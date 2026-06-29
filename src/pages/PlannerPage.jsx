import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataStatePanel from '../components/DataStatePanel.jsx';
import DropdownMultiSelect from '../components/DropdownMultiSelect.jsx';
import PlannerResultCard from '../components/PlannerResultCard.jsx';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { uniqueSorted } from '../utils/arrayUtils.js';
import { isTodayOrFuture } from '../utils/dateUtils.js';
import { findSchedules } from '../utils/plannerEngine.js';
import {
  buildPlannerSearchFilters,
  FILM_COUNT_OPTIONS,
  formatPlannerResultsHeading,
  formatPlannerSharedFiltersSummary,
  formatPlannerTruncatedMessage,
  formatVisibleResultsLabel,
  getMaxGapHelperText,
  getPlannerEmptyStateMessage,
  getPlannerEmptyStateSuggestion,
  PLANNER_RESULTS_PAGE_SIZE,
  PLANNER_SORT_OPTIONS,
} from '../utils/plannerDisplay.js';
import {
  decodePlannerFilters,
  encodePlannerFilters,
  hasActivePlannerQuery,
  plannerFiltersDiffer,
} from '../utils/plannerUrlState.js';
import { intersectWithOptions } from '../utils/showtimesUrlState.js';
import { buildPlannerFilterShareUrl } from '../utils/plannerShare.js';
import { copyTextToClipboard } from '../utils/shareLinkUtils.js';

export default function PlannerPage() {
  const { rows, loading, error } = useShowtimesData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchRun, setHasSearchRun] = useState(false);
  const [copyLinkStatus, setCopyLinkStatus] = useState('idle');
  const [visibleResultCount, setVisibleResultCount] = useState(PLANNER_RESULTS_PAGE_SIZE);
  const [marathonArrivalNotice, setMarathonArrivalNotice] = useState(null);

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
  const preferredFilms = decoded.preferredFilms;
  const firstFilm = decoded.firstFilm;
  const lastFilm = decoded.lastFilm;
  const sort = decoded.sort;
  const advancedOpen = decoded.advancedOpen;

  useEffect(() => {
    if (searchParams.get('from') !== 'marathon') return;

    const hadMigratedFilters =
      decoded.excludeFilms.trim() !== '' || decoded.preferredFilms.trim() !== '';
    setMarathonArrivalNotice(
      hadMigratedFilters
        ? 'Marathon has moved into Planner. Your saved film filters were applied; use Find plans to search.'
        : 'Marathon has moved into Planner. Use max mode to build the longest movie day available.',
    );

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('from');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, decoded.excludeFilms, decoded.preferredFilms, setSearchParams]);

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
      preferredFilms,
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
      preferredFilms,
      firstFilm,
      lastFilm,
      sort,
      advancedOpen,
    ],
  );

  const filterShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return buildPlannerFilterShareUrl(plannerState, {
      origin: window.location.origin,
      pathname: window.location.pathname,
    });
  }, [plannerState]);

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
        preferredFilms,
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
      preferredFilms,
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
    const { ok } = await copyTextToClipboard(filterShareUrl);
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
      <div className="page-content">
        <header className="page-hero">
          <h1 className="main-header page-title">Movie Planner</h1>
        </header>
        <DataStatePanel
          variant="loading"
          title="Loading showtimes"
          message="Preparing showtime data for planning…"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content">
        <header className="page-hero">
          <h1 className="main-header page-title">Movie Planner</h1>
        </header>
        <DataStatePanel variant="error" title="Could not load planner data" message={error} />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="page-content">
        <header className="page-hero">
          <h1 className="main-header page-title">Movie Planner</h1>
        </header>
        <DataStatePanel
          variant="empty"
          title="No planning dates available"
          message="Showtime data may be stale or empty. Try again after the next refresh."
        />
      </div>
    );
  }

  return (
    <div className="page-content">
      <header className="page-hero">
        <h1 className="main-header page-title">Movie Planner</h1>
        <p className="planner-intro page-subtitle">
          Plan same-theater schedules across AMC, SIFF, and Beacon. Set your filters, then click
          Find plans.
        </p>
      </header>

      {marathonArrivalNotice && (
        <aside className="planner-arrival-notice" role="status" aria-live="polite">
          <p className="planner-arrival-notice-message">{marathonArrivalNotice}</p>
          <button
            type="button"
            className="planner-arrival-notice-dismiss"
            onClick={() => setMarathonArrivalNotice(null)}
            aria-label="Dismiss Marathon migration notice"
          >
            Dismiss
          </button>
        </aside>
      )}

      <div className="planner-controls">
        <div className="planner-filters">
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
            <div className="planner-advanced-panel planner-filters">
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
                  value={includeFilms}
                  onChange={(e) => updateUrlFilters({ includeFilms: e.target.value })}
                  className="filter-input"
                />
                <p className="planner-field-hint">Every listed movie must appear in the plan.</p>
              </div>

              <div className="filter-group">
                <label htmlFor="planner-preferred">Preferred films</label>
                <input
                  id="planner-preferred"
                  type="text"
                  placeholder="Comma-separated titles"
                  value={preferredFilms}
                  onChange={(e) => updateUrlFilters({ preferredFilms: e.target.value })}
                  className="filter-input"
                />
                <p className="planner-field-hint">
                  Plans should include at least one of these movies.
                </p>
              </div>

              <div className="filter-group">
                <label htmlFor="planner-exclude">Excluded movies</label>
                <input
                  id="planner-exclude"
                  type="text"
                  placeholder="Comma-separated titles"
                  value={excludeFilms}
                  onChange={(e) => updateUrlFilters({ excludeFilms: e.target.value })}
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
          <div className="planner-action-buttons">
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
              className="planner-copy-link"
              onClick={handleCopyShareLink}
            >
              Copy share link
            </button>
          </div>
          <div
            className={`planner-copy-link-status${
              copyLinkStatus === 'error' ? ' planner-copy-link-status--error' : ''
            }`}
            aria-live="polite"
          >
            {copyLinkStatus === 'copied' ? 'Link copied' : null}
            {copyLinkStatus === 'error' ? 'Could not copy link' : null}
          </div>
          {showUrlLoadedPrompt ? (
            <div className="planner-url-prompt" role="status">
              <p>
                Planner settings loaded from the URL ({formatPlannerSharedFiltersSummary(decoded)}).
                Click &quot;Find plans&quot; to generate results.
              </p>
              <button
                type="button"
                className="planner-run-search"
                onClick={findPlans}
                disabled={isSearching || !effectiveDate}
              >
                Find plans from shared filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="planner-results">
        {results.length > 0 && (
          <div className="planner-results-summary">
            <h2 className="planner-results-heading">
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
          <div className="planner-empty-state">
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
            <div className="planner-result-list">
              {results.slice(0, visibleResultCount).map((schedule, index) => (
                <PlannerResultCard
                  key={`${schedule.theater_id || schedule.theater}-${schedule.movies.map((m) => `${m.showtime_film_key}@${m.time}`).join('|')}-${schedule.startMin}-${index}`}
                  schedule={schedule}
                  filterShareUrl={filterShareUrl}
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
    </div>
  );
}
