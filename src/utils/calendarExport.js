/**
 * Add-to-calendar export contract (T-CAL-01 / D09).
 *
 * Local-only ICS generation for a single real showtime or a validated
 * multi-film plan. No Google/Apple APIs, OAuth, permissions, or sync.
 *
 * Event start = advertised showtime (not shifted by preshow).
 * Event end = advertised start + D17 15-minute preshow + runtime
 * (via `calculateExpectedEndTime`). Missing runtime fails explicitly.
 *
 * UID precedence (deterministic; never wall-clock / random):
 * 1. Public showtime ID
 * 2. source + source_showtime_id (+ theater when present)
 * 3. Composite filmKey + theaterId + start instant
 *
 * Plan export: one VEVENT per film; fail the whole plan if any item is
 * incomplete (no misleading partial calendars). Breaks are not events.
 */

import { calculateExpectedEndTime } from './plannerBufferPolicy.js';
import {
  MINUTES_PER_DAY,
  formatMinutesToTime,
  parsePlannerShowtimeMinutes,
  parseRuntimeMinutes,
  parseTimeToMinutes,
} from './timeUtils.js';

export const CALENDAR_TIMEZONE = 'America/Los_Angeles';
export const CALENDAR_PRODID = '-//Reel Seattle//Calendar Export 1.0//EN';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeTicketUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

/**
 * @typedef {{
 *   uid: string,
 *   title: string,
 *   start: Date,
 *   end: Date,
 *   timezone: string,
 *   location: string | null,
 *   description: string | null,
 *   url: string | null,
 *   categories: string[],
 * }} CalendarEvent
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asRequiredString(value) {
  return asOptionalString(value);
}

/**
 * Parse calendar date to { year, month, day } (1-based month).
 * Accepts YYYY-MM-DD or MM/DD/YYYY (legacy planner rows).
 * @param {unknown} value
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseCalendarDateParts(value) {
  const raw = asOptionalString(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }
  return null;
}

/**
 * Offset of `instant` in `timeZone`: localAsUtcMs − instantMs.
 * @param {Date} instant
 * @param {string} timeZone
 */
function getTimeZoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert Pacific wall-clock components to a real UTC Date.
 * Handles DST by iterating the offset twice.
 *
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day
 * @param {number} hour 0–23
 * @param {number} minute
 * @param {string} [timeZone]
 * @returns {Date}
 */
export function pacificWallTimeToUtcDate(
  year,
  month,
  day,
  hour,
  minute,
  timeZone = CALENDAR_TIMEZONE,
) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utcMs);
}

/**
 * @param {{ year: number, month: number, day: number }} dateParts
 * @param {number} extendedMinutes — planner extended minutes (may be ≥ 1440)
 * @param {string} [timeZone]
 */
export function extendedMinutesToUtcDate(
  dateParts,
  extendedMinutes,
  timeZone = CALENDAR_TIMEZONE,
) {
  const dayOffset = Math.floor(extendedMinutes / MINUTES_PER_DAY);
  const withinDay =
    ((extendedMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(withinDay / 60);
  const minute = withinDay % 60;
  const base = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day);
  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return pacificWallTimeToUtcDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    hour,
    minute,
    timeZone,
  );
}

/**
 * @param {string} value
 */
function slugifyFilenamePart(value) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || 'event';
}

/**
 * @param {Date} date
 * @param {string} [timeZone]
 */
function pacificDateSlug(date, timeZone = CALENDAR_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Escape text for ICS TEXT values.
 * @param {string} value
 */
export function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Fold an ICS content line to ≤75 octets (UTF-8), CRLF continuations.
 * @param {string} line
 */
export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  /** @type {string[]} */
  const chunks = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const limit = first ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    // Do not split a multibyte UTF-8 sequence.
    while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(start + limit, bytes.length);
    const slice = bytes.slice(start, end);
    const text = new TextDecoder().decode(slice);
    chunks.push(first ? text : ` ${text}`);
    first = false;
    start = end;
  }
  return chunks.join('\r\n');
}

/**
 * @param {Date} date
 */
export function formatIcsUtcStamp(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
function resolveTitle(input) {
  if (!input || typeof input !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  const base =
    asRequiredString(record.title) ??
    asRequiredString(record.film) ??
    asRequiredString(record.Film) ??
    asRequiredString(record.displayTitle);
  if (!base) return null;

  const format =
    asOptionalString(record.formatLabel) ??
    asOptionalString(record.format) ??
    asOptionalString(record.premiumFormat) ??
    (Array.isArray(record.formatTags) && record.formatTags.length === 1
      ? asOptionalString(record.formatTags[0])
      : null);

  if (!format) return base;
  // Avoid duplicating a format already present in the title.
  if (base.toLowerCase().includes(format.toLowerCase())) return base;
  return `${base} — ${format}`;
}

/**
 * @param {unknown} input
 */
function resolveTheaterName(input) {
  if (!input || typeof input !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  return (
    asOptionalString(record.theaterName) ??
    asOptionalString(record.theater) ??
    asOptionalString(record.Theater) ??
    asOptionalString(record.location)
  );
}

/**
 * @param {unknown} input
 */
function resolveTheaterId(input) {
  if (!input || typeof input !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  return (
    asOptionalString(record.theaterId) ??
    asOptionalString(record.theater_id) ??
    null
  );
}

/**
 * @param {unknown} input
 */
function resolveFilmKey(input) {
  if (!input || typeof input !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  return (
    asOptionalString(record.filmKey) ??
    asOptionalString(record.showtime_film_key) ??
    asOptionalString(record.showtimeFilmKey) ??
    null
  );
}

/**
 * @param {unknown} input
 */
function resolveAddress(input) {
  if (!input || typeof input !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  // Only trusted registry address fields — never invent.
  return (
    asOptionalString(record.address) ??
    asOptionalString(record.streetAddress) ??
    null
  );
}

/**
 * @param {unknown} input
 */
function resolveTicketUrl(input) {
  if (!input || typeof input !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  return normalizeTicketUrl(
    record.ticketUrl ?? record.ticket_url ?? record.url,
  );
}

/**
 * Deterministic showtime UID. Never uses export clock or random values.
 * @param {unknown} input
 * @param {Date} start
 */
export function buildShowtimeCalendarUid(input, start) {
  const record =
    input && typeof input === 'object'
      ? /** @type {Record<string, unknown>} */ (input)
      : {};

  const publicId =
    asOptionalString(record.publicShowtimeId) ??
    asOptionalString(record.public_showtime_id) ??
    asOptionalString(record.showtimeId);
  if (publicId) return `reel-seattle-showtime-${slugifyFilenamePart(publicId)}@reelseattle.app`;

  const source = asOptionalString(record.source);
  const sourceShowtimeId =
    asOptionalString(record.sourceShowtimeId) ??
    asOptionalString(record.source_showtime_id);
  if (source && sourceShowtimeId) {
    const theater = resolveTheaterId(record) ?? 'theater';
    return `reel-seattle-src-${slugifyFilenamePart(source)}-${slugifyFilenamePart(theater)}-${slugifyFilenamePart(sourceShowtimeId)}@reelseattle.app`;
  }

  const filmKey = resolveFilmKey(record) ?? 'film';
  const theaterId = resolveTheaterId(record) ?? 'theater';
  const startKey = formatIcsUtcStamp(start).toLowerCase();
  return `reel-seattle-composite-${slugifyFilenamePart(filmKey)}-${slugifyFilenamePart(theaterId)}-${startKey}@reelseattle.app`;
}

/**
 * @param {unknown} input
 * @param {{ now?: () => Date, planLabel?: string | null, planId?: string | null }} [options]
 * @returns {{
 *   ok: true,
 *   event: CalendarEvent,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
export function buildShowtimeCalendarEvent(input, options = {}) {
  if (!input || typeof input !== 'object') {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Showtime input is required.',
      },
    };
  }

  const record = /** @type {Record<string, unknown>} */ (input);
  const title = resolveTitle(record);
  if (!title) {
    return {
      ok: false,
      error: { code: 'missing_title', message: 'Film title is required.' },
    };
  }

  const dateParts = parseCalendarDateParts(
    record.date ?? record.Date ?? record.showDate,
  );
  if (!dateParts) {
    return {
      ok: false,
      error: {
        code: 'invalid_timestamp',
        message: 'A valid calendar date is required.',
      },
    };
  }

  const timeStr =
    asOptionalString(record.time) ??
    asOptionalString(record.Time) ??
    asOptionalString(record.startTime);
  let startMin =
    typeof record.startMin === 'number' && Number.isFinite(record.startMin)
      ? record.startMin
      : null;
  if (startMin == null) {
    if (!timeStr) {
      return {
        ok: false,
        error: {
          code: 'invalid_timestamp',
          message: 'A valid advertised showtime is required.',
        },
      };
    }
    startMin =
      parsePlannerShowtimeMinutes(timeStr) ?? parseTimeToMinutes(timeStr);
  }
  if (startMin == null) {
    return {
      ok: false,
      error: {
        code: 'invalid_timestamp',
        message: 'Could not parse advertised showtime.',
      },
    };
  }

  const runtime = parseRuntimeMinutes(
    record.runtime ?? record.Runtime ?? record.runtimeMinutes,
  );
  if (runtime == null) {
    return {
      ok: false,
      error: {
        code: 'missing_runtime',
        message: 'Runtime is required to compute a calendar end time.',
      },
    };
  }

  const filmKey = resolveFilmKey(record);
  const theaterId = resolveTheaterId(record);
  const hasIdentity = Boolean(
    asOptionalString(record.publicShowtimeId) ||
      asOptionalString(record.public_showtime_id) ||
      (asOptionalString(record.source) &&
        (asOptionalString(record.sourceShowtimeId) ||
          asOptionalString(record.source_showtime_id))) ||
      (filmKey && theaterId),
  );
  if (!hasIdentity) {
    return {
      ok: false,
      error: {
        code: 'missing_identity',
        message:
          'A public showtime id, source showtime id, or film+theater identity is required.',
      },
    };
  }

  const expected = calculateExpectedEndTime(
    { startMin, runtime },
    runtime,
  );
  if (!expected.ok || expected.endMin == null) {
    return {
      ok: false,
      error: {
        code: expected.error ?? 'invalid_end',
        message: 'Could not compute expected end time.',
      },
    };
  }

  const start = extendedMinutesToUtcDate(dateParts, startMin);
  const end = extendedMinutesToUtcDate(dateParts, expected.endMin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      ok: false,
      error: {
        code: 'invalid_timestamp',
        message: 'Computed start or end is invalid.',
      },
    };
  }

  const theaterName = resolveTheaterName(record);
  const address = resolveAddress(record);
  const location = [theaterName, address].filter(Boolean).join(', ') || null;
  const ticketUrl = resolveTicketUrl(record);
  const advertisedLabel =
    timeStr ?? formatMinutesToTime(startMin, { showNextDayOffset: true });

  /** @type {string[]} */
  const descriptionParts = [];
  if (theaterName) descriptionParts.push(`Theater: ${theaterName}`);
  const format =
    asOptionalString(record.formatLabel) ??
    asOptionalString(record.format) ??
    asOptionalString(record.premiumFormat);
  if (format) descriptionParts.push(`Format: ${format}`);
  descriptionParts.push(`Advertised showtime: ${advertisedLabel} PT`);
  if (ticketUrl) descriptionParts.push(`Tickets: ${ticketUrl}`);
  if (options.planLabel) {
    descriptionParts.unshift(`Reel Seattle plan: ${options.planLabel}`);
  }
  const deepLink = asOptionalString(record.reelSeattleUrl);
  if (deepLink) descriptionParts.push(`Reel Seattle: ${deepLink}`);

  let uid = buildShowtimeCalendarUid(record, start);
  if (options.planId) {
    uid = `reel-seattle-plan-${slugifyFilenamePart(String(options.planId))}-${uid}`;
  }

  /** @type {CalendarEvent} */
  const event = {
    uid,
    title,
    start,
    end,
    timezone: CALENDAR_TIMEZONE,
    location,
    description: descriptionParts.length ? descriptionParts.join('\n') : null,
    url: ticketUrl,
    categories: ['Movie'],
  };

  return { ok: true, event };
}

/**
 * @param {unknown} plan
 * @param {{ now?: () => Date }} [options]
 * @returns {{
 *   ok: true,
 *   events: CalendarEvent[],
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
export function buildPlanCalendarEvents(plan, options = {}) {
  if (!plan || typeof plan !== 'object') {
    return {
      ok: false,
      error: { code: 'empty_plan', message: 'Plan is required.' },
    };
  }
  const record = /** @type {Record<string, unknown>} */ (plan);
  const items = Array.isArray(record.movies)
    ? record.movies
    : Array.isArray(record.films)
      ? record.films
      : Array.isArray(record.items)
        ? record.items
        : null;

  if (!items || items.length === 0) {
    return {
      ok: false,
      error: { code: 'empty_plan', message: 'Plan has no films to export.' },
    };
  }

  const planLabel =
    asOptionalString(record.title) ??
    asOptionalString(record.planTitle) ??
    'Movie day';
  const planId =
    asOptionalString(record.planId) ??
    asOptionalString(record.id) ??
    null;

  /** @type {CalendarEvent[]} */
  const events = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const built = buildShowtimeCalendarEvent(item, {
      now: options.now,
      planLabel,
      planId: planId ?? `anon-${items.length}`,
    });
    if (!built.ok) {
      return {
        ok: false,
        error: {
          code: 'invalid_plan_item',
          message: `Plan item ${index + 1} failed: ${built.error.message}`,
        },
      };
    }
    events.push(built.event);
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.uid.localeCompare(b.uid));
  return { ok: true, events };
}

/**
 * Serialize calendar events to ICS text (CRLF).
 *
 * @param {CalendarEvent[]} events
 * @param {{ now?: () => Date, prodId?: string }} [options]
 * @returns {string}
 */
export function serializeCalendar(events, options = {}) {
  const nowFn = options.now ?? (() => new Date());
  const stamp = formatIcsUtcStamp(nowFn());
  const prodId = options.prodId ?? CALENDAR_PRODID;
  const ordered = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.uid.localeCompare(b.uid),
  );

  /** @type {string[]} */
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of ordered) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(event.uid)}`);
    lines.push(`DTSTAMP:${stamp}`);
    // Absolute UTC — not naive local mislabeled as Z.
    lines.push(`DTSTART:${formatIcsUtcStamp(event.start)}`);
    lines.push(`DTEND:${formatIcsUtcStamp(event.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    if (event.url) {
      lines.push(`URL:${escapeIcsText(event.url)}`);
    }
    if (event.categories?.length) {
      lines.push(
        `CATEGORIES:${event.categories.map((c) => escapeIcsText(c)).join(',')}`,
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/**
 * @param {CalendarEvent[]} events
 * @param {{ kind?: 'showtime' | 'plan', titleHint?: string | null }} [options]
 */
export function buildCalendarFilename(events, options = {}) {
  const first = events[0];
  const dateSlug = first
    ? pacificDateSlug(first.start)
    : 'event';
  if (options.kind === 'plan' || events.length > 1) {
    return `reel-seattle-movie-plan-${dateSlug}.ics`;
  }
  const titleHint =
    options.titleHint ??
    first?.title ??
    'showtime';
  // Strip optional format suffix for a cleaner filename.
  const baseTitle = String(titleHint).split(' — ')[0];
  return `reel-seattle-${slugifyFilenamePart(baseTitle)}-${dateSlug}.ics`;
}

/**
 * Build a complete downloadable calendar payload (no network, no permissions).
 *
 * @param {CalendarEvent[] | unknown} eventsOrInput
 * @param {{
 *   now?: () => Date,
 *   kind?: 'showtime' | 'plan',
 *   titleHint?: string | null,
 *   filename?: string | null,
 * }} [options]
 */
export function buildCalendarDownload(eventsOrInput, options = {}) {
  /** @type {CalendarEvent[]} */
  let events;
  if (Array.isArray(eventsOrInput)) {
    events = eventsOrInput;
  } else {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Events array is required.',
      },
    };
  }

  if (!events.length) {
    return {
      ok: false,
      error: { code: 'empty_plan', message: 'No calendar events to export.' },
    };
  }

  const ics = serializeCalendar(events, { now: options.now });
  const filename =
    asOptionalString(options.filename) ??
    buildCalendarFilename(events, {
      kind: options.kind,
      titleHint: options.titleHint,
    });

  return {
    ok: true,
    events,
    ics,
    filename,
    mimeType: 'text/calendar;charset=utf-8',
  };
}

/**
 * Convenience: showtime → download payload.
 * @param {unknown} input
 * @param {{ now?: () => Date }} [options]
 */
export function buildShowtimeCalendarDownload(input, options = {}) {
  const built = buildShowtimeCalendarEvent(input, options);
  if (!built.ok) return built;
  return buildCalendarDownload([built.event], {
    now: options.now,
    kind: 'showtime',
    titleHint: built.event.title,
  });
}

/**
 * Convenience: plan → download payload. Fails closed on any invalid item.
 * @param {unknown} plan
 * @param {{ now?: () => Date }} [options]
 */
export function buildPlanCalendarDownload(plan, options = {}) {
  const built = buildPlanCalendarEvents(plan, options);
  if (!built.ok) return built;
  return buildCalendarDownload(built.events, {
    now: options.now,
    kind: 'plan',
  });
}

/**
 * Optional browser helper. Does not run unless document is available.
 * Never requests calendar permissions or calls external APIs.
 *
 * @param {{ ics: string, filename: string, mimeType?: string }} payload
 * @returns {boolean}
 */
export function triggerCalendarFileDownload(payload) {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      return false;
    }
    const blob = new Blob([payload.ics], {
      type: payload.mimeType ?? 'text/calendar;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = payload.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    return true;
  } catch {
    return false;
  }
}
