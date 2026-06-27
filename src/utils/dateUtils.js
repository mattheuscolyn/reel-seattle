/** Whether a legacy MM/DD/YYYY date string is today or later. */
export function isTodayOrFuture(dateStr) {
  const [month, day, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC midnight shifts). */
export function parseIsoDateLocal(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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

function formatMonthDay(date, locale) {
  return date.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
}

function formatMonthDayYear(date, locale) {
  return date.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Human-readable range from ISO start/end dates, e.g. "June 26–July 10".
 * Returns empty string when dates are missing or invalid.
 */
export function formatDateRange(startIso, endIso, locale = undefined) {
  const start = parseIsoDateLocal(startIso);
  const end = parseIsoDateLocal(endIso);
  if (!start || !end) return '';

  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startYear === endYear && startMonth === endMonth && startDay === endDay) {
    return formatMonthDay(start, locale);
  }

  if (startYear !== endYear) {
    return `${formatMonthDayYear(start, locale)}–${formatMonthDayYear(end, locale)}`;
  }

  if (startMonth === endMonth) {
    const monthName = start.toLocaleDateString(locale, { month: 'long' });
    return `${monthName} ${startDay}–${endDay}`;
  }

  return `${formatMonthDay(start, locale)}–${formatMonthDay(end, locale)}`;
}
