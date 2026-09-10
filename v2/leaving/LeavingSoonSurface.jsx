/**
 * Leaving Soon full-list destination — Home shelf-detail consumer.
 *
 * Owns Leaving Soon presentation, sort/filter state, and theater filter menus.
 * Shared chrome/list/card live in `homeShelfDetail/`.
 */

import { useId, useMemo, useState } from 'react';
import { IconSliders } from '../icons.jsx';
import HomeShelfDetailFilmCard from '../homeShelfDetail/HomeShelfDetailFilmCard.jsx';
import HomeShelfDetailSurface from '../homeShelfDetail/HomeShelfDetailSurface.jsx';
import { useBodyScrollLock } from '../homeShelfDetail/useBodyScrollLock.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import {
  isFilmSaved,
  toggleSavedFilm,
} from '../stores/savedFilmsStore.js';
import {
  isFilmNotInterested,
  toggleFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';
import { buildLiveLeavingSoonPresentation } from './buildLiveLeavingSoonPresentation.js';
import {
  LEAVING_SORT_OPTIONS,
  buildLeavingFilterOptions,
  countActiveLeavingFilters,
  filterLeavingFilms,
  resolveLeavingSortOption,
  sortLeavingFilms,
} from './leavingListControls.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onOpenShowtimes?: (payload: { filmKey: string, theaterId?: string | null, opportunityKey?: string | null }) => void,
 *   onOpenShowtimesBrowse?: () => void,
 * }} props
 */
export default function LeavingSoonSurface({
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onOpenShowtimes,
  onOpenShowtimesBrowse,
}) {
  const basePresentation = buildLiveLeavingSoonPresentation(
    homeData,
    enrichmentIndex,
  );
  const storage = getBrowserStorage();
  const sortMenuId = useId();
  const filterMenuId = useId();
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);
  const [actionRevision, setActionRevision] = useState(0);
  const [sortId, setSortId] = useState('leaving-soonest');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ theaterId: null });

  useBodyScrollLock(sortOpen || filtersOpen);

  const toggleExpand = (filmKey) => {
    setExpandedFilmKey((current) => (current === filmKey ? null : filmKey));
  };

  const filmActionState = (film) => {
    void actionRevision;
    const filmRef = filmRefFromHomeFilm(film);
    return {
      filmRef,
      saved: filmRef ? isFilmSaved(storage, filmRef) : false,
      notInterested: filmRef ? isFilmNotInterested(storage, filmRef) : false,
    };
  };

  const handleToggleSave = (film) => {
    const { filmRef } = filmActionState(film);
    if (!filmRef) return;
    toggleSavedFilm(storage, filmRef, {
      title: film.title,
      posterUrl: film.posterUrl,
    });
    setActionRevision((n) => n + 1);
  };

  const handleToggleNotInterested = (film) => {
    const { filmRef } = filmActionState(film);
    if (!filmRef) return;
    toggleFilmNotInterested(storage, filmRef, {
      title: film.title,
      posterUrl: film.posterUrl,
    });
    setActionRevision((n) => n + 1);
  };

  const sortOption = resolveLeavingSortOption(sortId);
  const activeFilterCount = countActiveLeavingFilters(filters);

  const visibleFilms = useMemo(() => {
    const filtered = filterLeavingFilms(basePresentation.films, filters);
    return sortLeavingFilms(filtered, sortId);
  }, [basePresentation.films, filters, sortId]);

  const filterOptions = useMemo(
    () => buildLeavingFilterOptions(basePresentation.films),
    [basePresentation.films],
  );

  const showTheaterFilter = filterOptions.theaters.length > 0;

  const clearFilters = () => {
    setFilters({ theaterId: null });
  };

  const isUnavailable = basePresentation.source === 'live-unavailable';
  const isEmpty = basePresentation.source === 'live-empty';
  const showControls =
    !isUnavailable && !isEmpty && basePresentation.films.length > 0;

  const visibleSections = useMemo(
    () =>
      visibleFilms.length > 0
        ? [{ id: 'leaving-soon', label: 'Leaving Soon', films: visibleFilms }]
        : [],
    [visibleFilms],
  );

  const controls = showControls ? (
    <>
      <div className="v2-shelf-detail-control">
        <button
          type="button"
          className="v2-shelf-detail-page-sort"
          aria-label={`${basePresentation.sortLabel}: ${sortOption.label}`}
          aria-expanded={sortOpen}
          aria-controls={sortMenuId}
          onClick={() => {
            setSortOpen((open) => !open);
            setFiltersOpen(false);
          }}
        >
          <span className="v2-shelf-detail-page-sort-label">
            {basePresentation.sortLabel}
          </span>
          <span className="v2-shelf-detail-page-sort-value">
            {sortOption.label}
            <span aria-hidden="true"> ▾</span>
          </span>
        </button>
        {sortOpen ? (
          <ul
            id={sortMenuId}
            className="v2-shelf-detail-menu"
            role="listbox"
            aria-label="Sort Leaving Soon"
          >
            {LEAVING_SORT_OPTIONS.map((option) => (
              <li key={option.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === sortId}
                  className={
                    option.id === sortId
                      ? 'v2-shelf-detail-menu-item is-active'
                      : 'v2-shelf-detail-menu-item'
                  }
                  onClick={() => {
                    setSortId(option.id);
                    setSortOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {showTheaterFilter ? (
        <div className="v2-shelf-detail-control">
          <button
            type="button"
            className={
              activeFilterCount > 0
                ? 'v2-shelf-detail-page-filters is-active'
                : 'v2-shelf-detail-page-filters'
            }
            aria-expanded={filtersOpen}
            aria-controls={filterMenuId}
            onClick={() => {
              setFiltersOpen((open) => !open);
              setSortOpen(false);
            }}
          >
            <IconSliders aria-hidden="true" />
            {activeFilterCount > 0
              ? `${basePresentation.filtersLabel} (${activeFilterCount})`
              : basePresentation.filtersLabel}
          </button>
          {filtersOpen ? (
            <div
              id={filterMenuId}
              className="v2-shelf-detail-menu v2-shelf-detail-menu-filters"
              role="dialog"
              aria-label="Filter Leaving Soon"
            >
              <fieldset className="v2-shelf-detail-filter-group">
                <legend>Theater</legend>
                <button
                  type="button"
                  className={
                    !filters.theaterId
                      ? 'v2-shelf-detail-menu-item is-active'
                      : 'v2-shelf-detail-menu-item'
                  }
                  onClick={() =>
                    setFilters((current) => ({ ...current, theaterId: null }))
                  }
                >
                  All theaters
                </button>
                {filterOptions.theaters.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      filters.theaterId === option.id
                        ? 'v2-shelf-detail-menu-item is-active'
                        : 'v2-shelf-detail-menu-item'
                    }
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        theaterId: option.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
              <div className="v2-shelf-detail-filter-actions">
                <button
                  type="button"
                  className="v2-shelf-detail-menu-item"
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                >
                  Clear filters
                </button>
                <button
                  type="button"
                  className="v2-shelf-detail-menu-item is-active"
                  onClick={() => setFiltersOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <HomeShelfDetailSurface
      title={basePresentation.pageTitle}
      titleId="v2-leaving-page-title"
      source={basePresentation.source}
      rootProps={{ 'data-leaving-source': basePresentation.source }}
      resultCountLabel={
        showControls && activeFilterCount > 0
          ? `${visibleFilms.length} of ${basePresentation.totalCount ?? basePresentation.films.length} films`
          : null
      }
      unavailable={
        isUnavailable
          ? {
              title: basePresentation.unavailableTitle,
              body: basePresentation.unavailableBody,
              actionLabel: 'Browse showtimes',
              onAction: () => onOpenShowtimesBrowse?.(),
            }
          : null
      }
      empty={
        isEmpty
          ? {
              title: basePresentation.emptyTitle,
              body: basePresentation.emptyBody,
              actionLabel: 'Browse showtimes',
              onAction: () => onOpenShowtimesBrowse?.(),
            }
          : null
      }
      categoryChips={null}
      controls={controls}
      filteredEmptyMessage={
        showControls && visibleFilms.length === 0
          ? 'No Leaving Soon films match these filters.'
          : null
      }
      sections={visibleSections}
      showSectionTitles={false}
      showFilmList={showControls && visibleFilms.length > 0}
      expandedFilmKey={expandedFilmKey}
      onToggleExpand={toggleExpand}
      renderFilmCard={(film, { expanded }) => (
        <HomeShelfDetailFilmCard
          film={film}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onOpenFilmDetail={onOpenFilmDetail}
          onOpenShowtimes={onOpenShowtimes}
          filmActionState={filmActionState}
          onToggleSave={handleToggleSave}
          onToggleNotInterested={handleToggleNotInterested}
          expandIdPrefix="v2-leaving-expand"
        />
      )}
    />
  );
}
