/**
 * Explore → All Movies. Compact film browse of booked future Seattle screenings.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  countAllMoviesMatchingGenreKeys,
  normalizeAllMoviesGenreKeys,
  normalizeAllMoviesUi,
} from './composeAllMoviesPresentation.js';
import { useDiscoveryVisibility } from '../visibility/useDiscoveryVisibility.js';

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
 * Mobile-first genre picker. Sheet-open state stays local — not in allMoviesUi.
 *
 * @param {{
 *   open: boolean,
 *   titleId: string,
 *   sheetId: string,
 *   options: { key: string, label: string, count: number }[],
 *   draftKeys: string[],
 *   previewCount: number,
 *   onToggle: (key: string) => void,
 *   onClose: () => void,
 *   onApply: () => void,
 *   onReset: () => void,
 * }} props
 */
function AllMoviesGenreSheet({
  open,
  titleId,
  sheetId,
  options,
  draftKeys,
  previewCount,
  onToggle,
  onClose,
  onApply,
  onReset,
}) {
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const selected = new Set(draftKeys);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const previewLabel = `${previewCount} ${previewCount === 1 ? 'movie' : 'movies'}`;

  return (
    <div
      id={sheetId}
      className="v2-am-genre-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-all-movies-genre-sheet="open"
    >
      <button
        type="button"
        className="v2-am-genre-sheet-backdrop"
        aria-label="Close genres"
        onClick={onClose}
      />
      <div className="v2-am-genre-sheet-panel">
        <div className="v2-am-genre-sheet-head">
          <h2 id={titleId}>Genres</h2>
          <button
            ref={closeRef}
            type="button"
            className="v2-am-genre-sheet-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="v2-am-genre-sheet-preview" aria-live="polite">
          {previewLabel}
        </p>
        <ul className="v2-am-genre-options" role="list">
          {options.map((option) => {
            const checked = selected.has(option.key);
            return (
              <li key={option.key}>
                <label className="v2-am-genre-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(option.key)}
                  />
                  <span className="v2-am-genre-option-label">{option.label}</span>
                  <span className="v2-am-genre-option-count">{option.count}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="v2-am-genre-sheet-actions">
          <button type="button" onClick={onReset}>
            Clear genres
          </button>
          <button
            type="button"
            className="v2-am-genre-sheet-apply"
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   homeData?: object | null,
 *   loadStatus?: string,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   ui?: {
 *     query?: string,
 *     availability?: string,
 *     sort?: string,
 *     genreKeys?: string[],
 *   },
 *   listRestore?: object | null,
 *   onUiChange?: (ui: {
 *     query: string,
 *     availability: string,
 *     sort: string,
 *     genreKeys: string[],
 *   }) => void,
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
  const genreSheetTitleId = useId();
  const genreSheetId = useId();
  const normalized = normalizeAllMoviesUi(ui);
  const { storage, preferences, revision } = useDiscoveryVisibility();
  const [sortOpen, setSortOpen] = useState(false);
  const [genresOpen, setGenresOpen] = useState(false);
  const [draftGenreKeys, setDraftGenreKeys] = useState(normalized.genreKeys);
  const [draftQuery, setDraftQuery] = useState(normalized.query);

  const genreKeySig = normalized.genreKeys.join('\0');
  const presentation = useMemo(
    () =>
      composeAllMoviesPresentation(homeData, {
        loadStatus,
        query: normalized.query,
        availability: normalized.availability,
        sort: normalized.sort,
        genreKeys: normalized.genreKeys,
        enrichmentIndex,
        timeFormatId,
        storage,
        visibilityPreferences: preferences,
      }),
    [
      homeData,
      loadStatus,
      normalized.query,
      normalized.availability,
      normalized.sort,
      genreKeySig,
      enrichmentIndex,
      timeFormatId,
      storage,
      preferences,
      revision,
    ],
  );

  useBodyScrollLock(sortOpen || genresOpen);

  useEffect(() => {
    setDraftQuery(normalized.query);
  }, [normalized.query]);

  useEffect(() => {
    if (genresOpen) return;
    setDraftGenreKeys(normalized.genreKeys);
  }, [normalized.genreKeys, genresOpen]);

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
    if (actionId === 'clear-genres') commitUi({ genreKeys: [] });
    if (actionId === 'show-later') commitUi({ availability: 'later' });
    if (actionId === 'show-all') commitUi({ availability: 'all' });
  };

  const openGenres = () => {
    setDraftGenreKeys(normalized.genreKeys);
    setSortOpen(false);
    setGenresOpen(true);
  };

  const closeGenres = () => {
    setGenresOpen(false);
    setDraftGenreKeys(normalized.genreKeys);
  };

  const applyGenres = () => {
    commitUi({ genreKeys: normalizeAllMoviesGenreKeys(draftGenreKeys) });
    setGenresOpen(false);
  };

  const resetGenres = () => {
    setDraftGenreKeys([]);
    commitUi({ genreKeys: [] });
    setGenresOpen(false);
  };

  const toggleDraftGenre = (key) => {
    setDraftGenreKeys((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      return normalizeAllMoviesGenreKeys(next);
    });
  };

  const previewCount = countAllMoviesMatchingGenreKeys(
    presentation.facetGenreKeys,
    draftGenreKeys,
  );
  const genreButtonLabel =
    normalized.genreKeys.length > 0
      ? `Genres · ${normalized.genreKeys.length}`
      : 'Genres';

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
        <button
          type="button"
          className={
            normalized.genreKeys.length > 0
              ? 'v2-am-genre-btn is-active'
              : 'v2-am-genre-btn'
          }
          aria-label={
            normalized.genreKeys.length > 0
              ? `Genres, ${normalized.genreKeys.length} selected`
              : 'Genres'
          }
          aria-expanded={genresOpen}
          aria-controls={genresOpen ? genreSheetId : undefined}
          aria-haspopup="dialog"
          data-all-movies-genres="trigger"
          onClick={() => {
            if (genresOpen) closeGenres();
            else openGenres();
          }}
        >
          {genreButtonLabel}
        </button>
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
            onClick={() => {
              setGenresOpen(false);
              setSortOpen((open) => !open);
            }}
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

      {genresOpen ? (
        <AllMoviesGenreSheet
          open={genresOpen}
          titleId={genreSheetTitleId}
          sheetId={genreSheetId}
          options={presentation.genreOptions}
          draftKeys={draftGenreKeys}
          previewCount={previewCount}
          onToggle={toggleDraftGenre}
          onClose={closeGenres}
          onApply={applyGenres}
          onReset={resetGenres}
        />
      ) : null}
    </section>
  );
}
