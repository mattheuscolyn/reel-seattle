import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconChevron, IconSearch } from '../icons.jsx';
import { COLLECTION_IDS } from '../explore/exploreIds.js';
import {
  addRecentSearch,
  loadRecentSearches,
  saveRecentSearches,
} from '../explore/recentSearchesStore.js';
import {
  SEARCH_TIME_FILTERS,
  SEARCH_TYPE_FILTERS,
  buildSearchResultsModel,
  countAdvancedFilters,
  listFormatFilterOptions,
  listTheaterFilterOptions,
} from '../explore/searchResultsModel.js';
import { IMAX_FORMAT_TAGS, THIRTY_FIVE_MM_FORMAT_TAGS } from '../explore/exploreIds.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import {
  applySaveToggle,
  buildSaveActionState,
} from '../save/saveActionState.js';
import {
  applyNotInterestedToggle,
  buildNotInterestedActionState,
} from '../save/notInterestedActionState.js';
import { isFilmNotInterested } from '../stores/notInterestedFilmsStore.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import { SEARCH_PLACEHOLDER } from '../explore/searchCopy.js';

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function sectionCountLabel(count) {
  return count === 1 ? '1 result' : `${count} results`;
}

function formatCollectionIdForTag(tag) {
  const lower = String(tag).toLowerCase();
  if (IMAX_FORMAT_TAGS.some((t) => lower === t || lower.includes('imax'))) {
    return COLLECTION_IDS.imax;
  }
  if (THIRTY_FIVE_MM_FORMAT_TAGS.some((t) => lower === t)) {
    return COLLECTION_IDS.thirtyFiveMm;
  }
  return COLLECTION_IDS.formats;
}

/**
 * Designed Search Results surface (Explore-origin).
 */
export default function SearchResultsSurface({
  homeData,
  enrichmentIndex = null,
  query: initialQuery = '',
  searchUi = null,
  onBack,
  onOpenFilmDetail,
  onOpenCollection,
  onSearchStateChange,
}) {
  const storage = getStorage();
  const searchInputId = useId();
  const filtersTitleId = useId();

  const [query, setQuery] = useState(searchUi?.query ?? initialQuery ?? '');
  const [typeFilter, setTypeFilter] = useState(searchUi?.typeFilter ?? 'all');
  const [timeFilter, setTimeFilter] = useState(searchUi?.timeFilter ?? null);
  const [theaterIds, setTheaterIds] = useState(searchUi?.theaterIds ?? []);
  const [formatTags, setFormatTags] = useState(searchUi?.formatTags ?? []);
  const [runtimeMin, setRuntimeMin] = useState(searchUi?.runtimeMin ?? null);
  const [runtimeMax, setRuntimeMax] = useState(searchUi?.runtimeMax ?? null);
  const [expandedFilmKey, setExpandedFilmKey] = useState(
    searchUi?.expandedFilmKey ?? null,
  );
  const [prefRevision, setPrefRevision] = useState(0);
  const [saveErrorByKey, setSaveErrorByKey] = useState({});
  const [niErrorByKey, setNiErrorByKey] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftTheaters, setDraftTheaters] = useState(theaterIds);
  const [draftFormats, setDraftFormats] = useState(formatTags);
  const [undoBanner, setUndoBanner] = useState(null);
  const listRef = useRef(null);
  const restoredScroll = useRef(false);

  const homeFilmByKey = useMemo(() => {
    const map = new Map();
    for (const film of homeData?.films ?? []) {
      map.set(film.filmKey, film);
    }
    return map;
  }, [homeData]);

  useEffect(() => {
    return subscribeFilmStoreMutations(() => {
      setPrefRevision((value) => value + 1);
    });
  }, []);

  const isDismissedFilm = useMemo(() => {
    void prefRevision;
    return (film) => {
      const homeFilm = homeFilmByKey.get(film.filmKey) ?? film;
      const ref = filmRefFromHomeFilm(homeFilm);
      return Boolean(ref && isFilmNotInterested(storage, ref));
    };
  }, [homeFilmByKey, storage, prefRevision]);

  const model = useMemo(
    () =>
      buildSearchResultsModel(homeData, query, {
        typeFilter,
        timeFilter,
        theaterIds,
        formatTags,
        isDismissed: isDismissedFilm,
        runtimeMin,
        runtimeMax,
        enrichmentIndex,
      }),
    [
      homeData,
      enrichmentIndex,
      query,
      typeFilter,
      timeFilter,
      theaterIds,
      formatTags,
      isDismissedFilm,
      runtimeMin,
      runtimeMax,
    ],
  );

  const advancedCount = countAdvancedFilters({
    theaterIds,
    formatTags,
    runtimeMin,
    runtimeMax,
  });

  useEffect(() => {
    onSearchStateChange?.({
      query,
      typeFilter,
      timeFilter,
      theaterIds,
      formatTags,
      runtimeMin,
      runtimeMax,
      expandedFilmKey,
      scrollY:
        typeof window !== 'undefined' && Number.isFinite(window.scrollY)
          ? window.scrollY
          : 0,
    });
  }, [
    query,
    typeFilter,
    timeFilter,
    theaterIds,
    formatTags,
    runtimeMin,
    runtimeMax,
    expandedFilmKey,
    onSearchStateChange,
  ]);

  useEffect(() => {
    if (restoredScroll.current) return;
    const y = searchUi?.scrollY;
    if (typeof y === 'number' && y > 0) {
      restoredScroll.current = true;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [searchUi]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (filtersOpen) {
          setFiltersOpen(false);
          return;
        }
        if (expandedFilmKey) setExpandedFilmKey(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedFilmKey, filtersOpen]);

  const submitQuery = (raw) => {
    const next = String(raw ?? '').trim();
    if (!next) return;
    setQuery(next);
    const recent = addRecentSearch(next, loadRecentSearches(storage));
    saveRecentSearches(storage, recent);
    setExpandedFilmKey(null);
  };

  const openFilters = () => {
    setDraftTheaters(theaterIds);
    setDraftFormats(formatTags);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setTheaterIds(draftTheaters);
    setFormatTags(draftFormats);
    setFiltersOpen(false);
    setExpandedFilmKey(null);
  };

  const resetFilters = () => {
    setDraftTheaters([]);
    setDraftFormats([]);
    setTheaterIds([]);
    setFormatTags([]);
    setRuntimeMin(null);
    setRuntimeMax(null);
    setFiltersOpen(false);
  };

  const toggleExpand = (filmKey) => {
    setExpandedFilmKey((current) => (current === filmKey ? null : filmKey));
  };

  const handleNotInterested = (film) => {
    const homeFilm = homeFilmByKey.get(film.filmKey) ?? film;
    const action = buildNotInterestedActionState({
      mode: 'production',
      film: homeFilm,
      storage,
    });
    if (!action.available || !action.filmRef) return;
    const result = applyNotInterestedToggle({
      storage,
      filmRef: action.filmRef,
      persist: true,
      currentIsNotInterested: action.isNotInterested,
    });
    if (!result.ok) {
      setNiErrorByKey((current) => ({
        ...current,
        [film.filmKey]: result.error ?? 'storage_set_failed',
      }));
      return;
    }
    setNiErrorByKey((current) => {
      if (!current[film.filmKey]) return current;
      const next = { ...current };
      delete next[film.filmKey];
      return next;
    });
    setExpandedFilmKey(null);
    setUndoBanner({
      filmKey: film.filmKey,
      title: film.title,
      filmRef: action.filmRef,
      wasNotInterested: action.isNotInterested,
    });
  };

  const handleToggleSave = (film) => {
    const homeFilm = homeFilmByKey.get(film.filmKey) ?? film;
    const action = buildSaveActionState({
      mode: 'production',
      film: homeFilm,
      storage,
    });
    if (!action.available) return;
    const result = applySaveToggle({
      storage,
      filmRef: action.filmRef,
      persist: true,
      currentIsSaved: action.isSaved,
    });
    if (!result.ok) {
      setSaveErrorByKey((current) => ({
        ...current,
        [film.filmKey]: result.error ?? 'storage_set_failed',
      }));
      return;
    }
    setSaveErrorByKey((current) => {
      if (!current[film.filmKey]) return current;
      const next = { ...current };
      delete next[film.filmKey];
      return next;
    });
  };

  const undoDismiss = () => {
    if (!undoBanner?.filmRef) {
      setUndoBanner(null);
      return;
    }
    // Undo restores prior NI state for this filmRef (mark or clear).
    const currently = isFilmNotInterested(storage, undoBanner.filmRef);
    if (currently !== Boolean(undoBanner.wasNotInterested)) {
      applyNotInterestedToggle({
        storage,
        filmRef: undoBanner.filmRef,
        persist: true,
        currentIsNotInterested: currently,
      });
    }
    setUndoBanner(null);
  };

  const theaterOptions = listTheaterFilterOptions(homeData);
  const formatOptions = listFormatFilterOptions(homeData);

  return (
    <section className="v2-search-results" aria-labelledby="v2-search-results-summary">
      <div className="v2-search-results-field">
        <label className="v2-visually-hidden" htmlFor={searchInputId}>
          {SEARCH_PLACEHOLDER}
        </label>
        <span className="v2-search-results-icon" aria-hidden="true">
          <IconSearch />
        </span>
        <input
          id={searchInputId}
          className="v2-search-results-input"
          type="search"
          value={query}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={SEARCH_PLACEHOLDER}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitQuery(query);
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="v2-search-results-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setExpandedFilmKey(null);
            }}
          >
            ×
          </button>
        ) : (
          <button
            type="button"
            className="v2-search-results-submit"
            aria-label="Search"
            onClick={() => submitQuery(query)}
          >
            <IconSearch />
          </button>
        )}
      </div>

      <p
        id="v2-search-results-summary"
        className="v2-search-results-summary"
        role="status"
        aria-live="polite"
      >
        {model.summary}
      </p>
      {model.totalCount > 0 || model.emptyReason === 'no-matches' ? (
        <p className="v2-search-results-capability">{model.capabilityNote}</p>
      ) : null}

      <div className="v2-search-filter-row" role="toolbar" aria-label="Result type">
        {SEARCH_TYPE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              typeFilter === item.id
                ? 'v2-search-chip v2-search-chip-active'
                : 'v2-search-chip'
            }
            aria-pressed={typeFilter === item.id}
            onClick={() => {
              setTypeFilter(item.id);
              setExpandedFilmKey(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="v2-search-filter-row" role="toolbar" aria-label="Availability">
        {SEARCH_TIME_FILTERS.map((item) => {
          const active = timeFilter === item.id;
          const disabled = typeFilter === 'formats';
          return (
            <button
              key={item.id}
              type="button"
              className={
                active ? 'v2-search-chip v2-search-chip-active' : 'v2-search-chip'
              }
              aria-pressed={active}
              disabled={disabled}
              title={
                disabled
                  ? 'Time filters apply to movies with showtimes'
                  : undefined
              }
              onClick={() => {
                setTimeFilter((current) => (current === item.id ? null : item.id));
                setExpandedFilmKey(null);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="v2-search-filters-btn"
        aria-haspopup="dialog"
        aria-expanded={filtersOpen}
        onClick={openFilters}
      >
        <span className="v2-search-filters-btn-label">
          Filters{advancedCount > 0 ? ` · ${advancedCount}` : ''}
        </span>
        <IconChevron />
      </button>

      {undoBanner ? (
        <div className="v2-search-undo" role="status">
          <span>Marked “{undoBanner.title}” as Not interested.</span>
          <button type="button" onClick={undoDismiss}>
            Undo
          </button>
        </div>
      ) : null}

      {model.emptyReason === 'no-matches' ? (
        <div className="v2-search-empty" role="status">
          <p>{model.emptyBody}</p>
          <div className="v2-search-empty-actions">
            {(timeFilter || advancedCount > 0) && (
              <button
                type="button"
                className="v2-search-empty-btn"
                onClick={() => {
                  setTimeFilter(null);
                  resetFilters();
                }}
              >
                Clear filters
              </button>
            )}
            <button
              type="button"
              className="v2-search-empty-btn"
              onClick={() => onOpenCollection?.({ collectionId: COLLECTION_IDS.allMovies })}
            >
              All Movies
            </button>
            <button
              type="button"
              className="v2-search-empty-btn"
              onClick={() => onOpenCollection?.({ collectionId: COLLECTION_IDS.theaters })}
            >
              Theaters
            </button>
            <button
              type="button"
              className="v2-search-empty-btn"
              onClick={() => onOpenCollection?.({ collectionId: COLLECTION_IDS.formats })}
            >
              Formats & Experiences
            </button>
          </div>
        </div>
      ) : null}

      <div ref={listRef} className="v2-search-sections">
        {model.films.length > 0 ? (
          <section className="v2-search-section" aria-labelledby="v2-search-movies-h">
            <div className="v2-search-section-head">
              <h2 id="v2-search-movies-h" className="v2-section-caps">
                Movies
              </h2>
              <span className="v2-search-section-count">
                {sectionCountLabel(model.films.length)}
              </span>
            </div>
            <ul className="v2-search-film-list" role="list">
              {model.films.map((film) => {
                const expanded = expandedFilmKey === film.filmKey;
                const panelId = `v2-search-expand-${film.filmKey}`;
                return (
                  <li key={film.filmKey}>
                    <article
                      className={
                        expanded
                          ? 'v2-search-film-card v2-search-film-card-expanded'
                          : 'v2-search-film-card'
                      }
                    >
                      <button
                        type="button"
                        className="v2-search-film-row"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => toggleExpand(film.filmKey)}
                      >
                        <span className="v2-search-film-poster">
                          {film.posterUrl ? (
                            <img src={film.posterUrl} alt="" />
                          ) : (
                            <span
                              className="v2-shelf-poster-fallback"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="v2-search-film-copy">
                          <span className="v2-search-film-title">{film.title}</span>
                          {film.metaLine ? (
                            <span className="v2-search-film-meta">{film.metaLine}</span>
                          ) : null}
                          {film.showtimeChip ? (
                            <span className="v2-search-showtime-chip">
                              {[
                                film.showtimeChip.label,
                                film.showtimeChip.theaterName,
                                film.showtimeChip.formatLabel,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          ) : (
                            <span className="v2-search-film-meta">
                              No upcoming showtimes in the current window
                            </span>
                          )}
                        </span>
                        <span className="v2-search-film-chevron" aria-hidden="true">
                          {expanded ? '⌃' : <IconChevron />}
                        </span>
                      </button>

                      {expanded ? (
                        <div
                          id={panelId}
                          className="v2-search-expand"
                          role="region"
                          aria-label={`Quick details for ${film.title}`}
                        >
                          <button
                            type="button"
                            className="v2-search-expand-collapse"
                            aria-label="Collapse film details"
                            onClick={() => setExpandedFilmKey(null)}
                          >
                            Collapse
                          </button>

                          <div className="v2-search-expand-facts">
                            {film.metaLine ? (
                              <p className="v2-search-expand-meta">{film.metaLine}</p>
                            ) : null}
                            {film.synopsis ? (
                              <p className="v2-search-expand-synopsis">{film.synopsis}</p>
                            ) : null}
                          </div>

                          <div className="v2-search-next">
                            <p className="v2-search-next-label">Next showtime</p>
                            {film.showtimeChip ? (
                              <>
                                <p className="v2-search-next-time">
                                  {film.showtimeChip.label}
                                </p>
                                <p className="v2-search-next-venue">
                                  {[
                                    film.showtimeChip.theaterName,
                                    film.showtimeChip.formatLabel,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </>
                            ) : (
                              <p className="v2-search-next-venue">
                                No upcoming showtimes in the current window.
                              </p>
                            )}
                            {film.alsoPlayingLabel ? (
                              <p className="v2-search-next-also">{film.alsoPlayingLabel}</p>
                            ) : null}
                            {film.weekShowtimeLabel ? (
                              <p className="v2-search-next-also">{film.weekShowtimeLabel}</p>
                            ) : null}
                          </div>

                          {film.badges.length > 0 ? (
                            <ul className="v2-search-badges" role="list">
                              {film.badges.map((badge) => (
                                <li key={badge.id} className="v2-search-badge">
                                  {badge.label}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <div className="v2-search-expand-actions">
                            {(() => {
                              void prefRevision;
                              const homeFilm =
                                homeFilmByKey.get(film.filmKey) ?? film;
                              const action = buildSaveActionState({
                                mode: 'production',
                                film: homeFilm,
                                storage,
                              });
                              const isSaved = action.isSaved;
                              const available = action.available;
                              const label = isSaved ? 'Saved' : 'Save';
                              return (
                                <button
                                  type="button"
                                  className={
                                    isSaved
                                      ? 'v2-search-action v2-search-action-save-on'
                                      : 'v2-search-action'
                                  }
                                  aria-pressed={isSaved}
                                  disabled={!available}
                                  title={
                                    available
                                      ? undefined
                                      : 'Save needs a valid film identity'
                                  }
                                  onClick={() => handleToggleSave(film)}
                                >
                                  {label}
                                </button>
                              );
                            })()}
                            {saveErrorByKey[film.filmKey] ? (
                              <span className="v2-visually-hidden" role="status">
                                Could not update Saved. Try again.
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="v2-search-action"
                              disabled={
                                !buildNotInterestedActionState({
                                  mode: 'production',
                                  film: homeFilmByKey.get(film.filmKey) ?? film,
                                  storage,
                                }).available
                              }
                              onClick={() => handleNotInterested(film)}
                            >
                              Not interested
                            </button>
                            {niErrorByKey[film.filmKey] ? (
                              <span className="v2-visually-hidden" role="status">
                                Could not update Not Interested. Try again.
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="v2-search-more"
                              onClick={() =>
                                onOpenFilmDetail?.({
                                  filmKey: film.filmKey,
                                  opportunityKey: film.opportunityKey,
                                })
                              }
                            >
                              More details
                              <IconChevron />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {model.theaters.length > 0 ? (
          <section className="v2-search-section" aria-labelledby="v2-search-theaters-h">
            <div className="v2-search-section-head">
              <h2 id="v2-search-theaters-h" className="v2-section-caps">
                Theaters
              </h2>
              <span className="v2-search-section-count">
                {sectionCountLabel(model.theaters.length)}
              </span>
            </div>
            <ul className="v2-search-entity-list" role="list">
              {model.theaters.map((theater) => (
                <li key={theater.id}>
                  <button
                    type="button"
                    className="v2-search-entity-row"
                    onClick={() =>
                      onOpenCollection?.({
                        collectionId: COLLECTION_IDS.theaters,
                      })
                    }
                  >
                    <span className="v2-search-entity-icon" aria-hidden="true">
                      ⌂
                    </span>
                    <span className="v2-search-entity-copy">
                      <span className="v2-search-entity-title">{theater.name}</span>
                      {theater.metaLabel ? (
                        <span className="v2-search-entity-meta">{theater.metaLabel}</span>
                      ) : null}
                      {theater.availabilityLabel ? (
                        <span className="v2-search-entity-meta">
                          {theater.availabilityLabel}
                        </span>
                      ) : null}
                    </span>
                    <IconChevron />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {model.formats.length > 0 ? (
          <section className="v2-search-section" aria-labelledby="v2-search-formats-h">
            <div className="v2-search-section-head">
              <h2 id="v2-search-formats-h" className="v2-section-caps">
                Formats & Experiences
              </h2>
              <span className="v2-search-section-count">
                {sectionCountLabel(model.formats.length)}
              </span>
            </div>
            <ul className="v2-search-entity-list" role="list">
              {model.formats.map((format) => (
                <li key={format.tag}>
                  <button
                    type="button"
                    className="v2-search-entity-row"
                    onClick={() =>
                      onOpenCollection?.({
                        collectionId: formatCollectionIdForTag(format.tag),
                      })
                    }
                  >
                    <span className="v2-search-entity-icon" aria-hidden="true">
                      ◉
                    </span>
                    <span className="v2-search-entity-copy">
                      <span className="v2-search-entity-title">{format.name}</span>
                      <span className="v2-search-entity-meta">{format.metaLabel}</span>
                    </span>
                    <IconChevron />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {filtersOpen ? (
        <div className="v2-search-sheet-backdrop" role="presentation">
          <div
            className="v2-search-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={filtersTitleId}
          >
            <div className="v2-search-sheet-head">
              <h2 id={filtersTitleId}>Filters</h2>
              <button
                type="button"
                className="v2-section-action"
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="v2-search-sheet-note">
              Only filters supported by current public showtimes data.
            </p>

            <fieldset className="v2-search-sheet-fieldset">
              <legend>Theater</legend>
              <ul className="v2-search-sheet-options" role="list">
                {theaterOptions.slice(0, 12).map((theater) => {
                  const checked = draftTheaters.includes(theater.id);
                  return (
                    <li key={theater.id}>
                      <label className="v2-search-sheet-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDraftTheaters((current) =>
                              checked
                                ? current.filter((id) => id !== theater.id)
                                : [...current, theater.id],
                            );
                          }}
                        />
                        {theater.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <fieldset className="v2-search-sheet-fieldset">
              <legend>Format</legend>
              <ul className="v2-search-sheet-options" role="list">
                {formatOptions.slice(0, 12).map((format) => {
                  const checked = draftFormats.includes(format.tag);
                  return (
                    <li key={format.tag}>
                      <label className="v2-search-sheet-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDraftFormats((current) =>
                              checked
                                ? current.filter((tag) => tag !== format.tag)
                                : [...current, format.tag],
                            );
                          }}
                        />
                        {format.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="v2-search-sheet-actions">
              <button type="button" className="v2-search-empty-btn" onClick={resetFilters}>
                Reset
              </button>
              <button type="button" className="v2-search-sheet-apply" onClick={applyFilters}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
