import { parseRuntimeMinutes } from './timeUtils.js';

/**
 * @param {number | string | null | undefined} runtime
 * @returns {string | null}
 */
export function formatRuntimeLabel(runtime) {
  const minutes = parseRuntimeMinutes(runtime);
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

/**
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 * @returns {string | null}
 */
export function formatCountLabel(count, singular, plural) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * @param {string} dateStr - legacy MM/DD/YYYY
 * @returns {Date | null}
 */
export function parseLegacyShowtimeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatShortMonthDay(date, locale) {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/**
 * @param {string[]} dates - legacy MM/DD/YYYY date strings
 * @param {string | string[] | undefined} locale
 * @returns {string | null}
 */
export function formatDateSpanLabel(dates, locale = undefined) {
  if (!dates?.length) return null;

  const parsed = [...new Set(dates)]
    .map(parseLegacyShowtimeDate)
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (parsed.length === 0) return null;
  if (parsed.length === 1) return formatShortMonthDay(parsed[0], locale);

  const start = parsed[0];
  const end = parsed[parsed.length - 1];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startYear === endYear && startMonth === endMonth && startDay === endDay) {
    return formatShortMonthDay(start, locale);
  }

  if (startYear === endYear && startMonth === endMonth) {
    const monthShort = start.toLocaleDateString(locale, { month: 'short' });
    return `${monthShort} ${startDay}–${endDay}`;
  }

  return `${formatShortMonthDay(start, locale)}–${formatShortMonthDay(end, locale)}`;
}

function getVisibleDates(movie, selectedDates) {
  if (selectedDates.length > 0) {
    return selectedDates.filter((date) => movie.showtimes?.[date]);
  }
  return Object.keys(movie.showtimes || {});
}

/**
 * @param {string} dateStr - legacy MM/DD/YYYY
 * @param {string | string[] | undefined} locale
 * @returns {string}
 */
export function formatLegacyDateHeading(dateStr, locale = undefined) {
  const parsed = parseLegacyShowtimeDate(dateStr);
  if (!parsed) return dateStr;
  const weekday = parsed.toLocaleDateString(locale, { weekday: 'long' });
  const shortDate = formatShortMonthDay(parsed, locale);
  return `${weekday}, ${shortDate}`;
}

/**
 * @param {number} showtimeCount
 * @param {number} theaterCount
 * @returns {string | null}
 */
export function formatExpandedShowtimeSummary(showtimeCount, theaterCount) {
  if (!Number.isFinite(showtimeCount) || showtimeCount <= 0) return null;

  const showtimePart =
    showtimeCount === 1 ? '1 showtime' : `${showtimeCount} showtimes`;
  if (!Number.isFinite(theaterCount) || theaterCount <= 0) {
    return `Showing ${showtimePart}`;
  }

  const theaterPart = theaterCount === 1 ? '1 theater' : `${theaterCount} theaters`;
  return `Showing ${showtimePart} across ${theaterPart}`;
}

/**
 * @param {{ showtimes?: Record<string, Record<string, unknown[]>> }} movie
 * @param {{ selectedDates?: string[], selectedTheaters?: string[] }} options
 */
export function collectVisibleShowtimeData(
  movie,
  { selectedDates = [], selectedTheaters = [] } = {},
) {
  const dates = getVisibleDates(movie, selectedDates);
  const theaters = new Set();
  let showtimeCount = 0;
  const dateGroups = [];

  for (const date of dates) {
    const theatersForDate = movie.showtimes?.[date] || {};
    const theaterGroups = [];

    for (const [theater, slots] of Object.entries(theatersForDate)) {
      if (selectedTheaters.length > 0 && !selectedTheaters.includes(theater)) continue;
      theaters.add(theater);
      showtimeCount += slots.length;
      theaterGroups.push({ theater, slots });
    }

    if (theaterGroups.length > 0) {
      theaterGroups.sort((a, b) => a.theater.localeCompare(b.theater));
      dateGroups.push({ date, theaters: theaterGroups });
    }
  }

  dateGroups.sort((a, b) => {
    const dateA = parseLegacyShowtimeDate(a.date);
    const dateB = parseLegacyShowtimeDate(b.date);
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    return a.date.localeCompare(b.date);
  });

  return {
    dates: dateGroups.map((group) => group.date),
    theaterCount: theaters.size,
    showtimeCount,
    dateGroups,
    formats: collectFilmFormats(movie, { selectedDates, selectedTheaters }),
  };
}

/**
 * @param {{ runtime?: number | string, showtimes?: Record<string, Record<string, unknown[]>> }} movie
 * @param {{ selectedDates?: string[], selectedTheaters?: string[] }} options
 */
export function buildExpandedFilmSummary(movie, options = {}, locale = undefined) {
  const visible = collectVisibleShowtimeData(movie, options);
  const runtime = formatRuntimeLabel(movie.runtime);
  const dateSpan = formatDateSpanLabel(visible.dates, locale);
  const theaterLabel = formatCountLabel(visible.theaterCount, 'theater', 'theaters');

  const details = [];
  if (runtime) details.push({ label: 'Runtime', value: runtime });
  if (dateSpan) details.push({ label: 'Dates available', value: dateSpan });
  if (theaterLabel) details.push({ label: 'Theaters', value: theaterLabel });

  return {
    summaryLine: formatExpandedShowtimeSummary(visible.showtimeCount, visible.theaterCount),
    details,
    formats: visible.formats,
    dateGroups: visible.dateGroups,
    showtimeCount: visible.showtimeCount,
    theaterCount: visible.theaterCount,
  };
}

/**
 * Format screening variant type for display as a badge
 * @param {string} variantType
 * @returns {string}
 */
export function formatVariantLabel(variantType) {
  if (!variantType || variantType === 'none' || variantType === 'normal_first_run') {
    return '';
  }
  
  const labels = {
    sensory_friendly: 'Sensory Friendly',
    early_access: 'Early Access',
    opening_night: 'Opening Night',
    fan_event: 'Fan Event',
    anniversary: 'Anniversary',
    double_feature: 'Double Feature',
    format_variant: 'Special Format',
    live_encore: 'Live/Encore',
    special_event: 'Special Event',
    anime_special_engagement: 'Special Engagement',
  };
  
  return labels[variantType] || variantType;
}

/**
 * @param {{ showtimes?: Record<string, Record<string, { premiumFormat?: string, screeningVariant?: string }[]>> }} movie
 * @param {{ selectedDates?: string[], selectedTheaters?: string[] }} options
 * @returns {string[]}
 */
export function collectFilmFormats(movie, { selectedDates = [], selectedTheaters = [] } = {}) {
  const formats = new Set();
  const dates = getVisibleDates(movie, selectedDates);

  for (const date of dates) {
    const theaters = movie.showtimes?.[date] || {};
    for (const [theater, slots] of Object.entries(theaters)) {
      if (selectedTheaters.length > 0 && !selectedTheaters.includes(theater)) continue;
      for (const slot of slots) {
        // Collect premium formats (IMAX, REALD-3D, etc.)
        const format = (slot.premiumFormat || '').trim();
        if (format) formats.add(format);
        
        // Collect screening variants (Sensory Friendly, etc.)
        const variantLabel = formatVariantLabel(slot.screeningVariant || '');
        if (variantLabel) formats.add(variantLabel);
      }
    }
  }

  return [...formats].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {{ film?: string, runtime?: number | string, showtimes?: Record<string, Record<string, unknown[]>> }} movie
 * @param {{ selectedDates?: string[], selectedTheaters?: string[] }} options
 * @returns {{ items: { type: string, text: string }[], formats: string[] }}
 */
export function buildFilmCardMetadata(
  movie,
  { selectedDates = [], selectedTheaters = [] } = {},
  locale = undefined,
) {
  const visible = collectVisibleShowtimeData(movie, { selectedDates, selectedTheaters });

  const items = [];
  const runtime = formatRuntimeLabel(movie.runtime);
  if (runtime) items.push({ type: 'runtime', text: runtime });

  const theaterLabel = formatCountLabel(visible.theaterCount, 'theater', 'theaters');
  if (theaterLabel) items.push({ type: 'theaters', text: theaterLabel });

  const showtimeLabel = formatCountLabel(visible.showtimeCount, 'showtime', 'showtimes');
  if (showtimeLabel) items.push({ type: 'showtimes', text: showtimeLabel });

  const dateSpan = formatDateSpanLabel(visible.dates, locale);
  if (dateSpan) items.push({ type: 'dates', text: dateSpan });

  return { items, formats: visible.formats };
}
