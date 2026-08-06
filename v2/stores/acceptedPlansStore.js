/**
 * Versioned Accepted Plans store (T-PLAN-01 / G12).
 *
 * Device-local persistence for showtime-backed itineraries the user accepts
 * from Plan Results. Distinct from Saved/Seen/Not interested, Favorite
 * Theaters, drafts, and calendar sync. Cloud sync (when schedule-attached)
 * is handled by `v2/auth/scheduleSync.js` via the mutation bridge.
 *
 * Rules:
 * - Only `provenance: 'live'` plans may persist (never fixture IDs).
 * - Performance identity is not title-only.
 * - Snapshots are factual; HomeData is not rewritten into them on load.
 * - Duplicate acceptance of the same itinerary is idempotent.
 */

import {
  extendedMinutesToUtcDate,
  parseCalendarDateParts,
  parseCalendarShowtimeMinutes,
} from '../../src/utils/calendarExport.js';
import {
  calculateExpectedEndTime,
  PLANNER_BUFFER_POLICY_V1,
} from '../../src/utils/plannerBufferPolicy.js';
import { parseRuntimeMinutes } from '../../src/utils/timeUtils.js';
import { notifyScheduleStoreMutation } from '../auth/scheduleStoreMutationBridge.js';

export const ACCEPTED_PLANS_STORAGE_KEY = 'reel-seattle.v2.acceptedPlans';
export const ACCEPTED_PLANS_VERSION = 1;
export const ACCEPTED_PLANS_MAX = 50;
export const ACCEPTED_PLANS_TIMEZONE = 'America/Los_Angeles';

/**
 * @typedef {{
 *   performanceKey: string,
 *   filmId: string | null,
 *   filmKey: string | null,
 *   parentFilmKey?: string | null,
 *   title: string,
 *   theaterId: string,
 *   theaterName: string,
 *   source: string | null,
 *   sourceShowtimeId: string | null,
 *   opportunityKey: string | null,
 *   localDate: string,
 *   localTime: string,
 *   startsAt: string,
 *   expectedEndsAt: string,
 *   runtimeMin: number,
 *   format: string | null,
 *   ticketUrl: string | null,
 *   addressLabel: string | null,
 *   posterUrl: string | null,
 * }} AcceptedPlanPerformance
 */

/**
 * @typedef {{
 *   planId: string,
 *   acceptedAt: string,
 *   label: string | null,
 *   date: string,
 *   timezone: string,
 *   provenance: 'live',
 *   performances: AcceptedPlanPerformance[],
 *   settingsSnapshot: Record<string, unknown> | null,
 * }} AcceptedPlanItem
 */

/**
 * @typedef {{
 *   version: number,
 *   items: AcceptedPlanItem[],
 * }} AcceptedPlansStorePayload
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   store: AcceptedPlansStorePayload,
 *   error?: string | null,
 *   changed?: boolean,
 *   plan?: AcceptedPlanItem | null,
 * }} AcceptedPlansWriteResult
 */

/**
 * @typedef {{
 *   store: AcceptedPlansStorePayload,
 *   status: 'ok' | 'empty' | 'corrupt' | 'unsupported_version' | 'storage_unavailable',
 *   error?: string | null,
 * }} AcceptedPlansReadResult
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asAbsoluteHttpUrl(value) {
  const raw = asOptionalString(value);
  if (!raw) return null;
  if (raw.startsWith('https://') || raw.startsWith('http://')) return raw;
  return null;
}

/**
 * @returns {AcceptedPlansStorePayload}
 */
export function emptyAcceptedPlansStore() {
  return { version: ACCEPTED_PLANS_VERSION, items: [] };
}

/**
 * Durable performance identity. Never title-only.
 * @param {Record<string, unknown>} input
 * @returns {string | null}
 */
export function buildAcceptedPerformanceKey(input) {
  if (!input || typeof input !== 'object') return null;
  const source = asOptionalString(input.source);
  const sourceShowtimeId =
    asOptionalString(input.sourceShowtimeId) ??
    asOptionalString(input.source_showtime_id);
  const theaterId =
    asOptionalString(input.theaterId) ?? asOptionalString(input.theater_id);
  if (source && sourceShowtimeId) {
    return `src:${source}:${theaterId ?? 'theater'}:${sourceShowtimeId}`;
  }
  const opportunityKey = asOptionalString(input.opportunityKey);
  if (opportunityKey) return `opp:${opportunityKey}`;

  const filmKey =
    asOptionalString(input.filmKey) ?? asOptionalString(input.showtimeFilmKey);
  const date =
    asOptionalString(input.localDate) ??
    asOptionalString(input.date) ??
    asOptionalString(input.showDate);
  const time =
    asOptionalString(input.localTime) ??
    asOptionalString(input.time) ??
    asOptionalString(input.startTime);
  if (filmKey && theaterId && date && time) {
    return `comp:${filmKey}:${theaterId}:${date}:${time}`;
  }
  return null;
}

/**
 * Deterministic plan id from date + sorted performance keys.
 * @param {string} date
 * @param {string[]} performanceKeys
 */
export function buildAcceptedPlanId(date, performanceKeys) {
  const day = asOptionalString(date);
  const keys = [...performanceKeys].filter(Boolean).sort();
  if (!day || keys.length === 0) return null;
  return `accepted:${day}:${keys.join('+')}`.slice(0, 240);
}

/**
 * Normalize one live performance candidate into a snapshot row.
 * Fail closed on missing identity, time, theater, title, or runtime.
 *
 * @param {unknown} input
 * @returns {{
 *   ok: true,
 *   performance: AcceptedPlanPerformance,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
export function normalizeAcceptedPerformance(input) {
  if (!input || typeof input !== 'object') {
    return {
      ok: false,
      error: { code: 'invalid_performance', message: 'Performance is required.' },
    };
  }
  const record = /** @type {Record<string, unknown>} */ (input);
  const title = asOptionalString(record.title);
  if (!title) {
    return {
      ok: false,
      error: { code: 'missing_title', message: 'Film title is required.' },
    };
  }

  const theaterId =
    asOptionalString(record.theaterId) ?? asOptionalString(record.theater_id);
  if (!theaterId) {
    return {
      ok: false,
      error: {
        code: 'missing_theater',
        message: 'A stable theater id is required.',
      },
    };
  }

  const localDate =
    asOptionalString(record.localDate) ??
    asOptionalString(record.date) ??
    asOptionalString(record.showDate);
  const dateParts = parseCalendarDateParts(localDate);
  if (!dateParts || !localDate) {
    return {
      ok: false,
      error: {
        code: 'invalid_timestamp',
        message: 'A valid local date is required.',
      },
    };
  }

  const localTime =
    asOptionalString(record.localTime) ??
    asOptionalString(record.time) ??
    asOptionalString(record.startTime);
  const startMin =
    typeof record.startMin === 'number' && Number.isFinite(record.startMin)
      ? record.startMin
      : parseCalendarShowtimeMinutes(localTime);
  if (startMin == null || !localTime) {
    return {
      ok: false,
      error: {
        code: 'invalid_timestamp',
        message: 'A valid advertised showtime is required.',
      },
    };
  }

  const runtimeMin = parseRuntimeMinutes(
    record.runtimeMin ?? record.runtime ?? record.runtimeMinutes,
  );
  if (runtimeMin == null) {
    return {
      ok: false,
      error: {
        code: 'missing_runtime',
        message: 'Runtime is required for an accepted plan performance.',
      },
    };
  }

  const performanceKey = buildAcceptedPerformanceKey({
    ...record,
    theaterId,
    localDate,
    localTime,
  });
  if (!performanceKey) {
    return {
      ok: false,
      error: {
        code: 'missing_identity',
        message:
          'A source showtime id, opportunity key, or film+theater+start identity is required.',
      },
    };
  }

  const expected = calculateExpectedEndTime(
    { startMin, runtime: runtimeMin },
    runtimeMin,
    { policy: PLANNER_BUFFER_POLICY_V1, planner: false },
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

  /** @type {AcceptedPlanPerformance} */
  const performance = {
    performanceKey,
    filmId: asOptionalString(record.filmId),
    filmKey:
      asOptionalString(record.filmKey) ??
      asOptionalString(record.showtimeFilmKey),
    parentFilmKey: asOptionalString(record.parentFilmKey),
    title,
    theaterId,
    theaterName:
      asOptionalString(record.theaterName) ??
      asOptionalString(record.theater) ??
      theaterId,
    source: asOptionalString(record.source),
    sourceShowtimeId:
      asOptionalString(record.sourceShowtimeId) ??
      asOptionalString(record.source_showtime_id),
    opportunityKey: asOptionalString(record.opportunityKey),
    localDate,
    localTime:
      /^\d{1,2}:\d{2}/.test(localTime) && !/[ap]m/i.test(localTime)
        ? localTime.slice(0, 5)
        : localTime,
    startsAt: start.toISOString(),
    expectedEndsAt: end.toISOString(),
    runtimeMin,
    format:
      asOptionalString(record.format) ??
      asOptionalString(record.formatLabel) ??
      asOptionalString(record.formatBadge),
    ticketUrl: asAbsoluteHttpUrl(record.ticketUrl ?? record.ticket_url),
    addressLabel: asOptionalString(record.addressLabel),
    posterUrl: asAbsoluteHttpUrl(record.posterUrl ?? record.imageUrl),
  };

  return { ok: true, performance };
}

/**
 * Build a validated accepted-plan item (does not write).
 * Rejects fixture provenance and incomplete/mixed rows.
 *
 * @param {{
 *   performances: unknown[],
 *   label?: string | null,
 *   date?: string | null,
 *   provenance?: string | null,
 *   settingsSnapshot?: Record<string, unknown> | null,
 *   now?: () => Date,
 * }} input
 */
export function buildAcceptedPlanItem(input) {
  const provenance = asOptionalString(input?.provenance) ?? 'live';
  if (provenance !== 'live') {
    return {
      ok: false,
      error: {
        code: 'fixture_plan',
        message: 'Fixture itineraries cannot be saved to My Schedule.',
      },
    };
  }

  const rawList = Array.isArray(input?.performances) ? input.performances : [];
  if (rawList.length === 0) {
    return {
      ok: false,
      error: {
        code: 'empty_plan',
        message: 'Select at least one real showtime to save.',
      },
    };
  }

  /** @type {AcceptedPlanPerformance[]} */
  const performances = [];
  /** @type {Set<string>} */
  const seenKeys = new Set();

  for (const raw of rawList) {
    const built = normalizeAcceptedPerformance(raw);
    if (!built.ok) {
      return {
        ok: false,
        error: built.error,
      };
    }
    if (seenKeys.has(built.performance.performanceKey)) {
      return {
        ok: false,
        error: {
          code: 'duplicate_performance',
          message: 'Plan contains duplicate showtimes.',
        },
      };
    }
    seenKeys.add(built.performance.performanceKey);
    performances.push(built.performance);
  }

  performances.sort((a, b) => {
    if (a.startsAt !== b.startsAt) return a.startsAt < b.startsAt ? -1 : 1;
    return a.performanceKey < b.performanceKey ? -1 : 1;
  });

  const date =
    asOptionalString(input.date) ?? performances[0]?.localDate ?? null;
  if (!date || !parseCalendarDateParts(date)) {
    return {
      ok: false,
      error: { code: 'invalid_timestamp', message: 'Plan date is invalid.' },
    };
  }

  // All performances must share the plan date (multi-day deferred).
  if (performances.some((p) => p.localDate !== date)) {
    return {
      ok: false,
      error: {
        code: 'mixed_dates',
        message: 'Accepted plans currently require one calendar date.',
      },
    };
  }

  const planId = buildAcceptedPlanId(
    date,
    performances.map((p) => p.performanceKey),
  );
  if (!planId) {
    return {
      ok: false,
      error: { code: 'missing_identity', message: 'Could not build plan id.' },
    };
  }

  const nowFn = input.now ?? (() => new Date());
  /** @type {AcceptedPlanItem} */
  const plan = {
    planId,
    acceptedAt: nowFn().toISOString(),
    label: asOptionalString(input.label),
    date,
    timezone: ACCEPTED_PLANS_TIMEZONE,
    provenance: 'live',
    performances,
    settingsSnapshot:
      input.settingsSnapshot && typeof input.settingsSnapshot === 'object'
        ? { ...input.settingsSnapshot }
        : null,
  };

  return { ok: true, plan };
}

/**
 * @param {unknown} value
 * @returns {AcceptedPlanPerformance | null}
 */
function coerceStoredPerformance(value) {
  if (!value || typeof value !== 'object') return null;
  const built = normalizeAcceptedPerformance(value);
  if (!built.ok) return null;
  // Prefer already-persisted instants when present and valid.
  const record = /** @type {Record<string, unknown>} */ (value);
  const startsAt = asOptionalString(record.startsAt);
  const expectedEndsAt = asOptionalString(record.expectedEndsAt);
  const performance = { ...built.performance };
  if (startsAt && !Number.isNaN(Date.parse(startsAt))) {
    performance.startsAt = startsAt;
  }
  if (expectedEndsAt && !Number.isNaN(Date.parse(expectedEndsAt))) {
    performance.expectedEndsAt = expectedEndsAt;
  }
  const key = asOptionalString(record.performanceKey);
  if (key) performance.performanceKey = key;
  return performance;
}

/**
 * @param {unknown} value
 * @returns {AcceptedPlanItem | null}
 */
function coerceStoredPlan(value) {
  if (!value || typeof value !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (asOptionalString(record.provenance) !== 'live') return null;
  const performances = Array.isArray(record.performances)
    ? record.performances.map(coerceStoredPerformance).filter(Boolean)
    : [];
  if (performances.length === 0) return null;
  const rebuilt = buildAcceptedPlanItem({
    performances,
    label: record.label,
    date: record.date,
    provenance: 'live',
    settingsSnapshot:
      record.settingsSnapshot && typeof record.settingsSnapshot === 'object'
        ? /** @type {Record<string, unknown>} */ (record.settingsSnapshot)
        : null,
  });
  if (!rebuilt.ok) return null;
  const plan = rebuilt.plan;
  const acceptedAt = asOptionalString(record.acceptedAt);
  if (acceptedAt && !Number.isNaN(Date.parse(acceptedAt))) {
    plan.acceptedAt = acceptedAt;
  }
  const planId = asOptionalString(record.planId);
  if (planId) plan.planId = planId;
  return plan;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   store: AcceptedPlansStorePayload,
 *   status: AcceptedPlansReadResult['status'],
 *   error?: string | null,
 * }}
 */
export function normalizeAcceptedPlansStore(raw) {
  if (raw == null) {
    return { store: emptyAcceptedPlansStore(), status: 'empty' };
  }
  if (typeof raw !== 'object') {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'corrupt',
      error: 'invalid_shape',
    };
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  if (!('version' in record) || typeof record.version !== 'number') {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'corrupt',
      error: 'missing_version',
    };
  }
  if (record.version > ACCEPTED_PLANS_VERSION) {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'unsupported_version',
      error: 'unsupported_version',
    };
  }
  if (record.version < 1) {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'corrupt',
      error: 'invalid_version',
    };
  }

  const itemsRaw = Array.isArray(record.items) ? record.items : [];
  /** @type {AcceptedPlanItem[]} */
  const items = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const row of itemsRaw) {
    const plan = coerceStoredPlan(row);
    if (!plan) continue;
    if (seen.has(plan.planId)) continue;
    seen.add(plan.planId);
    items.push(plan);
    if (items.length >= ACCEPTED_PLANS_MAX) break;
  }

  return {
    store: { version: ACCEPTED_PLANS_VERSION, items },
    status: items.length ? 'ok' : 'empty',
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {AcceptedPlansReadResult}
 */
export function readAcceptedPlansStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'storage_unavailable',
      error: 'storage_unavailable',
    };
  }
  let rawText;
  try {
    rawText = storage.getItem(ACCEPTED_PLANS_STORAGE_KEY);
  } catch {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'storage_unavailable',
      error: 'storage_get_failed',
    };
  }
  if (rawText == null || rawText === '') {
    return { store: emptyAcceptedPlansStore(), status: 'empty' };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      store: emptyAcceptedPlansStore(),
      status: 'corrupt',
      error: 'invalid_json',
    };
  }
  const normalized = normalizeAcceptedPlansStore(parsed);
  return {
    store: normalized.store,
    status: normalized.status,
    error: normalized.error ?? null,
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {AcceptedPlanItem[]}
 */
export function getAcceptedPlans(storage) {
  return readAcceptedPlansStore(storage).store.items;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} planId
 */
export function getAcceptedPlanById(storage, planId) {
  const id = asOptionalString(planId);
  if (!id) return null;
  return getAcceptedPlans(storage).find((p) => p.planId === id) ?? null;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {AcceptedPlansStorePayload} store
 * @returns {AcceptedPlansWriteResult}
 */
export function writeAcceptedPlansStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') {
    return {
      ok: false,
      store: readAcceptedPlansStore(storage).store,
      error: 'storage_unavailable',
      changed: false,
    };
  }
  const normalized = normalizeAcceptedPlansStore(store);
  if (normalized.status === 'unsupported_version') {
    return {
      ok: false,
      store: emptyAcceptedPlansStore(),
      error: 'unsupported_version',
      changed: false,
    };
  }
  const payload = {
    version: ACCEPTED_PLANS_VERSION,
    items: normalized.store.items.slice(0, ACCEPTED_PLANS_MAX),
  };
  try {
    storage.setItem(ACCEPTED_PLANS_STORAGE_KEY, JSON.stringify(payload));
    notifyScheduleStoreMutation({
      mutatedAt: new Date().toISOString(),
      source: 'acceptedPlansStore',
    });
    return { ok: true, store: payload, changed: true, error: null };
  } catch (err) {
    const quota =
      err &&
      typeof err === 'object' &&
      'name' in err &&
      /** @type {{ name?: string }} */ (err).name === 'QuotaExceededError';
    return {
      ok: false,
      store: readAcceptedPlansStore(storage).store,
      error: quota ? 'quota_exceeded' : 'storage_set_failed',
      changed: false,
    };
  }
}

/**
 * Accept a live itinerary. Idempotent on planId.
 *
 * @param {Storage | null | undefined} storage
 * @param {{
 *   performances: unknown[],
 *   label?: string | null,
 *   date?: string | null,
 *   provenance?: string | null,
 *   settingsSnapshot?: Record<string, unknown> | null,
 *   now?: () => Date,
 * }} input
 * @returns {AcceptedPlansWriteResult}
 */
export function acceptPlan(storage, input) {
  const built = buildAcceptedPlanItem(input);
  if (!built.ok) {
    return {
      ok: false,
      store: readAcceptedPlansStore(storage).store,
      error: built.error?.code ?? 'invalid_plan',
      changed: false,
      plan: null,
    };
  }

  const read = readAcceptedPlansStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: read.error ?? 'unsupported_version',
      changed: false,
      plan: null,
    };
  }

  const existing = read.store.items;
  const already = existing.find((row) => row.planId === built.plan.planId);
  if (already) {
    const written = writeAcceptedPlansStore(storage, {
      version: ACCEPTED_PLANS_VERSION,
      items: existing,
    });
    return {
      ...written,
      changed: false,
      plan: already,
      error: written.ok ? null : written.error,
    };
  }

  const nextItems = [built.plan, ...existing].slice(0, ACCEPTED_PLANS_MAX);
  const written = writeAcceptedPlansStore(storage, {
    version: ACCEPTED_PLANS_VERSION,
    items: nextItems,
  });
  return {
    ...written,
    plan: written.ok ? built.plan : null,
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} planId
 */
export function removeAcceptedPlan(storage, planId) {
  const id = asOptionalString(planId);
  if (!id) {
    return {
      ok: false,
      store: readAcceptedPlansStore(storage).store,
      error: 'invalid_plan_id',
      changed: false,
    };
  }
  const read = readAcceptedPlansStore(storage);
  if (read.status === 'unsupported_version') {
    return {
      ok: false,
      store: read.store,
      error: read.error ?? 'unsupported_version',
      changed: false,
    };
  }
  const next = read.store.items.filter((p) => p.planId !== id);
  if (next.length === read.store.items.length) {
    return { ok: true, store: read.store, changed: false, error: null };
  }
  return writeAcceptedPlansStore(storage, {
    version: ACCEPTED_PLANS_VERSION,
    items: next,
  });
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearAcceptedPlans(storage) {
  return writeAcceptedPlansStore(storage, emptyAcceptedPlansStore());
}

/**
 * Map an accepted plan to calendar-export film rows (T-CAL-02 reuse).
 * @param {AcceptedPlanItem} plan
 * @param {string[] | null} [selectedPerformanceKeys]
 */
export function acceptedPlanToCalendarFilms(plan, selectedPerformanceKeys = null) {
  if (!plan || !Array.isArray(plan.performances)) return [];
  const selected = selectedPerformanceKeys
    ? new Set(selectedPerformanceKeys)
    : null;
  return plan.performances
    .filter((p) => (selected ? selected.has(p.performanceKey) : true))
    .map((p) => ({
      title: p.title,
      date: p.localDate,
      time: p.localTime,
      runtime: p.runtimeMin,
      theater: p.theaterName,
      theater_id: p.theaterId,
      filmKey: p.filmKey,
      format: p.format,
      ticket_url: p.ticketUrl,
      source: p.source,
      source_showtime_id: p.sourceShowtimeId,
      addressLabel: p.addressLabel,
    }));
}
