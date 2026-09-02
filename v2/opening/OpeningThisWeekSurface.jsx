/**
 * Opening This Week — verified artifact-backed dedicated surface (Milestone A).
 *
 * Live path uses homeData.openingThisWeek (not newlyAdded).
 * Mockup fixture path for visual QC when homeData is absent.
 */

import { useId, useMemo, useState } from 'react';
import {
  IconBookmark,
  IconCalendar,
  IconChevron,
  IconClock,
  IconEyeOff,
  IconPin,
  IconSliders,
  IconStar,
} from '../icons.jsx';
import TmdbAttribution from '../enrichment/TmdbAttribution.jsx';
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
 * @param {object} film
 */
function OpeningFilmCard({
  film,
  expanded,
  onToggleExpand,
  onOpenFilmDetail,
  onOpenShowtimes,
  filmActionState,
  onToggleSave,
  onToggleNotInterested,
  onStubAction,
}) {
  const panelId = `v2-opening-expand-${film.filmKey}`;

  return (
    <article
      className={
        expanded
          ? 'v2-opening-card v2-opening-card-expanded'
          : film.noCurrentShowtimes
            ? 'v2-opening-card v2-opening-card-muted'
            : 'v2-opening-card'
      }
    >
      <button
        type="button"
        className="v2-opening-card-main"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggleExpand(film.filmKey)}
      >
        <span className="v2-opening-card-poster">
          {film.posterUrl ? (
            <img src={film.posterUrl} alt="" draggable="false" />
          ) : (
            <span className="v2-shelf-poster-fallback" aria-hidden="true" />
          )}
        </span>
        <span className="v2-opening-card-copy">
          {film.badge ? (
            <span className="v2-opening-card-badge">{film.badge}</span>
          ) : null}
          <span className="v2-opening-card-title">{film.title}</span>
          {film.metaLine ? (
            <span className="v2-opening-card-meta">{film.metaLine}</span>
          ) : null}
          {film.synopsis ? (
            <span className="v2-opening-card-synopsis">{film.synopsis}</span>
          ) : null}
          <span className="v2-opening-card-showing">
            {film.dateLabel ? (
              <span className="v2-opening-card-fact">
                <IconCalendar width={12} height={12} aria-hidden="true" />
                {film.dateLabel}
              </span>
            ) : null}
            {film.availabilityLabel ? (
              <span className="v2-opening-card-availability">
                {film.availabilityLabel}
              </span>
            ) : null}
            {film.theaterName ? (
              <span className="v2-opening-card-fact">
                <IconPin width={12} height={12} aria-hidden="true" />
                {film.theaterName}
              </span>
            ) : null}
            {expanded && film.timeLabel ? (
              <span className="v2-opening-card-fact">
                <IconClock aria-hidden="true" />
                {film.timeLabel}
              </span>
            ) : null}
            {film.formatLabel ? (
              <span className="v2-opening-card-format">{film.formatLabel}</span>
            ) : null}
          </span>
        </span>
        <span className="v2-opening-card-chevron" aria-hidden="true">
          {expanded ? '⌃' : <IconChevron />}
        </span>
      </button>

      {expanded ? (
        <div
          id={panelId}
          className="v2-opening-card-expand"
          role="region"
          aria-label={`Quick details for ${film.title}`}
        >
          {(film.whySeeIt || film.alsoPlaying) && (
            <div className="v2-opening-card-panels">
              {film.whySeeIt ? (
                <div className="v2-opening-card-panel">
                  <p className="v2-opening-card-panel-label">Why see it</p>
                  <p className="v2-opening-card-why">
                    <IconStar width={14} height={14} aria-hidden="true" />
                    <span>{film.whySeeIt}</span>
                  </p>
                </div>
              ) : null}
              {film.alsoPlaying ? (
                <div className="v2-opening-card-panel">
                  <p className="v2-opening-card-panel-label">Also playing at</p>
                  <button
                    type="button"
                    className="v2-opening-card-also"
                    onClick={() =>
                      onStubAction(
                        `also-${film.filmKey}`,
                        film.alsoPlaying.theaterName,
                      )
                    }
                  >
                    <span className="v2-opening-card-also-copy">
                      <span className="v2-opening-card-also-theater">
                        {film.alsoPlaying.theaterName}
                      </span>
                      <span className="v2-opening-card-also-detail">
                        {film.alsoPlaying.detailLabel}
                      </span>
                    </span>
                    <IconChevron aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <div className="v2-opening-card-actions">
            {(() => {
              const { filmRef, saved, notInterested } = filmActionState(film);
              const canAct = Boolean(filmRef);
              return (
                <>
                  <button
                    type="button"
                    className={
                      saved
                        ? 'v2-opening-card-action is-active'
                        : 'v2-opening-card-action'
                    }
                    aria-pressed={saved}
                    disabled={!canAct}
                    onClick={() => onToggleSave(film)}
                  >
                    <IconBookmark width={16} height={16} aria-hidden="true" />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className={
                      notInterested
                        ? 'v2-opening-card-action is-active'
                        : 'v2-opening-card-action'
                    }
                    aria-pressed={notInterested}
                    disabled={!canAct}
                    onClick={() => onToggleNotInterested(film)}
                  >
                    <IconEyeOff width={16} height={16} aria-hidden="true" />
                    Not interested
                  </button>
                </>
              );
            })()}
            {film.hasUpcomingShowtimes ? (
              <button
                type="button"
                className="v2-opening-card-more"
                onClick={() =>
                  onOpenShowtimes?.({
                    filmKey: film.filmKey,
                    theaterId: film.theaterId ?? null,
                    opportunityKey: film.opportunityKey ?? null,
                  })
                }
              >
                Showtimes
                <IconChevron aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="v2-opening-card-more"
              onClick={() =>
                onOpenFilmDetail?.({
                  filmKey: film.filmKey,
                  opportunityKey: film.opportunityKey ?? null,
                })
              }
            >
              More details
              <IconChevron aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onOpenShowtimes?: (payload: { filmKey: string, theaterId?: string | null, opportunityKey?: string | null }) => void,
 *   onOpenShowtimesBrowse?: () => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function OpeningThisWeekSurface({
  onBack,
  backLabel = 'Home',
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
  const stubStatusId = useId();
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
  const showControls = !isUnavailable && !isEmpty && basePresentation.films.length > 0;

  return (
    <section
      className="v2-opening-page"
      aria-labelledby="v2-opening-page-title"
      data-opening-source={basePresentation.source}
    >
      <button
        type="button"
        className="v2-opening-page-back"
        aria-label={`Back to ${backLabel}`}
        onClick={onBack}
      >
        ← {backLabel}
      </button>

      <header className="v2-opening-page-header" data-opening-section="header">
        <h1 id="v2-opening-page-title" className="v2-opening-page-title">
          {basePresentation.pageTitle}
        </h1>
        {basePresentation.pageSubtitle ? (
          <p className="v2-opening-page-subtitle">
            {basePresentation.pageSubtitle}
          </p>
        ) : null}
        {showControls ? (
          <p className="v2-opening-page-count">
            {activeFilterCount > 0
              ? `${visibleFilms.length} of ${basePresentation.totalCount ?? basePresentation.films.length} films`
              : basePresentation.countLabel}
          </p>
        ) : null}
      </header>

      {isUnavailable ? (
        <div className="v2-opening-state" role="status">
          <p className="v2-opening-state-title">
            {basePresentation.unavailableTitle}
          </p>
          {basePresentation.unavailableBody ? (
            <p className="v2-opening-state-body">
              {basePresentation.unavailableBody}
            </p>
          ) : null}
          <button
            type="button"
            className="v2-opening-state-action"
            onClick={() => onOpenShowtimesBrowse?.()}
          >
            Browse showtimes
          </button>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="v2-opening-state" role="status">
          <p className="v2-opening-state-title">{basePresentation.emptyTitle}</p>
          {basePresentation.emptyBody ? (
            <p className="v2-opening-state-body">{basePresentation.emptyBody}</p>
          ) : null}
          <button
            type="button"
            className="v2-opening-state-action"
            onClick={() => onOpenShowtimesBrowse?.()}
          >
            Browse showtimes
          </button>
        </div>
      ) : null}

      {showControls ? (
        <>
          {basePresentation.showCategoryChips ? (
            <div
              className="v2-opening-chip-row"
              role="group"
              aria-label="Opening categories"
              data-opening-section="categories"
            >
              {(basePresentation.categoryChips ?? []).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={
                    categoryId === chip.id
                      ? 'v2-search-chip v2-search-chip-active'
                      : 'v2-search-chip'
                  }
                  aria-pressed={categoryId === chip.id}
                  onClick={() => setCategoryId(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          <div
            className="v2-opening-page-controls"
            data-opening-section="controls"
          >
            <div className="v2-opening-control">
              <button
                type="button"
                className="v2-opening-page-sort"
                aria-label={`${basePresentation.sortLabel}: ${sortOption.label}`}
                aria-expanded={sortOpen}
                aria-controls={sortMenuId}
                onClick={() => {
                  setSortOpen((open) => !open);
                  setFiltersOpen(false);
                }}
              >
                <span className="v2-opening-page-sort-label">
                  {basePresentation.sortLabel}
                </span>
                <span className="v2-opening-page-sort-value">
                  {sortOption.label}
                  <span aria-hidden="true"> ▾</span>
                </span>
              </button>
              {sortOpen ? (
                <ul
                  id={sortMenuId}
                  className="v2-opening-menu"
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
                            ? 'v2-opening-menu-item is-active'
                            : 'v2-opening-menu-item'
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

            <div className="v2-opening-control">
              <button
                type="button"
                className={
                  activeFilterCount > 0
                    ? 'v2-opening-page-filters is-active'
                    : 'v2-opening-page-filters'
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
                  className="v2-opening-menu v2-opening-menu-filters"
                  role="dialog"
                  aria-label="Filter Opening This Week"
                >
                  <fieldset className="v2-opening-filter-group">
                    <legend>Theater</legend>
                    <button
                      type="button"
                      className={
                        !filters.theaterId
                          ? 'v2-opening-menu-item is-active'
                          : 'v2-opening-menu-item'
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
                            ? 'v2-opening-menu-item is-active'
                            : 'v2-opening-menu-item'
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
                  <fieldset className="v2-opening-filter-group">
                    <legend>Format</legend>
                    <button
                      type="button"
                      className={
                        !filters.formatLabel
                          ? 'v2-opening-menu-item is-active'
                          : 'v2-opening-menu-item'
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
                            ? 'v2-opening-menu-item is-active'
                            : 'v2-opening-menu-item'
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
                  <fieldset className="v2-opening-filter-group">
                    <legend>Opening day</legend>
                    <button
                      type="button"
                      className={
                        !filters.openingDate
                          ? 'v2-opening-menu-item is-active'
                          : 'v2-opening-menu-item'
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
                            ? 'v2-opening-menu-item is-active'
                            : 'v2-opening-menu-item'
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
                  <div className="v2-opening-filter-actions">
                    <button
                      type="button"
                      className="v2-opening-menu-item"
                      onClick={clearFilters}
                      disabled={activeFilterCount === 0}
                    >
                      Clear filters
                    </button>
                    <button
                      type="button"
                      className="v2-opening-menu-item is-active"
                      onClick={() => setFiltersOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {showControls && visibleFilms.length === 0 ? (
        <p className="v2-opening-empty" role="status">
          No Opening This Week films match these filters.
        </p>
      ) : null}

      {showControls && visibleFilms.length > 0 ? (
        <div data-opening-section="filmList">
          {visibleSections.map((section) => (
            <section
              key={section.id}
              className="v2-opening-section"
              aria-label={section.label}
            >
              {categoryId === 'all' ? (
                <h2 className="v2-opening-section-title">{section.label}</h2>
              ) : null}
              <ul className="v2-opening-page-list" role="list">
                {section.films.map((film) => (
                  <li key={film.filmKey}>
                    <OpeningFilmCard
                      film={film}
                      expanded={expandedFilmKey === film.filmKey}
                      onToggleExpand={toggleExpand}
                      onOpenFilmDetail={onOpenFilmDetail}
                      onOpenShowtimes={onOpenShowtimes}
                      filmActionState={filmActionState}
                      onToggleSave={handleToggleSave}
                      onToggleNotInterested={handleToggleNotInterested}
                      onStubAction={announceStub}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      <p
        id={stubStatusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {stubMessage ?? ''}
      </p>

      <TmdbAttribution compact />
    </section>
  );
}
