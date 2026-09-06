import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconChevron } from '../icons.jsx';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import BrowseDatePickerSheet from '../showtimes/BrowseDatePickerSheet.jsx';
import BrowseFiltersSheet from '../showtimes/BrowseFiltersSheet.jsx';
import BrowseSortSheet from '../showtimes/BrowseSortSheet.jsx';
import ShowtimeActionSheet from '../showtimes/ShowtimeActionSheet.jsx';
import { resolveBrowseShowtimeOpportunity } from '../showtimes/showtimeActionSheetModel.js';
import {
  buildBrowseFilterSummaryPhrases,
  countActiveBrowseFilterDimensions,
} from '../showtimes/browseFilterEngine.js';
import {
  browseEmptyMessageForReason,
  browseFiltersToNavUi,
  createDefaultBrowseFilters,
  dateModeToDateSelection,
  normalizeBrowseFilters,
} from '../showtimes/browseFilterState.js';
import {
  SHOWTIMES_BROWSE_DATE_MODES,
  buildShowtimesBrowsePresentation,
} from '../showtimes/showtimesBrowseModel.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import { subscribeFavoriteTheaters } from '../stores/favoriteTheatersStore.js';
import {
  captureListPosition,
  hasListRestore,
  restoreListPosition,
} from '../navigation/listPositionRestore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * City-wide Showtimes browser — film-grouped, Dates + Filters + Sort.
 */
export default function ShowtimesBrowseSurface({
  homeData,
  enrichmentIndex = null,
  loadStatus = 'ready',
  errorMessage = null,
  browseUi = null,
  backLabel = 'Explore',
  originPrimary = 'explore',
  onBack,
  onBrowseUiChange,
  onOpenFilmDetail,
  onOpenTheaterDetail,
  onAcceptedPlansChange = null,
}) {
  const dateToolbarId = useId();
  const initial = normalizeBrowseFilters(
    browseUi ?? createDefaultBrowseFilters(),
  );

  const [appliedFilters, setAppliedFilters] = useState(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [settingsTick, setSettingsTick] = useState(0);
  const [storeTick, setStoreTick] = useState(0);
  const [actionSheet, setActionSheet] = useState(null);
  const restoreAttemptedRef = useRef(false);

  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  useEffect(
    () => subscribeFilmStoreMutations(() => setStoreTick((n) => n + 1)),
    [],
  );
  useEffect(
    () => subscribeFavoriteTheaters(() => setStoreTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  void storeTick;

  const storage = getBrowserStorage();
  const timeFormatId = getScheduleSettings(storage).timeFormatId;

  const emitUi = (nextFilters, patch = {}) => {
    const merged = normalizeBrowseFilters({
      ...nextFilters,
      ...patch,
      scrollY:
        typeof window !== 'undefined' && Number.isFinite(window.scrollY)
          ? window.scrollY
          : nextFilters.scrollY ?? 0,
    });
    onBrowseUiChange?.(browseFiltersToNavUi(merged));
    return merged;
  };

  const presentation = useMemo(
    () =>
      buildShowtimesBrowsePresentation(homeData, appliedFilters, {
        enrichmentIndex,
        timeFormatId,
        storage,
      }),
    [
      homeData,
      enrichmentIndex,
      appliedFilters,
      timeFormatId,
      storage,
      storeTick,
    ],
  );

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (loadStatus === 'loading') return;
    const position = {
      itemKey: browseUi?.restoreItemKey ?? null,
      scrollY: browseUi?.scrollY ?? 0,
    };
    if (!hasListRestore(position)) {
      restoreAttemptedRef.current = true;
      return;
    }
    let cancelled = false;
    const run = () => {
      if (cancelled || restoreAttemptedRef.current) return;
      restoreListPosition(position);
      restoreAttemptedRef.current = true;
    };
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [
    loadStatus,
    presentation.films?.length,
    browseUi?.restoreItemKey,
    browseUi?.scrollY,
  ]);

  const activeFilterCount = countActiveBrowseFilterDimensions(appliedFilters);
  const dateMode = appliedFilters.dateSelection.mode;
  const datesSelected = dateMode === 'range';

  const theaterNameById = useMemo(() => {
    /** @type {Record<string, string>} */
    const map = {};
    for (const option of presentation.theaterOptions ?? []) {
      map[option.id] = option.label;
    }
    return map;
  }, [presentation.theaterOptions]);

  const summary = useMemo(
    () =>
      buildBrowseFilterSummaryPhrases(appliedFilters, {
        theaterNameById,
        maxPhrases: 4,
      }),
    [appliedFilters, theaterNameById],
  );

  const setQuickDate = (nextMode) => {
    setAppliedFilters((prev) => {
      const next = normalizeBrowseFilters({
        ...prev,
        dateSelection: dateModeToDateSelection(nextMode),
        expandedFilmKey: null,
      });
      emitUi(next);
      return next;
    });
  };

  const applyDateSelection = (dateSelection) => {
    setAppliedFilters((prev) => {
      const next = normalizeBrowseFilters({
        ...prev,
        dateSelection,
        expandedFilmKey: null,
      });
      emitUi(next);
      return next;
    });
    setDatesOpen(false);
  };

  const applySortMode = (sortMode) => {
    setAppliedFilters((prev) => {
      const next = normalizeBrowseFilters({
        ...prev,
        sortMode,
      });
      emitUi(next);
      return next;
    });
    setSortOpen(false);
  };

  const resetAppliedSheetFilters = () => {
    setAppliedFilters((prev) => {
      const next = normalizeBrowseFilters({
        ...prev,
        time: { preset: 'any', customStartMin: null, customEndMin: null },
        theaterIds: [],
        favoritesOnly: false,
        formatKeys: [],
        savedMode: 'any',
        seenMode: 'any',
        notInterestedMode: 'any',
      });
      emitUi(next);
      return next;
    });
  };

  const toggleExpand = (filmKey) => {
    setAppliedFilters((prev) => {
      const nextKey = prev.expandedFilmKey === filmKey ? null : filmKey;
      const next = { ...prev, expandedFilmKey: nextKey };
      emitUi(next);
      return next;
    });
  };

  const captureReturnSurface = (originFilmKey = null) => {
    const position = captureListPosition({ itemKey: originFilmKey });
    return {
      type: 'showtimes-browse',
      originPrimary,
      browseUi: {
        ...browseFiltersToNavUi(emitUi(appliedFilters, {})),
        restoreItemKey: position.itemKey,
        scrollY: position.scrollY,
      },
    };
  };

  const openShowtimeActions = (film, row) => {
    const opportunity = resolveBrowseShowtimeOpportunity({
      row,
      homeData,
    });
    if (!opportunity) return;
    setActionSheet({
      filmKey: film.filmKey,
      row,
      opportunity,
    });
  };

  const closeShowtimeActions = () => setActionSheet(null);

  const emptyMessage =
    presentation.emptyMessage ??
    browseEmptyMessageForReason(
      presentation.emptyReason,
      appliedFilters.dateSelection.mode,
    );

  const showDateLabels = dateMode === 'week' || dateMode === 'range';

  if (loadStatus === 'loading') {
    return (
      <section className="v2-stb" aria-labelledby="v2-stb-title">
        <p className="v2-data-status" role="status">
          Loading showtimes…
        </p>
      </section>
    );
  }

  if (loadStatus === 'error' || !homeData) {
    return (
      <section className="v2-stb" aria-labelledby="v2-stb-title">
        <h1 id="v2-stb-title" className="v2-stb-title">
          Showtimes
        </h1>
        <p className="v2-data-status" role="status">
          {errorMessage || 'Showtimes aren’t loaded yet.'}
        </p>
        {typeof onBack === 'function' ? (
          <button type="button" className="v2-film-detail-back" onClick={onBack}>
            ← {backLabel}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="v2-stb" aria-labelledby="v2-stb-title">
      <header className="v2-stb-header">
        <h1 id="v2-stb-title" className="v2-stb-title">
          Showtimes
        </h1>
        <p className="v2-stb-window" role="status">
          {presentation.windowLabel}
          {presentation.filteredCount > 0
            ? ` · ${presentation.filteredCount} showtime${
                presentation.filteredCount === 1 ? '' : 's'
              }`
            : null}
        </p>
      </header>

      <div
        className="v2-stb-dates"
        role="toolbar"
        aria-label="Date range"
        id={dateToolbarId}
      >
        {SHOWTIMES_BROWSE_DATE_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={
              dateMode === mode.id
                ? 'v2-search-chip v2-search-chip-active'
                : 'v2-search-chip'
            }
            aria-pressed={dateMode === mode.id}
            onClick={() => setQuickDate(mode.id)}
          >
            {mode.label}
          </button>
        ))}
        <button
          type="button"
          className={
            datesSelected
              ? 'v2-search-chip v2-search-chip-active'
              : 'v2-search-chip'
          }
          aria-pressed={datesSelected}
          aria-haspopup="dialog"
          aria-expanded={datesOpen}
          onClick={() => setDatesOpen(true)}
        >
          Dates
        </button>
      </div>

      <div className="v2-stb-filter-bar">
        <button
          type="button"
          className={
            activeFilterCount > 0
              ? 'v2-stb-filter-btn is-active'
              : 'v2-stb-filter-btn'
          }
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          onClick={() => setFiltersOpen(true)}
        >
          {activeFilterCount > 0
            ? `Filters · ${activeFilterCount}`
            : 'Filters'}
        </button>
        <button
          type="button"
          className="v2-stb-sort-btn"
          aria-haspopup="dialog"
          aria-expanded={sortOpen}
          aria-label={`Sort showtimes, currently ${appliedFilters.sortMode}`}
          onClick={() => setSortOpen(true)}
        >
          Sort
        </button>
      </div>

      {summary.summary ? (
        <p className="v2-stb-summary" aria-live="polite">
          {summary.summary}
        </p>
      ) : null}

      {emptyMessage ? (
        <div className="v2-stb-empty" role="status">
          <p>{emptyMessage}</p>
          {presentation.showResetFilters ? (
            <div className="v2-stb-empty-actions">
              <button
                type="button"
                className="v2-stb-reset"
                onClick={() => setFiltersOpen(true)}
              >
                Edit filters
              </button>
              <button
                type="button"
                className="v2-stb-reset"
                onClick={resetAppliedSheetFilters}
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="v2-stb-films" role="list">
          {presentation.films.map((film) => {
            const expanded = appliedFilters.expandedFilmKey === film.filmKey;
            return (
              <li
                key={film.filmKey}
                className="v2-stb-film"
                data-list-restore-key={film.filmKey}
              >
                <div className="v2-stb-film-head">
                  <button
                    type="button"
                    className="v2-stb-film-open"
                    onClick={() => {
                      const position = captureListPosition({
                        itemKey: film.filmKey,
                      });
                      onOpenFilmDetail?.({
                        filmKey: film.filmKey,
                        opportunityKey:
                          film.showtimes[0]?.opportunityKey ?? null,
                        returnSurface: {
                          type: 'showtimes-browse',
                          originPrimary,
                          browseUi: {
                            ...browseFiltersToNavUi(
                              emitUi(appliedFilters, {
                                expandedFilmKey: film.filmKey,
                              }),
                            ),
                            restoreItemKey: position.itemKey,
                            scrollY: position.scrollY,
                          },
                        },
                      });
                    }}
                  >
                    {film.posterUrl ? (
                      <img
                        className="v2-stb-poster"
                        src={film.posterUrl}
                        alt=""
                        width={48}
                        height={72}
                      />
                    ) : (
                      <span
                        className="v2-stb-poster v2-stb-poster-fallback"
                        aria-hidden="true"
                      />
                    )}
                    <span className="v2-stb-film-copy">
                      <span className="v2-stb-film-title">{film.title}</span>
                      <span className="v2-stb-film-meta">
                        {[
                          film.runtimeLabel,
                          film.ratingLabel,
                          film.earliestTimeDisplay
                            ? `From ${film.earliestTimeDisplay}`
                            : null,
                          film.theaterCount
                            ? `${film.theaterCount} theater${
                                film.theaterCount === 1 ? '' : 's'
                              }`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="v2-stb-expand"
                    aria-expanded={expanded}
                    aria-controls={`v2-stb-body-${film.filmKey}`}
                    onClick={() => toggleExpand(film.filmKey)}
                  >
                    <span className="v2-visually-hidden">
                      {expanded ? 'Hide' : 'Show'} showtimes for {film.title}
                    </span>
                    <IconChevron
                      width={16}
                      height={16}
                      className={
                        expanded ? 'v2-stb-chevron is-open' : 'v2-stb-chevron'
                      }
                    />
                  </button>
                </div>

                {expanded ? (
                  <div
                    id={`v2-stb-body-${film.filmKey}`}
                    className="v2-stb-film-body"
                  >
                    {film.dateGroups.map((group) => (
                      <div key={group.localDate} className="v2-stb-date-group">
                        {showDateLabels ? (
                          <h3 className="v2-stb-date-label">{group.dateLabel}</h3>
                        ) : null}
                        {group.theaters.map((theater) => (
                          <div
                            key={`${group.localDate}-${theater.theaterId ?? theater.theaterName}`}
                            className="v2-stb-theater-block"
                          >
                            {theater.theaterId ? (
                              <button
                                type="button"
                                className="v2-stb-theater-name"
                                onClick={() =>
                                  onOpenTheaterDetail?.({
                                    theaterId: theater.theaterId,
                                    returnSurface: captureReturnSurface(
                                      film.filmKey,
                                    ),
                                  })
                                }
                              >
                                {theater.theaterName}
                              </button>
                            ) : (
                              <p className="v2-stb-theater-name-static">
                                {theater.theaterName}
                              </p>
                            )}
                            <ul className="v2-stb-times" role="list">
                              {theater.showtimes.map((st) => {
                                const formatSuffix = st.formatLabels[0]
                                  ? ` ${st.formatLabels[0]}`
                                  : '';
                                const ariaLabel = `${st.timeDisplay}${formatSuffix} at ${theater.theaterName} for ${film.title}`;
                                return (
                                  <li key={st.opportunityKey}>
                                    <button
                                      type="button"
                                      className="v2-stb-time"
                                      onClick={() =>
                                        openShowtimeActions(film, st)
                                      }
                                      aria-label={`${ariaLabel} — show actions`}
                                    >
                                      <span>{st.timeDisplay}</span>
                                      {st.formatLabels[0] ? (
                                        <span className="v2-stb-format">
                                          {st.formatLabels[0]}
                                        </span>
                                      ) : null}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <BrowseFiltersSheet
        open={filtersOpen}
        appliedFilters={appliedFilters}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        storage={storage}
        onClose={() => setFiltersOpen(false)}
        onApply={(nextFilters) => {
          const next = normalizeBrowseFilters({
            ...nextFilters,
            expandedFilmKey: null,
          });
          setAppliedFilters(next);
          emitUi(next);
          setFiltersOpen(false);
        }}
      />

      <BrowseDatePickerSheet
        open={datesOpen}
        appliedFilters={appliedFilters}
        homeData={homeData}
        onClose={() => setDatesOpen(false)}
        onApply={applyDateSelection}
      />

      <BrowseSortSheet
        open={sortOpen}
        sortMode={appliedFilters.sortMode}
        onClose={() => setSortOpen(false)}
        onSelect={applySortMode}
      />

      <ShowtimeActionSheet
        open={Boolean(actionSheet)}
        onClose={closeShowtimeActions}
        opportunity={actionSheet?.opportunity ?? null}
        filmKey={actionSheet?.filmKey ?? null}
        row={actionSheet?.row ?? null}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        onPlansChanged={onAcceptedPlansChange}
      />
    </section>
  );
}
