import { useMemo, useState } from 'react';
import {
  calendarExportStatusMessage,
  exportOpportunityToCalendar,
} from '../calendar/exportFromOpportunity.js';
import {
  listFilmOpportunities,
  opportunityFormatLabel,
  resolveFilm,
} from '../filmDetail/filmDetailModel.js';
import { formatLocalDateLabel } from '../topOpportunities/topOpportunityFormat.js';
import { pacificDateString } from '../explore/exploreCatalog.js';

/**
 * Film-prefiltered showtimes scaffold — not final showtime page design.
 * T-CAL-02: selected performance can download a local .ics file.
 */
export default function ShowtimesSurface({
  homeData,
  filmKey,
  theaterId = null,
  opportunityKey = null,
  onBack,
  onOpenOpportunity,
}) {
  const film = resolveFilm(homeData, filmKey);
  const today = pacificDateString();
  const opps = useMemo(
    () => listFilmOpportunities(homeData, filmKey),
    [homeData, filmKey],
  );
  const dates = useMemo(() => {
    const set = new Set(opps.map((o) => o.localDate).filter(Boolean));
    return [...set].sort();
  }, [opps]);
  const [date, setDate] = useState(
    dates.includes(today) ? today : dates[0] ?? today,
  );
  const [selectedKey, setSelectedKey] = useState(opportunityKey);
  const [calendarStatus, setCalendarStatus] = useState(null);

  const filtered = opps.filter((o) => {
    if (o.localDate !== date) return false;
    if (theaterId && o.theaterId !== theaterId) return false;
    return true;
  });

  /** @type {Map<string, object[]>} */
  const byTheater = new Map();
  for (const opp of filtered) {
    const id = opp.theaterId ?? opp.theaterName;
    if (!byTheater.has(id)) byTheater.set(id, []);
    byTheater.get(id).push(opp);
  }

  const selectedOpp =
    filtered.find((o) => o.opportunityKey === selectedKey) ??
    filtered.find((o) => o.opportunityKey === opportunityKey) ??
    null;

  const handleExport = () => {
    if (!selectedOpp) {
      setCalendarStatus('Select a showtime to add to your calendar.');
      return;
    }
    const result = exportOpportunityToCalendar({
      opportunity: selectedOpp,
      film,
      homeData,
    });
    setCalendarStatus(calendarExportStatusMessage(result));
  };

  return (
    <section className="v2-st" aria-labelledby="v2-st-title">
      <button type="button" className="v2-film-detail-back" onClick={onBack}>
        ← Back
      </button>
      <p className="v2-destination-eyebrow">Showtimes · scaffold</p>
      <h1 id="v2-st-title">{film?.title ?? 'Showtimes'}</h1>
      <p className="v2-st-filter" role="status">
        Film filter active
        {theaterId ? ' · theater preselected' : ''}. Full showtime page design
        is deferred.
      </p>

      {dates.length > 0 ? (
        <div className="v2-st-dates" role="toolbar" aria-label="Dates">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              className={
                d === date ? 'v2-search-chip v2-search-chip-active' : 'v2-search-chip'
              }
              aria-pressed={d === date}
              onClick={() => setDate(d)}
            >
              {formatLocalDateLabel(d) ?? d}
            </button>
          ))}
        </div>
      ) : (
        <p className="v2-fd-muted" role="status">
          No showtimes in the current window.
        </p>
      )}

      <ul className="v2-st-list" role="list">
        {[...byTheater.entries()].map(([id, list]) => (
          <li key={id} className="v2-st-theater">
            <h2 className="v2-st-theater-name">{list[0].theaterName}</h2>
            <div className="v2-st-times">
              {list.map((opp) => (
                <button
                  key={opp.opportunityKey}
                  type="button"
                  className={
                    opp.opportunityKey === (selectedKey ?? opportunityKey)
                      ? 'v2-st-time v2-st-time-on'
                      : 'v2-st-time'
                  }
                  onClick={() => {
                    setSelectedKey(opp.opportunityKey);
                    onOpenOpportunity?.({
                      filmKey,
                      opportunityKey: opp.opportunityKey,
                    });
                  }}
                >
                  {opp.timeDisplay}
                  {opportunityFormatLabel(opp)
                    ? ` · ${opportunityFormatLabel(opp)}`
                    : ''}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {filtered.length > 0 ? (
        <div className="v2-st-export">
          <button
            type="button"
            className="v2-fd-link v2-fd-calendar-export"
            aria-label="Add selected showtime to calendar"
            disabled={!selectedOpp}
            onClick={handleExport}
          >
            Add to calendar
          </button>
          {calendarStatus ? (
            <p className="v2-fd-calendar-status" role="status">
              {calendarStatus}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="v2-fd-tz">All times in PT</p>
    </section>
  );
}
