/**
 * Explore → All Movies. Compact film browse of booked future Seattle screenings.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { IconChevron, IconClose, IconSearch } from '../icons.jsx';
import TmdbAttribution from '../enrichment/TmdbAttribution.jsx';
import { MAX_SURFACE_HYDRATION_IDS } from '../enrichment/hydrateShelfFilmEnrichment.js';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import { useBodyScrollLock } from '../homeShelfDetail/useBodyScrollLock.js';
import {
  LIST_RESTORE_ATTR,
  restoreListPosition,
} from '../navigation/listPositionRestore.js';
import {
  ALL_MOVIES_AVAILABILITY_FILTERS,
  ALL_MOVIES_SORT_OPTIONS,
  DEFAULT_ALL_MOVIES_UI,
  collectAllMoviesCanonicalFilmIds,
  composeAllMoviesPresentation,
  normalizeAllMoviesUi,
} from './composeAllMoviesPresentation.js';

/**
 * @param {{
 *   row: object,
 *   onOpen: (row: object) => void,
 * }} props
 */
function AllMoviesRow({ row, onOpen }) {
  return (
    <button
      type="button"
      className={
        row.posterUrl ? 'v2-am-row v2-am-row-has-poster' : 'v2-am-row v2-am-row-text'
      }
      aria-label={[row.title, row.metaLine, row.nextWhenLabel, row.aggregateLabel]
        .filter(Boolean)
        .join('. ')}
      data-all-movies-group={row.groupId}
      data-film-id={row.filmId ?? ''}
      data-film-key={row.filmKey ?? ''}
      {...{ [LIST_RESTORE_ATTR]: row.groupId }}
      onClick={() => onOpen(row)}
    >
      <span className="v2-am-row-poster" aria-hidden="true">
        <TheaterVenueImage src={row.posterUrl} alt="" loading="lazy" />
      </span>
      <span className="v2-am-row-copy">
        <span className="v2-am-row-title">{row.title}</span>
        {row.metaLine ? (
          <span className="v2-am-row-meta">{row.metaLine}</span>
        ) : null}
        {row.nextWhenLabel ? (
          <span className="v2-am-row-when">{row.nextWhenLabel}</span>
        ) : null}
        {row.aggregateLabel ? (
          <span className="v2-am-row-more">{row.aggregateLabel}</span>
        ) : null}
      </span>
      <span className="v2-am-row-chevron" aria-hidden="true">
        <IconChevron />
      </span>
    </button>
  );
}

/**
 * @param {{
 *   homeData?: object | null,
 *   loadStatus?: string,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   ui?: { query?: string, availability?: string, sort?: string },
 *   listRestore?: object | null,
 *   onUiChange?: (ui: { query: string, availability: string, sort: string }) => void,
 *   onHydrateFilmIds?: (ids: string[]) => void | Promise<unknown>,
 *   onListRestoreConsumed?: () => void,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 * }} props
 */
export default function AllMoviesSurface({
  homeData = null,
  loadStatus = 'ready',
  enrichmentIndex = null,
  timeFormatId = '12h',
  ui = DEFAULT_ALL_MOVIES_UI,
  listRestore = null,
  onUiChange,
  onHydrateFilmIds,
  onListRestoreConsumed,
  onOpenFilmDetail,
}) {
  const searchId = useId();
  const sortMenuId = useId();
  const availabilityLabelId = useId();
  const normalized = normalizeAllMoviesUi(ui);
  const [sortOpen, setSortOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState(normalized.query);

  const presentation = useMemo(
    () =>
      composeAllMoviesPresentation(homeData, {
        loadStatus,
        query: normalized.query,
        availability: normalized.availability,
        sort: normalized.sort,
        enrichmentIndex,
        timeFormatId,
      }),
    [
      homeData,
      loadStatus,
      normalized.query,
      normalized.availability,
      normalized.sort,
      enrichmentIndex,
      timeFormatId,
    ],
  );

  useBodyScrollLock(sortOpen);

  useEffect(() => {
    setDraftQuery(normalized.query);
  }, [normalized.query]);

  useEffect(() => {
    if (typeof onHydrateFilmIds !== 'function') return;
    const ids = collectAllMoviesCanonicalFilmIds(presentation).slice(
      0,
      MAX_SURFACE_HYDRATION_IDS,
    );
    if (ids.length === 0) return;
    void onHydrateFilmIds(ids);
  }, [presentation, onHydrateFilmIds]);

  useEffect(() => {
    if (!listRestore) return undefined;
    const frame = requestAnimationFrame(() => {
      restoreListPosition(listRestore, { itemAttr: LIST_RESTORE_ATTR });
      onListRestoreConsumed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [listRestore, onListRestoreConsumed, presentation.visibleCount]);

  const commitUi = (patch) => {
    onUiChange?.(
      normalizeAllMoviesUi({
        ...normalized,
        ...patch,
      }),
    );
  };

  const commitSearch = (value) => {
    commitUi({ query: value });
  };

  const sortOption =
    ALL_MOVIES_SORT_OPTIONS.find((option) => option.id === normalized.sort) ??
    ALL_MOVIES_SORT_OPTIONS[0];

  const handleEmptyAction = (actionId) => {
    if (actionId === 'clear-search') commitUi({ query: '' });
    if (actionId === 'show-later') commitUi({ availability: 'later' });
    if (actionId === 'show-all') commitUi({ availability: 'all' });
  };

  return (
    <section
      className="v2-am-page"
      aria-labelledby="v2-am-page-title"
      data-all-movies-surface="list"
      data-all-movies-state={presentation.state}
    >
      <header className="v2-am-page-header">
        <h1 id="v2-am-page-title" className="v2-am-page-title">
          {presentation.pageTitle}
        </h1>
        <p className="v2-am-page-tagline">{presentation.pageTagline}</p>
      </header>

      <div className="v2-am-search">
        <label className="v2-visually-hidden" htmlFor={searchId}>
          Search All Movies
        </label>
        <span className="v2-am-search-icon" aria-hidden="true">
          <IconSearch width={16} height={16} />
        </span>
        <input
          id={searchId}
          className="v2-am-search-input"
          type="search"
          value={draftQuery}
          placeholder="Search titles"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => {
            const next = event.target.value;
            setDraftQuery(next);
            commitSearch(next);
          }}
        />
        {draftQuery ? (
          <button
            type="button"
            className="v2-am-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setDraftQuery('');
              commitUi({ query: '' });
            }}
          >
            <IconClose />
          </button>
        ) : null}
      </div>

      <div
        className="v2-am-availability"
        role="radiogroup"
        aria-labelledby={availabilityLabelId}
      >
        <span id={availabilityLabelId} className="v2-visually-hidden">
          Availability
        </span>
        {ALL_MOVIES_AVAILABILITY_FILTERS.map((option) => {
          const selected = option.id === normalized.availability;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={
                selected
                  ? 'v2-am-availability-btn is-selected'
                  : 'v2-am-availability-btn'
              }
              onClick={() => commitUi({ availability: option.id })}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="v2-am-page-controls">
        {presentation.countLabel ? (
          <p className="v2-am-page-count">{presentation.countLabel}</p>
        ) : (
          <p className="v2-am-page-count">&nbsp;</p>
        )}
        <div className="v2-am-sort">
          <button
            type="button"
            className="v2-am-sort-btn"
            aria-label={`Sort: ${sortOption.label}`}
            aria-expanded={sortOpen}
            aria-controls={sortMenuId}
            aria-haspopup="listbox"
            onClick={() => setSortOpen((open) => !open)}
          >
            {sortOption.label}
            <span aria-hidden="true"> ▾</span>
          </button>
          {sortOpen ? (
            <ul
              id={sortMenuId}
              className="v2-am-sort-menu"
              role="listbox"
              aria-label="Sort All Movies"
            >
              {ALL_MOVIES_SORT_OPTIONS.map((option) => (
                <li key={option.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === normalized.sort}
                    className={
                      option.id === normalized.sort
                        ? 'v2-am-sort-option is-selected'
                        : 'v2-am-sort-option'
                    }
                    onClick={() => {
                      commitUi({ sort: option.id });
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
      </div>

      {presentation.emptyMessage && presentation.sections.length === 0 ? (
        <div className="v2-am-empty" role="status">
          <p className="v2-am-empty-body">{presentation.emptyMessage}</p>
          {presentation.emptyAction ? (
            <button
              type="button"
              className="v2-am-empty-action"
              onClick={() => handleEmptyAction(presentation.emptyAction.id)}
            >
              {presentation.emptyAction.label}
            </button>
          ) : null}
        </div>
      ) : (
        presentation.sections.map((section) => (
          <section
            key={section.id}
            className="v2-am-section"
            data-all-movies-section={section.id}
            aria-labelledby={`v2-am-section-${section.id}`}
          >
            <h2
              id={`v2-am-section-${section.id}`}
              className="v2-am-section-heading"
            >
              {section.label}
            </h2>
            <ul className="v2-am-list" role="list">
              {section.films.map((row) => (
                <li key={row.groupId}>
                  <AllMoviesRow
                    row={row}
                    onOpen={(item) =>
                      onOpenFilmDetail?.({
                        filmKey: item.filmKey,
                        filmId: item.filmId ?? null,
                        opportunityKey: item.opportunityKey,
                        groupId: item.groupId,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <TmdbAttribution compact />
    </section>
  );
}
