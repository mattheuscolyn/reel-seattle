import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CollapsibleMovieCard from '../components/CollapsibleMovieCard.jsx';
import DropdownMultiSelect from '../components/DropdownMultiSelect.jsx';
import CurrentWindowSummary from '../components/CurrentWindowSummary.jsx';
import PipelineStatus from '../components/PipelineStatus.jsx';
import RecentlyAddedSection from '../components/RecentlyAddedSection.jsx';
import SortDropdown from '../components/SortDropdown.jsx';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { copyTextToClipboard, getShareUrlFromLocation } from '../utils/shareLinkUtils.js';
import {
  buildShowtimesPageResults,
  buildShowtimesFilterOptions,
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

  useEffect(() => {
    function setStickyHeaderTop() {
      const mainHeader = document.querySelector('.main-header');
      const stickyControls = document.querySelector('.sticky-controls');
      if (mainHeader && stickyControls) {
        const offset = mainHeader.offsetHeight + stickyControls.offsetHeight - 8;
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

    <>

      <h1 className="main-header">Showtimes</h1>

      <CurrentWindowSummary />

      <PipelineStatus />

      <RecentlyAddedSection />

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

      <div className="sticky-controls">

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
          <button
            type="button"
            className="showtimes-copy-view"
            onClick={handleCopyCurrentView}
          >
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

      {loading ? (

        <div>Loading showtimes...</div>

      ) : error ? (

        <div>{error}</div>

      ) : rows.length === 0 ? (

        <div>No showtimes are available right now.</div>

      ) : (

        <div className="movie-list">

          {sortedMovies.length === 0 && (

            <div>No movies match your current filters.</div>

          )}

          {sortedMovies.map((movie, idx) => (

            <CollapsibleMovieCard

              key={movie.film + idx}

              movie={movie}

              selectedDates={selectedDates}

              selectedTheaters={selectedTheaters}

            />

          ))}

        </div>

      )}

    </>

  );

}

