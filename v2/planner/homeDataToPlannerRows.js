/**
 * Map HomeData opportunities to legacy plannerEngine showtimes rows (T-PENG-01).
 *
 * Engine equality is string Date + parseable Time; we emit ISO dates and
 * compact 12h Times. Live-only fields needed for accept/ICS stay on the row.
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Convert HH:MM (24h) to compact legacy Time (`7:00PM`).
 * @param {string} hhmm
 * @returns {string | null}
 */
export function hhmmToLegacyPlannerTime(hhmm) {
  const raw = asTrimmed(hhmm);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    // Already legacy-ish (e.g. 7:00PM)
    if (/[ap]m/i.test(raw)) return raw.replace(/\s+/g, '');
    return null;
  }
  let hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes}${period}`;
}

/**
 * @param {object | null | undefined} homeData
 * @returns {object[]}
 */
export function homeDataToPlannerRows(homeData) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const filmsByKey = new Map(
    (Array.isArray(homeData?.films) ? homeData.films : []).map((f) => [
      f.filmKey,
      f,
    ]),
  );

  /** @type {object[]} */
  const rows = [];
  for (const opp of opportunities) {
    if (!opp || typeof opp !== 'object') continue;
    const film = filmsByKey.get(opp.filmKey) ?? null;
    const title = asTrimmed(film?.title) ?? asTrimmed(opp.title);
    const localDate = asTrimmed(opp.localDate);
    const localTime = asTrimmed(opp.localTime);
    const legacyTime = hhmmToLegacyPlannerTime(localTime);
    const theaterId = asTrimmed(opp.theaterId);
    const runtime =
      typeof film?.runtimeMin === 'number' && Number.isFinite(film.runtimeMin)
        ? film.runtimeMin
        : typeof opp.runtimeMin === 'number' && Number.isFinite(opp.runtimeMin)
          ? opp.runtimeMin
          : null;

    if (!title || !localDate || !legacyTime || !theaterId || runtime == null) {
      continue;
    }

    const formatLabels = Array.isArray(opp.formatLabels)
      ? opp.formatLabels.map((t) => String(t).trim()).filter(Boolean)
      : [];

    rows.push({
      Date: localDate,
      Time: legacyTime,
      Film: title,
      Theater: asTrimmed(opp.theaterName) ?? theaterId,
      theater_id: theaterId,
      Runtime: runtime,
      showtime_film_key: asTrimmed(opp.filmKey) ?? asTrimmed(film?.filmKey),
      posterDynamic: asTrimmed(film?.posterUrl) ?? null,
      premiumFormat: formatLabels.join(', '),
      status: asTrimmed(opp.status),
      // Live accept / ICS fields
      filmKey: asTrimmed(opp.filmKey),
      filmId: film?.filmId ?? null,
      parentFilmKey: film?.parentFilmKey ?? null,
      parent_film_key: film?.parentFilmKey ?? null,
      localDate,
      localTime,
      source: asTrimmed(opp.source),
      source_showtime_id: asTrimmed(opp.sourceShowtimeId),
      opportunityKey: asTrimmed(opp.opportunityKey),
      ticket_url: opp.ticketUrl ?? null,
      formatLabels,
    });
  }

  return rows;
}
