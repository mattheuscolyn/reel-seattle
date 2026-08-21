/**
 * Opening This Week — live HomeData + enrichment when available (T-ENR-10),
 * otherwise Stage 1 mockup fixture for visual QC.
 *
 * Expand / More details / Sort / Filters are real.
 * Save and Not interested remain Stage 1 stubs.
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
import { buildLiveOpeningThisWeekPresentation } from './buildLiveOpeningPresentation.js';
import {
  OPENING_SORT_OPTIONS,
  buildOpeningFilterOptions,
  countActiveOpeningFilters,
  filterOpeningFilms,
  resolveOpeningSortOption,
  sortOpeningFilms,
} from './openingListControls.js';

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function OpeningThisWeekSurface({
  onBack,
  backLabel = 'Home',
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onStubAction,
}) {
  const presentation = homeData
    ? buildLiveOpeningThisWeekPresentation(homeData, enrichmentIndex)
    : resolveOpeningThisWeekPresentation();
  const stubStatusId = useId();
  const sortMenuId = useId();
  const filterMenuId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);
  const [sortId, setSortId] = useState('opening-date');
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const sortOption = resolveOpeningSortOption(sortId);
  const filterOptions = useMemo(
    () => buildOpeningFilterOptions(presentation.films),
    [presentation.films],
  );
  const activeFilterCount = countActiveOpeningFilters(filters);
  const visibleFilms = useMemo(() => {
    const filtered = filterOpeningFilms(presentation.films, filters);
    return sortOpeningFilms(filtered, sortId);
  }, [presentation.films, filters, sortId]);

  const clearFilters = () => {
    setFilters({ theaterId: null, formatLabel: null, openingDate: null });
  };

  return (
    <section
      className="v2-opening-page"
      aria-labelledby="v2-opening-page-title"
      data-opening-source={presentation.source}
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
          {presentation.pageTitle}
        </h1>
        <p className="v2-opening-page-count">
          {activeFilterCount > 0
            ? `${visibleFilms.length} of ${presentation.films.length} films`
            : presentation.countLabel}
        </p>
      </header>

      <div
        className="v2-opening-page-controls"
        data-opening-section="controls"
      >
        <div className="v2-opening-control">
          <button
            type="button"
            className="v2-opening-page-sort"
            aria-label={`${presentation.sortLabel}: ${sortOption.label}`}
            aria-expanded={sortOpen}
            aria-controls={sortMenuId}
            onClick={() => {
              setSortOpen((open) => !open);
              setFiltersOpen(false);
            }}
          >
            <span className="v2-opening-page-sort-label">
              {presentation.sortLabel}
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
              ? `${presentation.filtersLabel} (${activeFilterCount})`
              : presentation.filtersLabel}
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

      {visibleFilms.length === 0 ? (
        <p className="v2-opening-empty" role="status">
          No Opening This Week films match these filters.
        </p>
      ) : (
        <ul
          className="v2-opening-page-list"
          data-opening-section="filmList"
          role="list"
        >
          {visibleFilms.map((film) => {
            const expanded = expandedFilmKey === film.filmKey;
            const panelId = `v2-opening-expand-${film.filmKey}`;
            return (
              <li key={film.filmKey}>
                <article
                  className={
                    expanded
                      ? 'v2-opening-card v2-opening-card-expanded'
                      : 'v2-opening-card'
                  }
                >
                  <button
                    type="button"
                    className="v2-opening-card-main"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleExpand(film.filmKey)}
                  >
                    <span className="v2-opening-card-poster">
                      {film.posterUrl ? (
                        <img src={film.posterUrl} alt="" draggable="false" />
                      ) : (
                        <span
                          className="v2-shelf-poster-fallback"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="v2-opening-card-copy">
                      {film.badge ? (
                        <span className="v2-opening-card-badge">
                          {film.badge}
                        </span>
                      ) : null}
                      <span className="v2-opening-card-title">{film.title}</span>
                      {film.metaLine ? (
                        <span className="v2-opening-card-meta">
                          {film.metaLine}
                        </span>
                      ) : null}
                      {film.synopsis ? (
                        <span className="v2-opening-card-synopsis">
                          {film.synopsis}
                        </span>
                      ) : null}
                      <span className="v2-opening-card-showing">
                        {film.dateLabel ? (
                          <span className="v2-opening-card-fact">
                            <IconCalendar
                              width={12}
                              height={12}
                              aria-hidden="true"
                            />
                            {film.dateLabel}
                          </span>
                        ) : null}
                        {film.theaterName ? (
                          <span className="v2-opening-card-fact">
                            <IconPin
                              width={12}
                              height={12}
                              aria-hidden="true"
                            />
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
                          <span className="v2-opening-card-format">
                            {film.formatLabel}
                          </span>
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
                              <p className="v2-opening-card-panel-label">
                                Why see it
                              </p>
                              <p className="v2-opening-card-why">
                                <IconStar
                                  width={14}
                                  height={14}
                                  aria-hidden="true"
                                />
                                <span>{film.whySeeIt}</span>
                              </p>
                            </div>
                          ) : null}
                          {film.alsoPlaying ? (
                            <div className="v2-opening-card-panel">
                              <p className="v2-opening-card-panel-label">
                                Also playing at
                              </p>
                              <button
                                type="button"
                                className="v2-opening-card-also"
                                onClick={() =>
                                  announceStub(
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
                        <button
                          type="button"
                          className="v2-opening-card-action"
                          onClick={() =>
                            announceStub(
                              `save-${film.filmKey}`,
                              `Save ${film.title}`,
                            )
                          }
                        >
                          <IconBookmark
                            width={16}
                            height={16}
                            aria-hidden="true"
                          />
                          Save
                        </button>
                        <button
                          type="button"
                          className="v2-opening-card-action"
                          onClick={() =>
                            announceStub(
                              `ni-${film.filmKey}`,
                              `Not interested · ${film.title}`,
                            )
                          }
                        >
                          <IconEyeOff
                            width={16}
                            height={16}
                            aria-hidden="true"
                          />
                          Not interested
                        </button>
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
              </li>
            );
          })}
        </ul>
      )}

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
