/**
 * Special Presentations full-list destination — Home shelf-detail consumer.
 *
 * Owns presentation, sort, and theater/presentation-type filters.
 * Shared chrome/list/card live in `homeShelfDetail/`.
 * No category pills — taxonomy is used for labels/filters, not pill rows.
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
import { buildLiveSpecialPresentationsPresentation } from './buildLiveSpecialPresentationsPresentation.js';
import {
  SPECIAL_PRESENTATIONS_SORT_OPTIONS,
  buildSpecialPresentationsFilterOptions,
  countActiveSpecialPresentationsFilters,
  filterSpecialPresentationFilms,
  resolveSpecialPresentationsSortOption,
  sortSpecialPresentationFilms,
} from './specialPresentationsListControls.js';

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
export default function SpecialPresentationsSurface({
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onOpenShowtimes,
  onOpenShowtimesBrowse,
}) {
  const basePresentation = buildLiveSpecialPresentationsPresentation(
    homeData,
    enrichmentIndex,
  );
  const storage = getBrowserStorage();
  const sortMenuId = useId();
  const filterMenuId = useId();
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);
  const [actionRevision, setActionRevision] = useState(0);
  const [sortId, setSortId] = useState('soonest-presentation');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    theaterId: null,
    presentationCanonicalId: null,
  });

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

  const sortOption = resolveSpecialPresentationsSortOption(sortId);
  const activeFilterCount = countActiveSpecialPresentationsFilters(filters);

  const visibleFilms = useMemo(() => {
    const filtered = filterSpecialPresentationFilms(
      basePresentation.films,
      filters,
    );
    return sortSpecialPresentationFilms(filtered, sortId);
  }, [basePresentation.films, filters, sortId]);

  const filterOptions = useMemo(
    () => buildSpecialPresentationsFilterOptions(basePresentation.films),
    [basePresentation.films],
  );

  const showFilters =
    filterOptions.theaters.length > 0 ||
    filterOptions.presentationTypes.length > 0;

  const clearFilters = () => {
    setFilters({ theaterId: null, presentationCanonicalId: null });
  };

  const isUnavailable = basePresentation.source === 'live-unavailable';
  const isEmpty = basePresentation.source === 'live-empty';
  const showControls =
    !isUnavailable && !isEmpty && basePresentation.films.length > 0;

  const visibleSections = useMemo(
    () =>
      visibleFilms.length > 0
        ? [
            {
              id: 'special-presentations',
              label: 'Special Presentations',
              films: visibleFilms,
            },
          ]
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
            aria-label="Sort Special Presentations"
          >
            {SPECIAL_PRESENTATIONS_SORT_OPTIONS.map((option) => (
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

      {showFilters ? (
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
              aria-label="Filter Special Presentations"
            >
              {filterOptions.presentationTypes.length > 0 ? (
                <fieldset className="v2-shelf-detail-filter-group">
                  <legend>Presentation</legend>
                  <button
                    type="button"
                    className={
                      !filters.presentationCanonicalId
                        ? 'v2-shelf-detail-menu-item is-active'
                        : 'v2-shelf-detail-menu-item'
                    }
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        presentationCanonicalId: null,
                      }))
                    }
                  >
                    All presentations
                  </button>
                  {filterOptions.presentationTypes.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={
                        filters.presentationCanonicalId === option.id
                          ? 'v2-shelf-detail-menu-item is-active'
                          : 'v2-shelf-detail-menu-item'
                      }
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          presentationCanonicalId: option.id,
                        }))
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </fieldset>
              ) : null}
              {filterOptions.theaters.length > 0 ? (
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
                      setFilters((current) => ({
                        ...current,
                        theaterId: null,
                      }))
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
              ) : null}
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
      titleId="v2-special-presentations-page-title"
      source={basePresentation.source}
      rootProps={{
        'data-special-presentations-source': basePresentation.source,
      }}
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
          ? 'No Special Presentations match these filters.'
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
          expandIdPrefix="v2-special-presentations-expand"
        />
      )}
    />
  );
}
