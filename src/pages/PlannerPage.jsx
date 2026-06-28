import { useMemo, useState } from 'react';
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
} from '../utils/plannerDisplay.js';

export default function PlannerPage() {
  const { rows, loading, error } = useShowtimesData();
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTheaters, setSelectedTheaters] = useState([]);
  const [filmCount, setFilmCount] = useState(2);
  const [startAfter, setStartAfter] = useState('');
  const [finishBy, setFinishBy] = useState('');
  const [results, setResults] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchRun, setHasSearchRun] = useState(false);

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

  const effectiveDate = selectedDate || dates[0] || '';

  const findPlans = () => {
    if (!effectiveDate) return;

    setHasSearchRun(true);
    setIsSearching(true);

    setTimeout(() => {
      const filters = buildPlannerSearchFilters({
        date: effectiveDate,
        theaters: selectedTheaters,
        filmCount,
        startAfter,
        finishBy,
      });

      const { schedules, meta } = findSchedules({ rows, filters });
      setResults(schedules);
      setSearchMeta(meta);
      setIsSearching(false);
    }, 0);
  };

  if (loading) {
    return <div>Loading...</div>;
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
              onChange={(e) => setSelectedDate(e.target.value)}
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
              setSelected={setSelectedTheaters}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="planner-film-count">Number of movies</label>
            <select
              id="planner-film-count"
              value={filmCount}
              onChange={(e) => {
                const next = e.target.value;
                setFilmCount(next === 'max' ? 'max' : Number(next));
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
              onChange={(e) => setStartAfter(e.target.value)}
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
              onChange={(e) => setFinishBy(e.target.value)}
              className="filter-input"
            />
          </div>
        </div>

        <div className="search-button-container">
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
        </div>
      </div>

      <div className="double-feature-results planner-results">
        {results.length > 0 && (
          <h2 className="double-feature-results-heading">
            {formatPlannerResultsHeading(results.length, filmCount)}
            {searchMeta?.truncated ? ' (showing first results)' : ''}
          </h2>
        )}

        {isSearching ? (
          <div className="search-loading">
            <span className="loading-spinner-large"></span>
            <div className="search-loading-text">Searching for movie plans...</div>
          </div>
        ) : hasSearchRun && results.length === 0 ? (
          <div className="double-feature-empty-state">
            No movie plans found matching your criteria. Try adjusting your filters and click
            &quot;Find plans&quot; again.
          </div>
        ) : !hasSearchRun ? (
          <div className="planner-prompt">
            Select filters above and click &quot;Find plans&quot; to generate schedules.
          </div>
        ) : (
          <div className="double-feature-list planner-result-list">
            {results.map((schedule, index) => (
              <PlannerResultCard
                key={`${schedule.theater_id || schedule.theater}-${schedule.movies.map((m) => `${m.showtime_film_key}@${m.time}`).join('|')}-${schedule.startMin}-${index}`}
                schedule={schedule}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
