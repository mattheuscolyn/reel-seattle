import { useEffect, useId, useMemo, useState } from 'react';
import {
  calendarExportStatusMessage,
  exportOpportunityToCalendar,
} from '../calendar/exportFromOpportunity.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import {
  EXTERNAL_TICKET_LINK_RELS,
  EXTERNAL_TICKET_LINK_TARGET,
  externalTicketLinkProps,
} from '../ticket/externalTicketUrl.js';
import { composeFilmShowtimesPresentation } from '../showtimes/composeFilmShowtimesPresentation.js';

/**
 * Designed Film Showtimes page — Film Detail → See all showtimes.
 * Live HomeData + canonical film presentation; not a mockup fixture route.
 */
export default function ShowtimesSurface({
  homeData,
  enrichmentIndex = null,
  filmKey,
  theaterId = null,
  opportunityKey = null,
  onBack,
  onOpenTheaterDetail,
}) {
  const titleId = useId();
  const datesId = useId();
  const filtersId = useId();
  const [selectedDate, setSelectedDate] = useState(null);
  const [formatKeys, setFormatKeys] = useState([]);
  const [timeRangeId, setTimeRangeId] = useState('any');
  const [sortId, setSortId] = useState('time');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [theaterScope, setTheaterScope] = useState(theaterId);
  const [selectedKey, setSelectedKey] = useState(opportunityKey);
  const [calendarStatus, setCalendarStatus] = useState(null);

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
  const selectedOpp =
    presentation.selectedOpportunity ??
    presentation.theaterGroups
      .flatMap((g) => g.times)
      .find((t) => t.opportunityKey === selectedKey) ??
    null;

  const hasFilterControls =
    presentation.formatOptions.length > 0 ||
    presentation.timeRangeOptions.length > 1 ||
    presentation.sortOptions.length > 1;

  const filtersActive =
    formatKeys.length > 0 ||
    timeRangeId !== 'any' ||
    sortId !== 'time' ||
    Boolean(theaterScope);

  const handleExport = () => {
    const opp =
      (selectedOpp?.opportunityKey &&
        (homeData?.opportunities ?? []).find(
          (o) => o.opportunityKey === selectedOpp.opportunityKey,
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

  const toggleFormat = (key) => {
    setFormatKeys((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  };

  const resetFilters = () => {
    setFormatKeys([]);
    setTimeRangeId('any');
    setSortId('time');
    setTheaterScope(null);
  };

  return (
    <section className="v2-st" aria-labelledby={titleId}>
      <button type="button" className="v2-film-detail-back" onClick={onBack}>
        ← Back
      </button>

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
        </div>
      </header>

      {theaterScope ? (
        <p className="v2-st-filter" role="status">
          Showing{' '}
          {presentation.theaterGroups[0]?.theaterName ?? 'one theater'}.{' '}
          <button
            type="button"
            className="v2-st-reset"
            onClick={() => setTheaterScope(null)}
          >
            Show all theaters
          </button>
        </p>
      ) : null}

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
              className={
                chip.id === presentation.selectedDate
                  ? 'v2-search-chip v2-search-chip-active'
                  : 'v2-search-chip'
              }
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

      {hasFilterControls ? (
        <div className="v2-st-filter-bar">
          <button
            type="button"
            className={
              filtersOpen || filtersActive
                ? 'v2-st-filter-btn is-active'
                : 'v2-st-filter-btn'
            }
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{filtersActive ? ' · on' : ''}
          </button>
          {filtersActive ? (
            <button type="button" className="v2-st-reset" onClick={resetFilters}>
              Reset
            </button>
          ) : null}
        </div>
      ) : null}

      {filtersOpen && hasFilterControls ? (
        <div id={filtersId} className="v2-st-filters">
          {presentation.formatOptions.length > 0 ? (
            <fieldset className="v2-st-fieldset">
              <legend>Format</legend>
              <div className="v2-st-chip-row" role="group" aria-label="Formats">
                {presentation.formatOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={
                      formatKeys.includes(opt.key)
                        ? 'v2-search-chip v2-search-chip-active'
                        : 'v2-search-chip'
                    }
                    aria-pressed={formatKeys.includes(opt.key)}
                    onClick={() => toggleFormat(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
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
          <fieldset className="v2-st-fieldset">
            <legend>Sort</legend>
            <div className="v2-st-chip-row" role="group" aria-label="Sort">
              {presentation.sortOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    sortId === opt.id
                      ? 'v2-search-chip v2-search-chip-active'
                      : 'v2-search-chip'
                  }
                  aria-pressed={sortId === opt.id}
                  onClick={() => setSortId(opt.id)}
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
            <li key={group.theaterId} className="v2-st-theater">
              {typeof onOpenTheaterDetail === 'function' && group.theaterId ? (
                <button
                  type="button"
                  className="v2-st-theater-name"
                  onClick={() =>
                    onOpenTheaterDetail({ theaterId: group.theaterId })
                  }
                >
                  <span className="v2-st-theater-bullet" aria-hidden="true">
                    •
                  </span>
                  <span className="v2-st-theater-label">{group.theaterName}</span>
                </button>
              ) : (
                <h2 className="v2-st-theater-name-static">
                  <span className="v2-st-theater-bullet" aria-hidden="true">
                    •
                  </span>
                  <span className="v2-st-theater-label">{group.theaterName}</span>
                </h2>
              )}
              <ul className="v2-st-times" role="list">
                {group.times.map((time) => {
                  const ticket = externalTicketLinkProps(time.ticketUrl);
                  const className = [
                    'v2-st-time',
                    time.isSelected ? 'is-selected' : '',
                    time.isBest ? 'is-best' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const label = time.detailLabel
                    ? `${time.timeDisplay} · ${time.detailLabel}`
                    : time.timeDisplay;
                  const selectTime = () => {
                    setSelectedKey(time.opportunityKey);
                    setCalendarStatus(null);
                  };
                  return (
                    <li key={time.opportunityKey}>
                      {ticket ? (
                        <a
                          className={className}
                          href={ticket.href}
                          target={EXTERNAL_TICKET_LINK_TARGET}
                          rel={EXTERNAL_TICKET_LINK_RELS}
                          aria-label={`${label}${
                            time.isBest ? ', best option' : ''
                          } — opens ticket site in a new tab`}
                          onClick={selectTime}
                        >
                          {time.isBest ? (
                            <span className="v2-st-best-tag">Best</span>
                          ) : null}
                          <span className="v2-st-time-label">{label}</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          className={className}
                          aria-pressed={time.isSelected}
                          aria-label={`${label}${
                            time.isBest ? ', best option' : ''
                          }`}
                          onClick={selectTime}
                        >
                          {time.isBest ? (
                            <span className="v2-st-best-tag">Best</span>
                          ) : null}
                          <span className="v2-st-time-label">{label}</span>
                        </button>
                      )}
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

      <div className="v2-st-actions">
        <button type="button" className="v2-st-calendar" onClick={handleExport}>
          Add to calendar
        </button>
        {calendarStatus ? (
          <p className="v2-fd-muted" role="status">
            {calendarStatus}
          </p>
        ) : null}
      </div>
    </section>
  );
}
