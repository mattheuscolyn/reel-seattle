import { useEffect, useId, useMemo, useState } from 'react';
import { IconChevron } from '../icons.jsx';
import ShowtimeActionSheet from '../showtimes/ShowtimeActionSheet.jsx';
import { resolveBrowseShowtimeOpportunity } from '../showtimes/showtimeActionSheetModel.js';
import {
  SHOWTIMES_BROWSE_DATE_MODES,
  buildShowtimesBrowsePresentation,
  createDefaultShowtimesBrowseUi,
} from '../showtimes/showtimesBrowseModel.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * City-wide Showtimes browser — film-grouped, date modes + filters.
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
  const filtersTitleId = useId();
  const initial = browseUi ?? createDefaultShowtimesBrowseUi();

  const [dateMode, setDateMode] = useState(initial.dateMode ?? 'today');
  const [theaterIds, setTheaterIds] = useState(initial.theaterIds ?? []);
  const [formatKeys, setFormatKeys] = useState(initial.formatKeys ?? []);
  const [timeRangeId, setTimeRangeId] = useState(initial.timeRangeId ?? 'any');
  const [expandedFilmKey, setExpandedFilmKey] = useState(
    initial.expandedFilmKey ?? null,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsTick, setSettingsTick] = useState(0);
  const [actionSheet, setActionSheet] = useState(null);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  const timeFormatId = getScheduleSettings(getBrowserStorage()).timeFormatId;

  useEffect(() => {
    const y = browseUi?.scrollY;
    if (typeof y === 'number' && Number.isFinite(y) && y > 0) {
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, []); // restore once on mount

  const emitUi = (patch) => {
    const next = {
      dateMode,
      theaterIds,
      formatKeys,
      timeRangeId,
      expandedFilmKey,
      scrollY:
        typeof window !== 'undefined' && Number.isFinite(window.scrollY)
          ? window.scrollY
          : 0,
      ...patch,
    };
    onBrowseUiChange?.(next);
    return next;
  };

  const presentation = useMemo(
    () =>
      buildShowtimesBrowsePresentation(
        homeData,
        {
          dateMode,
          theaterIds,
          formatKeys,
          timeRangeId,
          expandedFilmKey,
        },
        { enrichmentIndex, timeFormatId },
      ),
    [
      homeData,
      enrichmentIndex,
      dateMode,
      theaterIds,
      formatKeys,
      timeRangeId,
      expandedFilmKey,
      timeFormatId,
    ],
  );

  const setDate = (nextMode) => {
    setDateMode(nextMode);
    setExpandedFilmKey(null);
    emitUi({ dateMode: nextMode, expandedFilmKey: null });
  };

  const resetFilters = () => {
    setTheaterIds([]);
    setFormatKeys([]);
    setTimeRangeId('any');
    emitUi({ theaterIds: [], formatKeys: [], timeRangeId: 'any' });
  };

  const toggleTheater = (id) => {
    setTheaterIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      emitUi({ theaterIds: next });
      return next;
    });
  };

  const toggleFormat = (key) => {
    setFormatKeys((prev) => {
      const next = prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [...prev, key];
      emitUi({ formatKeys: next });
      return next;
    });
  };

  const setTime = (id) => {
    setTimeRangeId(id);
    emitUi({ timeRangeId: id });
  };

  const toggleExpand = (filmKey) => {
    setExpandedFilmKey((prev) => {
      const next = prev === filmKey ? null : filmKey;
      emitUi({ expandedFilmKey: next });
      return next;
    });
  };

  const captureReturnSurface = () => ({
    type: 'showtimes-browse',
    originPrimary,
    browseUi: emitUi({}),
  });

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
            onClick={() => setDate(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="v2-stb-filter-bar">
        <button
          type="button"
          className={
            presentation.hasActiveFilters
              ? 'v2-stb-filter-btn is-active'
              : 'v2-stb-filter-btn'
          }
          aria-expanded={filtersOpen}
          aria-controls={filtersOpen ? filtersTitleId : undefined}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Filters
          {presentation.hasActiveFilters ? ' · On' : ''}
        </button>
        {presentation.hasActiveFilters ? (
          <button
            type="button"
            className="v2-stb-reset"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {filtersOpen ? (
        <div
          className="v2-stb-filters"
          id={filtersTitleId}
          role="region"
          aria-label="Showtimes filters"
        >
          <fieldset className="v2-stb-fieldset">
            <legend>Theater</legend>
            <div className="v2-stb-chip-row" role="group" aria-label="Theaters">
              <button
                type="button"
                className={
                  theaterIds.length === 0
                    ? 'v2-search-chip v2-search-chip-active'
                    : 'v2-search-chip'
                }
                aria-pressed={theaterIds.length === 0}
                onClick={() => {
                  setTheaterIds([]);
                  emitUi({ theaterIds: [] });
                }}
              >
                All theaters
              </button>
              {presentation.theaterOptions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    theaterIds.includes(t.id)
                      ? 'v2-search-chip v2-search-chip-active'
                      : 'v2-search-chip'
                  }
                  aria-pressed={theaterIds.includes(t.id)}
                  onClick={() => toggleTheater(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="v2-stb-fieldset">
            <legend>Format</legend>
            <div className="v2-stb-chip-row" role="group" aria-label="Formats">
              <button
                type="button"
                className={
                  formatKeys.length === 0
                    ? 'v2-search-chip v2-search-chip-active'
                    : 'v2-search-chip'
                }
                aria-pressed={formatKeys.length === 0}
                onClick={() => {
                  setFormatKeys([]);
                  emitUi({ formatKeys: [] });
                }}
              >
                All formats
              </button>
              {presentation.formatOptions.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={
                    formatKeys.includes(f.key)
                      ? 'v2-search-chip v2-search-chip-active'
                      : 'v2-search-chip'
                  }
                  aria-pressed={formatKeys.includes(f.key)}
                  onClick={() => toggleFormat(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="v2-stb-fieldset">
            <legend>Time</legend>
            <div className="v2-stb-chip-row" role="group" aria-label="Time of day">
              {presentation.timeRangeOptions.map((range) => (
                <button
                  key={range.id}
                  type="button"
                  className={
                    timeRangeId === range.id
                      ? 'v2-search-chip v2-search-chip-active'
                      : 'v2-search-chip'
                  }
                  aria-pressed={timeRangeId === range.id}
                  onClick={() => setTime(range.id)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      {presentation.emptyMessage ? (
        <div className="v2-stb-empty" role="status">
          <p>{presentation.emptyMessage}</p>
          {presentation.showResetFilters ? (
            <button type="button" className="v2-stb-reset" onClick={resetFilters}>
              Reset filters
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="v2-stb-films" role="list">
          {presentation.films.map((film) => {
            const expanded = expandedFilmKey === film.filmKey;
            return (
              <li key={film.filmKey} className="v2-stb-film">
                <div className="v2-stb-film-head">
                  <button
                    type="button"
                    className="v2-stb-film-open"
                    onClick={() =>
                      onOpenFilmDetail?.({
                        filmKey: film.filmKey,
                        opportunityKey:
                          film.showtimes[0]?.opportunityKey ?? null,
                        returnSurface: {
                          ...captureReturnSurface(),
                          browseUi: emitUi({ expandedFilmKey: film.filmKey }),
                        },
                      })
                    }
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
                        {dateMode === 'week' ? (
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
                                    returnSurface: captureReturnSurface(),
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
                                      onClick={() => openShowtimeActions(film, st)}
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
