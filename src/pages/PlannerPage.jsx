import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataStatePanel from '../components/DataStatePanel.jsx';
import DropdownMultiSelect from '../components/DropdownMultiSelect.jsx';
import FilmMultiSelect from '../components/FilmMultiSelect.jsx';
import FilmSingleSelect from '../components/FilmSingleSelect.jsx';
import PlannerConstraintPreview from '../components/PlannerConstraintPreview.jsx';
import PlannerFilmValidation from '../components/PlannerFilmValidation.jsx';
import PlannerMobileFilterBar from '../components/PlannerMobileFilterBar.jsx';
import PlannerResultCard from '../components/PlannerResultCard.jsx';
import PlannerTimePicker from '../components/PlannerTimePicker.jsx';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { uniqueSorted } from '../utils/arrayUtils.js';
import { formatPlannerDateLabel, isTodayOrFuture } from '../utils/dateUtils.js';
import { findSchedules } from '../utils/plannerEngine.js';
import {
  buildPlannerFilmCatalog,
  collectPlannerFilmValidationItems,
  formatUnmatchedFilmSuggestion,
} from '../utils/plannerFilms.js';
import {
  buildPlannerSearchFilters,
  buildPlannerMobileFilterChips,
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
import { shouldShowPreview } from '../utils/plannerConstraintPreview.js';
import { copyTextToClipboard } from '../utils/shareLinkUtils.js';
import {
  compensateScrollForLayoutHeightChange,
  isMobilePlannerViewport,
  measureDocumentTop,
  PLANNER_MOBILE_STICKY_SCROLL_OFFSET,
  runAfterLayout,
  scrollElementIntoViewWithOffset,
} from '../utils/plannerScroll.js';

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
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(true);
  const filterControlsRef = useRef(null);
  const mobileFilterBarRef = useRef(null);
  const plannerResultsRef = useRef(null);
  const pendingScrollToResultsRef = useRef(false);
  const collapseMetricsRef = useRef(null);

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
      decoded.excludeFilms.length > 0 || decoded.preferredFilms.length > 0;
    setMarathonArrivalNotice(
      hadMigratedFilters
        ? 'Marathon has moved into Planner. Your saved film filters were applied; use Find plans to search.'
        : 'Marathon has moved into Planner. Use max mode to build the longest movie day available.',
    );

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('from');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, decoded.excludeFilms, decoded.preferredFilms, setSearchParams]);

  const filmCatalog = useMemo(
    () =>
      buildPlannerFilmCatalog(rows, {
        date: effectiveDate,
        theaters: selectedTheaters,
      }),
    [rows, effectiveDate, selectedTheaters],
  );

  const filmValidationItems = useMemo(
    () =>
      collectPlannerFilmValidationItems({
        includeFilms,
        excludeFilms,
        preferredFilms,
        firstFilm,
        lastFilm,
        catalog: filmCatalog,
      }),
    [includeFilms, excludeFilms, preferredFilms, firstFilm, lastFilm, filmCatalog],
  );

  const unmatchedFilmSuggestion = useMemo(
    () => formatUnmatchedFilmSuggestion(filmValidationItems),
    [filmValidationItems],
  );

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

  const mobileFilterChips = useMemo(
    () =>
      buildPlannerMobileFilterChips(plannerState, {
        theatersTotal: theaters.length,
        formatDate: formatPlannerDateLabel,
      }),
    [plannerState, theaters.length],
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

  useEffect(() => {
    if (isSearching || !pendingScrollToResultsRef.current || !isMobilePlannerViewport()) {
      return;
    }

    const metrics = collapseMetricsRef.current;

    runAfterLayout(() => {
      if (metrics && filterControlsRef.current) {
        compensateScrollForLayoutHeightChange({
          top: metrics.top,
          heightBefore: metrics.heightBefore,
          heightAfter: filterControlsRef.current.offsetHeight,
          smooth: false,
        });
        collapseMetricsRef.current = null;
      }

      scrollElementIntoViewWithOffset(plannerResultsRef.current, {
        offset: PLANNER_MOBILE_STICKY_SCROLL_OFFSET,
        smooth: true,
      });
      pendingScrollToResultsRef.current = false;
    });
  }, [isSearching, hasSearchRun, results.length]);

  const handleMobileFilterToggle = () => {
    if (!isMobilePlannerViewport()) {
      setMobileFiltersExpanded((open) => !open);
      return;
    }

    const controlsEl = filterControlsRef.current;
    if (!controlsEl) {
      setMobileFiltersExpanded((open) => !open);
      return;
    }

    const top = measureDocumentTop(controlsEl);
    const heightBefore = controlsEl.offsetHeight;
    const willCollapse = mobileFiltersExpanded;

    setMobileFiltersExpanded(!willCollapse);

    runAfterLayout(() => {
      compensateScrollForLayoutHeightChange({
        top,
        heightBefore,
        heightAfter: controlsEl.offsetHeight,
        smooth: false,
      });

      if (!willCollapse) {
        scrollElementIntoViewWithOffset(mobileFilterBarRef.current, {
          offset: 8,
          smooth: true,
        });
      }
    });
  };

  const findPlans = () => {
    if (!effectiveDate) return;

    setHasSearchRun(true);
    setIsSearching(true);
    setVisibleResultCount(PLANNER_RESULTS_PAGE_SIZE);

    if (isMobilePlannerViewport()) {
      pendingScrollToResultsRef.current = true;
      const controlsEl = filterControlsRef.current;
      if (controlsEl) {
        collapseMetricsRef.current = {
          top: measureDocumentTop(controlsEl),
          heightBefore: controlsEl.offsetHeight,
        };
      }
    }

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
      if (isMobilePlannerViewport()) {
        setMobileFiltersExpanded(false);
      }
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
      <div className="page-content page-content--planner">
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
      <div className="page-content page-content--planner">
        <header className="page-hero">
          <h1 className="main-header page-title">Movie Planner</h1>
        </header>
        <DataStatePanel variant="error" title="Could not load planner data" message={error} />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="page-content page-content--planner">
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
    <div className="page-content page-content--planner">
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
        <PlannerMobileFilterBar
          ref={mobileFilterBarRef}
          chips={mobileFilterChips}
          expanded={mobileFiltersExpanded}
          onToggle={handleMobileFilterToggle}
          controlsId="planner-filter-controls"
        />

        <div
          id="planner-filter-controls"
          ref={filterControlsRef}
          className={`planner-filter-controls${
            mobileFiltersExpanded ? '' : ' is-collapsed-mobile'
          }`}
        >
        <div className="planner-filters planner-filters--primary">
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
                  {formatPlannerDateLabel(date)}
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
              showBulkActions
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

          <PlannerTimePicker
            id="planner-start-after"
            label="Start after (optional)"
            value={startAfter}
            onChange={(value) => updateUrlFilters({ startAfter: value })}
          />

          <PlannerTimePicker
            id="planner-finish-by"
            label="Finish by (optional)"
            value={finishBy}
            onChange={(value) => updateUrlFilters({ finishBy: value })}
          />
        </div>

        <div className="planner-filters planner-filters--films">
          <div className="filter-group filter-group--film-picker">
            <span className="filter-group-label" id="planner-include-label">
              Required movies
            </span>
            <FilmMultiSelect
              id="planner-include"
              label="Select required movies"
              films={filmCatalog}
              selected={includeFilms}
              setSelected={(value) => updateUrlFilters({ includeFilms: value })}
              hint="Every selected movie must appear in the plan."
            />
          </div>

          <div className="filter-group filter-group--film-picker">
            <span className="filter-group-label" id="planner-preferred-label">
              Preferred films
            </span>
            <FilmMultiSelect
              id="planner-preferred"
              label="Select preferred films"
              films={filmCatalog}
              selected={preferredFilms}
              setSelected={(value) => updateUrlFilters({ preferredFilms: value })}
              hint="Plans should include at least one of these movies."
            />
          </div>

          <div className="filter-group filter-group--film-picker">
            <span className="filter-group-label" id="planner-exclude-label">
              Excluded movies
            </span>
            <FilmMultiSelect
              id="planner-exclude"
              label="Select excluded movies"
              films={filmCatalog}
              selected={excludeFilms}
              setSelected={(value) => updateUrlFilters({ excludeFilms: value })}
              hint="Plans will not include any of these movies."
            />
          </div>
        </div>

        {filmValidationItems.length > 0 ? (
          <PlannerFilmValidation items={filmValidationItems} />
        ) : null}

        <div className="planner-advanced-section">
          <button
            type="button"
            className="planner-advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => updateUrlFilters({ advancedOpen: !advancedOpen })}
          >
            More options
            <span className="planner-advanced-toggle-icon">{advancedOpen ? '▾' : '▸'}</span>
          </button>

          {advancedOpen ? (
            <div className="planner-advanced-panel planner-filters">
              <FilmSingleSelect
                id="planner-first"
                label="Preferred first movie"
                films={filmCatalog}
                value={firstFilm}
                onChange={(value) => updateUrlFilters({ firstFilm: value })}
                disabledKeys={lastFilm ? [lastFilm] : []}
                placeholder="Any first film"
              />

              <FilmSingleSelect
                id="planner-last"
                label="Preferred last movie"
                films={filmCatalog}
                value={lastFilm}
                onChange={(value) => updateUrlFilters({ lastFilm: value })}
                disabledKeys={firstFilm ? [firstFilm] : []}
                placeholder="Any last film"
              />

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

        {shouldShowPreview(plannerState) ? (
          <PlannerConstraintPreview
            filters={plannerState}
            filmCatalog={filmCatalog}
            showtimeRows={rows}
          />
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

      <div className="planner-results" ref={plannerResultsRef}>
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
            <p className="planner-empty-suggestion">
              {unmatchedFilmSuggestion || getPlannerEmptyStateSuggestion()}
            </p>
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
