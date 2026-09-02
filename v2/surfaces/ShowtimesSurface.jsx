import { useEffect, useId, useMemo, useState } from 'react';
import {
  calendarExportStatusMessage,
  exportOpportunityToCalendar,
} from '../calendar/exportFromOpportunity.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import { IconChevron } from '../icons.jsx';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import { composeFilmShowtimesPresentation } from '../showtimes/composeFilmShowtimesPresentation.js';
import ShowtimeActionSheet from '../showtimes/ShowtimeActionSheet.jsx';
import { resolveHomeOpportunity } from '../showtimes/resolveHomeOpportunity.js';
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
 * Designed Film Showtimes page — Film Detail → See all showtimes.
 * Live HomeData + canonical film presentation; not a mockup fixture route.
 * Back navigation is owned by AppHeader.
 */
export default function ShowtimesSurface({
  homeData,
  enrichmentIndex = null,
  filmKey,
  theaterId = null,
  opportunityKey = null,
  onOpenTheaterDetail,
  onAcceptedPlansChange = null,
}) {
  const titleId = useId();
  const datesId = useId();
  const theaterFilterId = useId();
  const formatFilterId = useId();
  const sortFilterId = useId();
  const moreFiltersId = useId();
  const [selectedDate, setSelectedDate] = useState(null);
  const [formatKeys, setFormatKeys] = useState([]);
  const [timeRangeId, setTimeRangeId] = useState('any');
  const [sortId, setSortId] = useState('time');
  const [moreOpen, setMoreOpen] = useState(false);
  const [theaterScope, setTheaterScope] = useState(theaterId);
  const [selectedKey, setSelectedKey] = useState(opportunityKey);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [actionSheet, setActionSheet] = useState(null);
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  const timeFormatId = getScheduleSettings(getBrowserStorage()).timeFormatId;

  useEffect(() => {
    setSelectedKey(opportunityKey);
    setTheaterScope(theaterId);
  }, [opportunityKey, filmKey, theaterId]);

  const presentation = useMemo(
    () =>
      composeFilmShowtimesPresentation(homeData, filmKey, {
        selectedDate,
        theaterId: theaterScope,
        opportunityKey: selectedKey,
        formatKeys,
        timeRangeId,
        sortId,
        enrichmentIndex,
        timeFormatId,
      }),
    [
      homeData,
      filmKey,
      selectedDate,
      theaterScope,
      selectedKey,
      formatKeys,
      timeRangeId,
      sortId,
      enrichmentIndex,
      timeFormatId,
    ],
  );

  useEffect(() => {
    if (
      presentation.selectedDate &&
      presentation.selectedDate !== selectedDate
    ) {
      setSelectedDate(presentation.selectedDate);
    }
  }, [presentation.selectedDate, selectedDate]);

  const film = resolveFilm(homeData, filmKey);
  const selectedTime =
    presentation.theaterGroups
      .flatMap((g) =>
        g.times.map((t) => ({
          ...t,
          theaterName: g.theaterName,
        })),
      )
      .find((t) => t.opportunityKey === (selectedKey ?? presentation.selectedOpportunityKey)) ??
    null;

  const formatSelectValue = formatKeys[0] ?? '';
  const hasMoreFilters = presentation.timeRangeOptions.length > 1;
  const filtersActive =
    formatKeys.length > 0 ||
    timeRangeId !== 'any' ||
    sortId !== 'time' ||
    Boolean(theaterScope);

  const handleExport = () => {
    const opp =
      (selectedTime?.opportunityKey &&
        (homeData?.opportunities ?? []).find(
          (o) => o.opportunityKey === selectedTime.opportunityKey,
        )) ||
      null;
    if (!opp) {
      setCalendarStatus('Select a showtime to add to your calendar.');
      return;
    }
    const result = exportOpportunityToCalendar({
      opportunity: opp,
      film,
      homeData,
    });
    setCalendarStatus(calendarExportStatusMessage(result));
  };

  const resetFilters = () => {
    setFormatKeys([]);
    setTimeRangeId('any');
    setSortId('time');
    setTheaterScope(null);
  };

  const openShowtimeActions = (group, time) => {
    const opportunity = resolveHomeOpportunity(homeData, time.opportunityKey);
    if (!opportunity) return;
    setSelectedKey(time.opportunityKey);
    setCalendarStatus(null);
    setActionSheet({
      filmKey,
      opportunity,
      row: {
        opportunityKey: time.opportunityKey,
        filmKey,
        filmTitle: presentation.title,
        localDate: presentation.selectedDate,
        localTime: time.localTime,
        timeDisplay: time.timeDisplay,
        theaterName: group.theaterName,
        formatLabels: time.formatLabel ? [time.formatLabel] : [],
        ticketUrl: time.ticketUrl,
      },
    });
  };

  const closeShowtimeActions = () => setActionSheet(null);

  return (
    <section className="v2-st" aria-labelledby={titleId}>
      <p className="v2-destination-eyebrow">Showtimes</p>

      <header className="v2-st-film-summary">
        {presentation.posterUrl ? (
          <img
            className="v2-st-poster"
            src={presentation.posterUrl}
            alt=""
            draggable="false"
          />
        ) : (
          <span className="v2-st-poster v2-st-poster-fallback" aria-hidden="true" />
        )}
        <div className="v2-st-film-copy">
          <h1 id={titleId} className="v2-st-title">
            {presentation.title}
          </h1>
          {presentation.metaLine ? (
            <p className="v2-st-film-meta">{presentation.metaLine}</p>
          ) : null}
          {presentation.genreLine ? (
            <p className="v2-st-film-genres">{presentation.genreLine}</p>
          ) : null}
        </div>
      </header>

      {presentation.dateChips.length > 0 ? (
        <div
          id={datesId}
          className="v2-st-dates"
          role="toolbar"
          aria-label="Showtime dates"
        >
          {presentation.dateChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={[
                'v2-st-date-chip',
                chip.id === presentation.selectedDate ? 'is-active' : '',
                chip.isToday ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={chip.id === presentation.selectedDate}
              onClick={() => {
                setSelectedDate(chip.id);
                setCalendarStatus(null);
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="v2-st-controls" role="group" aria-label="Showtimes filters">
        <label className="v2-st-control" htmlFor={theaterFilterId}>
          <span className="v2-st-control-label">Theater</span>
          <select
            id={theaterFilterId}
            className="v2-st-select"
            value={theaterScope ?? ''}
            onChange={(event) => {
              setTheaterScope(event.target.value || null);
              setCalendarStatus(null);
            }}
          >
            <option value="">All theaters</option>
            {presentation.theaterOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </label>

        {presentation.formatOptions.length > 0 ? (
          <label className="v2-st-control" htmlFor={formatFilterId}>
            <span className="v2-st-control-label">Format</span>
            <select
              id={formatFilterId}
              className="v2-st-select"
              value={formatSelectValue}
              onChange={(event) => {
                const next = event.target.value;
                setFormatKeys(next ? [next] : []);
                setCalendarStatus(null);
              }}
            >
              <option value="">Any format</option>
              {presentation.formatOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="v2-st-control" htmlFor={sortFilterId}>
          <span className="v2-st-control-label">Sort</span>
          <select
            id={sortFilterId}
            className="v2-st-select"
            value={sortId}
            onChange={(event) => {
              setSortId(event.target.value === 'theater' ? 'theater' : 'time');
            }}
          >
            {presentation.sortOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {hasMoreFilters ? (
          <button
            type="button"
            className={
              moreOpen || timeRangeId !== 'any'
                ? 'v2-st-more-btn is-active'
                : 'v2-st-more-btn'
            }
            aria-expanded={moreOpen}
            aria-controls={moreFiltersId}
            onClick={() => setMoreOpen((open) => !open)}
          >
            More
          </button>
        ) : null}

        {filtersActive ? (
          <button type="button" className="v2-st-reset" onClick={resetFilters}>
            Reset
          </button>
        ) : null}
      </div>

      {moreOpen && hasMoreFilters ? (
        <div id={moreFiltersId} className="v2-st-more-filters">
          <fieldset className="v2-st-fieldset">
            <legend>Time of day</legend>
            <div className="v2-st-chip-row" role="group" aria-label="Time of day">
              {presentation.timeRangeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    timeRangeId === opt.id
                      ? 'v2-search-chip v2-search-chip-active'
                      : 'v2-search-chip'
                  }
                  aria-pressed={timeRangeId === opt.id}
                  onClick={() => setTimeRangeId(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      {presentation.empty ? (
        <div className="v2-st-empty" role="status">
          <p>{presentation.emptyMessage}</p>
          {filtersActive ? (
            <button type="button" className="v2-st-reset" onClick={resetFilters}>
              Reset filters
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="v2-st-theater-list" role="list">
          {presentation.theaterGroups.map((group) => (
            <li
              key={group.theaterId}
              className={
                group.isBestCard
                  ? 'v2-st-theater-card is-best'
                  : 'v2-st-theater-card'
              }
            >
              {group.isBestCard ? (
                <p className="v2-st-best-option">Best option</p>
              ) : null}
              <div className="v2-st-theater-head">
                {typeof onOpenTheaterDetail === 'function' && group.theaterId ? (
                  <button
                    type="button"
                    className={`v2-st-theater-open v2-st-accent-${group.accent}`}
                    onClick={() =>
                      onOpenTheaterDetail({ theaterId: group.theaterId })
                    }
                    aria-label={`${group.theaterName}, theater details`}
                  >
                    <span
                      className={`v2-st-venue-mark v2-st-venue-mark-${group.venueMark}`}
                      aria-hidden="true"
                    >
                      {group.thumbnailUrl ? (
                        <TheaterVenueImage
                          src={group.thumbnailUrl}
                          className="v2-st-venue-img"
                          fallbackClassName="v2-st-venue-fallback"
                        />
                      ) : (
                        <span className="v2-st-venue-fallback">
                          {group.venueMark}
                        </span>
                      )}
                    </span>
                    <span className="v2-st-theater-copy">
                      <span className="v2-st-theater-name">{group.theaterName}</span>
                      {group.locationLabel ? (
                        <span className="v2-st-theater-loc">
                          {group.locationLabel}
                        </span>
                      ) : null}
                      {group.sharedChips?.length ? (
                        <span className="v2-st-shared-chips">
                          {group.sharedChips.map((chip) => (
                            <span key={chip.label} className="v2-st-shared-chip">
                              {chip.label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="v2-st-theater-chevron" aria-hidden="true">
                      <IconChevron />
                    </span>
                  </button>
                ) : (
                  <div
                    className={`v2-st-theater-open v2-st-theater-open-static v2-st-accent-${group.accent}`}
                  >
                    <span
                      className={`v2-st-venue-mark v2-st-venue-mark-${group.venueMark}`}
                      aria-hidden="true"
                    >
                      {group.thumbnailUrl ? (
                        <TheaterVenueImage
                          src={group.thumbnailUrl}
                          className="v2-st-venue-img"
                          fallbackClassName="v2-st-venue-fallback"
                        />
                      ) : (
                        <span className="v2-st-venue-fallback">
                          {group.venueMark}
                        </span>
                      )}
                    </span>
                    <span className="v2-st-theater-copy">
                      <span className="v2-st-theater-name">{group.theaterName}</span>
                      {group.locationLabel ? (
                        <span className="v2-st-theater-loc">
                          {group.locationLabel}
                        </span>
                      ) : null}
                      {group.sharedChips?.length ? (
                        <span className="v2-st-shared-chips">
                          {group.sharedChips.map((chip) => (
                            <span key={chip.label} className="v2-st-shared-chip">
                              {chip.label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </div>
                )}
              </div>

              <ul className="v2-st-times" role="list">
                {group.times.map((time) => {
                  const className = [
                    'v2-st-time',
                    time.isSelected ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const label = time.detailLabel
                    ? `${time.timeDisplay} · ${time.detailLabel}`
                    : time.timeDisplay;
                  const ariaLabel = `${label} at ${group.theaterName} for ${presentation.title}`;
                  return (
                    <li key={time.opportunityKey}>
                      <button
                        type="button"
                        className={className}
                        aria-pressed={time.isSelected}
                        aria-label={`${ariaLabel} — show actions`}
                        onClick={() => openShowtimeActions(group, time)}
                      >
                        <span className="v2-st-time-label">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="v2-st-timezone" role="note">
        {presentation.timezoneNote}
      </p>

      <div className="v2-st-calendar-bar">
        <div className="v2-st-calendar-copy">
          <p className="v2-st-calendar-kicker">Add to calendar</p>
          <p className="v2-st-calendar-selection">
            {selectedTime
              ? `${selectedTime.theaterName} · ${selectedTime.timeDisplay}${
                  selectedTime.detailLabel ? ` · ${selectedTime.detailLabel}` : ''
                }`
              : 'Select a showtime'}
          </p>
        </div>
        <button
          type="button"
          className="v2-st-calendar"
          onClick={handleExport}
          disabled={!selectedTime}
        >
          Add
        </button>
      </div>
      {calendarStatus ? (
        <p className="v2-fd-muted v2-st-calendar-status" role="status">
          {calendarStatus}
        </p>
      ) : null}

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
