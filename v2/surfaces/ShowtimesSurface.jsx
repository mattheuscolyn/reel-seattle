import { useMemo, useState } from 'react';
import {
  calendarExportStatusMessage,
  exportOpportunityToCalendar,
} from '../calendar/exportFromOpportunity.js';
import {
  listFilmOpportunities,
  opportunityFormatLabel,
  resolveFilm,
  screeningVariantLabel,
} from '../filmDetail/filmDetailModel.js';
import { formatLocalDateLabel } from '../topOpportunities/topOpportunityFormat.js';
import { pacificDateString } from '../explore/exploreCatalog.js';

/**
 * Film-scoped showtimes surface (multi-day).
 * Uses parent-family opportunities so special screenings share the canonical film.
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

  const displayTitle =
    film?.parentDisplayTitle || film?.title || 'Showtimes';

  return (
    <section className="v2-st" aria-labelledby="v2-st-title">
      <button type="button" className="v2-film-detail-back" onClick={onBack}>
        ← Back
      </button>
      <p className="v2-destination-eyebrow">Showtimes</p>
      <h1 id="v2-st-title">{displayTitle}</h1>
      {theaterId ? (
        <p className="v2-st-filter" role="status">
          Filtered to one theater.
        </p>
      ) : null}

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
      ) : null}

      {filtered.length === 0 ? (
        <p className="v2-fd-muted" role="status">
          No showtimes for this date in the current window.
        </p>
      ) : (
        <ul className="v2-st-theater-list" role="list">
          {[...byTheater.entries()].map(([id, rows]) => (
            <li key={id} className="v2-st-theater">
              <h2 className="v2-st-theater-name">
                {rows[0]?.theaterName ?? 'Theater'}
              </h2>
              <ul className="v2-st-times" role="list">
                {rows.map((opp) => {
                  const variant = screeningVariantLabel(opp.screeningVariantType);
                  const format = opportunityFormatLabel(opp);
                  const chips = [variant, format].filter(Boolean);
                  const selected = opp.opportunityKey === selectedOpp?.opportunityKey;
                  return (
                    <li key={opp.opportunityKey}>
                      <button
                        type="button"
                        className={
                          selected
                            ? 'v2-st-time v2-st-time-selected'
                            : 'v2-st-time'
                        }
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedKey(opp.opportunityKey);
                          onOpenOpportunity?.(opp);
                        }}
                      >
                        <span className="v2-st-time-label">{opp.timeDisplay}</span>
                        {chips.length > 0 ? (
                          <span className="v2-st-time-chips">
                            {chips.map((chip) => (
                              <span key={chip} className="v2-st-chip">
                                {chip}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="v2-st-actions">
        <button type="button" className="v2-fd-primary" onClick={handleExport}>
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
