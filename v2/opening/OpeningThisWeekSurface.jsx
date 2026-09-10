/**
 * Opening This Week — verified artifact-backed dedicated surface.
 *
 * Owns OTW-specific presentation, category/sort/filter state, and filter menus.
 * Shared chrome/list/card live in `homeShelfDetail/` (canonical Home shelf-detail).
 */

import { useId, useMemo, useState } from 'react';
import { IconSliders } from '../icons.jsx';
import HomeShelfDetailFilmCard from '../homeShelfDetail/HomeShelfDetailFilmCard.jsx';
import HomeShelfDetailSurface from '../homeShelfDetail/HomeShelfDetailSurface.jsx';
import { useBodyScrollLock } from '../homeShelfDetail/useBodyScrollLock.js';
import { resolveOpeningThisWeekPresentation } from '../fixtures/openingThisWeekMockupFixture.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import {
  isFilmSaved,
  toggleSavedFilm,
} from '../stores/savedFilmsStore.js';
import {
  isFilmNotInterested,
  toggleFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';
import {
  buildLiveOpeningThisWeekPresentation,
  buildOpeningSections,
  filterOpeningFilmsByCategory,
} from './buildLiveOpeningPresentation.js';
import {
  OPENING_SORT_OPTIONS,
  buildOpeningFilterOptions,
  countActiveOpeningFilters,
  filterOpeningFilms,
  resolveOpeningSortOption,
  sortOpeningFilms,
} from './openingListControls.js';

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
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function OpeningThisWeekSurface({
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onOpenShowtimes,
  onOpenShowtimesBrowse,
  onStubAction,
}) {
  const basePresentation = homeData
    ? buildLiveOpeningThisWeekPresentation(homeData, enrichmentIndex)
    : resolveOpeningThisWeekPresentation();
  const storage = getBrowserStorage();
  const sortMenuId = useId();
  const filterMenuId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);
  const [actionRevision, setActionRevision] = useState(0);
  const [sortId, setSortId] = useState('opening-date');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('all');
  const [filters, setFilters] = useState({
    theaterId: null,
    formatLabel: null,
    openingDate: null,
  });

  useBodyScrollLock(sortOpen || filtersOpen);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available in this Stage 1 Opening shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

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

  const sortOption = resolveOpeningSortOption(sortId);
  const activeFilterCount = countActiveOpeningFilters(filters);

  const visibleFilms = useMemo(() => {
    const byCategory = filterOpeningFilmsByCategory(
      basePresentation.films,
      categoryId,
    );
    const filtered = filterOpeningFilms(byCategory, filters);
    return sortOpeningFilms(filtered, sortId);
  }, [basePresentation.films, categoryId, filters, sortId]);

  const visibleSections = useMemo(
    () => buildOpeningSections(visibleFilms, categoryId),
    [visibleFilms, categoryId],
  );

  const filterOptions = useMemo(
    () => buildOpeningFilterOptions(basePresentation.films),
    [basePresentation.films],
  );

  const clearFilters = () => {
    setFilters({ theaterId: null, formatLabel: null, openingDate: null });
  };

  const isUnavailable = basePresentation.source === 'live-unavailable';
  const isEmpty = basePresentation.source === 'live-empty';
  const showControls =
    !isUnavailable && !isEmpty && basePresentation.films.length > 0;

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
            aria-label="Sort Opening This Week"
          >
            {OPENING_SORT_OPTIONS.map((option) => (
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
            aria-label="Filter Opening This Week"
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
            <fieldset className="v2-shelf-detail-filter-group">
              <legend>Format</legend>
              <button
                type="button"
                className={
                  !filters.formatLabel
                    ? 'v2-shelf-detail-menu-item is-active'
                    : 'v2-shelf-detail-menu-item'
                }
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    formatLabel: null,
                  }))
                }
              >
                All formats
              </button>
              {filterOptions.formats.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    filters.formatLabel === option.id
                      ? 'v2-shelf-detail-menu-item is-active'
                      : 'v2-shelf-detail-menu-item'
                  }
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      formatLabel: option.id,
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
            <fieldset className="v2-shelf-detail-filter-group">
              <legend>Opening day</legend>
              <button
                type="button"
                className={
                  !filters.openingDate
                    ? 'v2-shelf-detail-menu-item is-active'
                    : 'v2-shelf-detail-menu-item'
                }
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    openingDate: null,
                  }))
                }
              >
                Any day
              </button>
              {filterOptions.dates.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    filters.openingDate === option.id
                      ? 'v2-shelf-detail-menu-item is-active'
                      : 'v2-shelf-detail-menu-item'
                  }
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      openingDate: option.id,
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
    </>
  ) : null;

  return (
    <HomeShelfDetailSurface
      title={basePresentation.pageTitle}
      titleId="v2-shelf-detail-page-title"
      source={basePresentation.source}
      rootProps={{ 'data-opening-source': basePresentation.source }}
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
      categoryChips={
        showControls && basePresentation.showCategoryChips
          ? basePresentation.categoryChips
          : null
      }
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      categoryAriaLabel="Opening categories"
      controls={controls}
      filteredEmptyMessage={
        showControls && visibleFilms.length === 0
          ? 'No Opening This Week films match these filters.'
          : null
      }
      sections={visibleSections}
      showSectionTitles={categoryId === 'all'}
      showFilmList={showControls && visibleFilms.length > 0}
      expandedFilmKey={expandedFilmKey}
      onToggleExpand={toggleExpand}
      stubMessage={stubMessage}
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
          onStubAction={announceStub}
          expandIdPrefix="v2-opening-expand"
        />
      )}
    />
  );
}
