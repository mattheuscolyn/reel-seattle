/**
 * Planner runtime and transfer buffer policy (T-BUF-01 / D17, revised).
 *
 * Single source of truth for:
 * - Scheduling end = advertised start + runtime (no universal trailer/preshow)
 * - General transfer buffer (10) — minimum between venues
 * - Same-venue / same-building transfer (5)
 *
 * A universal trailer/preshow offset is intentionally not applied: absent
 * screening-specific trailer data, the same assumed offset on every screening
 * cancels out for relative chaining and produced inconsistent feasibility.
 * Screening-specific trailer / no-trailer modeling is deferred.
 *
 * These transfer buffers are policy minima, not walking-distance claims.
 * Theater-specific and user-adjustable overrides remain deferred.
 *
 * Missing runtime: expected end and sequence validity are indeterminate
 * (`missing_runtime`) — never fabricate a default runtime.
 *
 * Legacy `getMovieEndTime` remains start+runtime for showtimes display.
 * Planner validity, finish-by checks, and displayed end/break times share
 * `calculateExpectedEndTime` from this module.
 */

import {
  parsePlannerShowtimeMinutes,
  parseRuntimeMinutes,
  parseTimeToMinutes,
} from './timeUtils.js';

export const PLANNER_BUFFER_POLICY_V1 = Object.freeze({
  version: 2,
  id: 'planner-buffer-v2',
  /** @deprecated Universal preshow is no longer applied; always 0. */
  preshowMinutes: 0,
  generalTransferMinutes: 10,
  sameVenueTransferMinutes: 5,
});

/**
 * @returns {Readonly<typeof PLANNER_BUFFER_POLICY_V1>}
 */
export function getPlannerBufferPolicy() {
  return PLANNER_BUFFER_POLICY_V1;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeTheaterId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Extract a theater identity hint from a performance-like object or string.
 * @param {unknown} value
 * @returns {string | null}
 */
function theaterIdFrom(value) {
  if (typeof value === 'string') return normalizeTheaterId(value);
  if (!value || typeof value !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  return (
    normalizeTheaterId(record.theaterId) ??
    normalizeTheaterId(record.theater_id) ??
    normalizeTheaterId(record.id) ??
    null
  );
}

/**
 * Universal preshow is not applied (always 0). Kept for callers that still
 * read the field; do not use for schedule validity.
 *
 * @param {{ policy?: typeof PLANNER_BUFFER_POLICY_V1 } | null | undefined} [context]
 * @returns {0}
 */
export function getPreshowMinutes(context = null) {
  const policy = context?.policy ?? getPlannerBufferPolicy();
  return policy.preshowMinutes ?? 0;
}

/**
 * Choose transfer minutes. Same canonical theater ID → 5.
 * Explicit sameVenue/sameBuilding context → 5.
 * Do not infer same-building from similar names.
 * Unknown / different theaters → 10.
 *
 * @param {unknown} from
 * @param {unknown} to
 * @param {{
 *   policy?: typeof PLANNER_BUFFER_POLICY_V1,
 *   sameVenue?: boolean,
 *   sameBuilding?: boolean,
 * } | null | undefined} [context]
 */
export function getTransferMinutes(from, to, context = null) {
  const policy = context?.policy ?? getPlannerBufferPolicy();
  if (context?.sameVenue === true || context?.sameBuilding === true) {
    return policy.sameVenueTransferMinutes;
  }
  const fromId = theaterIdFrom(from);
  const toId = theaterIdFrom(to);
  if (fromId && toId && fromId === toId) {
    return policy.sameVenueTransferMinutes;
  }
  return policy.generalTransferMinutes;
}

/**
 * Resolve advertised start to extended planner minutes.
 * Accepts a numeric startMin, legacy Time string, or performance-like object.
 *
 * @param {unknown} showtime
 * @param {{ planner?: boolean }} [options]
 * @returns {number | null}
 */
export function resolveAdvertisedStartMinutes(showtime, options = {}) {
  const planner = options.planner !== false;
  if (typeof showtime === 'number') {
    return Number.isFinite(showtime) ? showtime : null;
  }
  if (typeof showtime === 'string') {
    return planner
      ? parsePlannerShowtimeMinutes(showtime)
      : parseTimeToMinutes(showtime);
  }
  if (!showtime || typeof showtime !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (showtime);
  if (typeof record.startMin === 'number' && Number.isFinite(record.startMin)) {
    return record.startMin;
  }
  if (typeof record.time === 'string') {
    return planner
      ? parsePlannerShowtimeMinutes(record.time)
      : parseTimeToMinutes(record.time);
  }
  if (typeof record.Time === 'string') {
    return planner
      ? parsePlannerShowtimeMinutes(record.Time)
      : parseTimeToMinutes(record.Time);
  }
  return null;
}

/**
 * Resolve runtime minutes from a number or performance-like object.
 * @param {unknown} runtimeOrPerformance
 * @returns {number | null}
 */
export function resolveRuntimeMinutes(runtimeOrPerformance) {
  if (
    typeof runtimeOrPerformance === 'number' ||
    typeof runtimeOrPerformance === 'string'
  ) {
    return parseRuntimeMinutes(runtimeOrPerformance);
  }
  if (!runtimeOrPerformance || typeof runtimeOrPerformance !== 'object') {
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (runtimeOrPerformance);
  if ('runtime' in record) return parseRuntimeMinutes(record.runtime);
  if ('Runtime' in record) return parseRuntimeMinutes(record.Runtime);
  if ('runtimeMinutes' in record) {
    return parseRuntimeMinutes(record.runtimeMinutes);
  }
  return null;
}

/**
 * Scheduling end = advertised start + runtime.
 * No universal trailer/preshow offset. Missing/invalid runtime → indeterminate.
 *
 * @param {unknown} showtime
 * @param {unknown} [runtimeMinutes]
 * @param {{
 *   policy?: typeof PLANNER_BUFFER_POLICY_V1,
 *   planner?: boolean,
 * } | null | undefined} [context]
 * @returns {{
 *   ok: boolean,
 *   endMin: number | null,
 *   startMin: number | null,
 *   runtimeMinutes: number | null,
 *   preshowMinutes: 0,
 *   error: string | null,
 * }}
 */
export function calculateExpectedEndTime(
  showtime,
  runtimeMinutes = null,
  context = null,
) {
  const startMin = resolveAdvertisedStartMinutes(showtime, {
    planner: context?.planner !== false,
  });
  const runtime =
    runtimeMinutes == null && showtime && typeof showtime === 'object'
      ? resolveRuntimeMinutes(showtime)
      : resolveRuntimeMinutes(runtimeMinutes);
  const preshowMinutes = 0;

  if (startMin === null) {
    return {
      ok: false,
      endMin: null,
      startMin: null,
      runtimeMinutes: runtime,
      preshowMinutes,
      error: 'invalid_start',
    };
  }
  if (runtime === null) {
    return {
      ok: false,
      endMin: null,
      startMin,
      runtimeMinutes: null,
      preshowMinutes,
      error: 'missing_runtime',
    };
  }

  const endMin = startMin + runtime;
  if (!Number.isFinite(endMin)) {
    return {
      ok: false,
      endMin: null,
      startMin,
      runtimeMinutes: runtime,
      preshowMinutes,
      error: 'invalid_end',
    };
  }

  return {
    ok: true,
    endMin,
    startMin,
    runtimeMinutes: runtime,
    preshowMinutes,
    error: null,
  };
}

/**
 * Earliest valid next advertised start after previous scheduling end + transfer.
 *
 * @param {unknown} previous
 * @param {unknown} next
 * @param {{
 *   policy?: typeof PLANNER_BUFFER_POLICY_V1,
 *   sameVenue?: boolean,
 *   sameBuilding?: boolean,
 *   planner?: boolean,
 * } | null | undefined} [context]
 * @returns {{
 *   ok: boolean,
 *   requiredStartMin: number | null,
 *   previousEndMin: number | null,
 *   transferMinutes: number | null,
 *   error: string | null,
 * }}
 */
export function calculateRequiredNextStart(previous, next = null, context = null) {
  const end = calculateExpectedEndTime(previous, null, context);
  if (!end.ok) {
    return {
      ok: false,
      requiredStartMin: null,
      previousEndMin: null,
      transferMinutes: null,
      error: end.error,
    };
  }
  const transferMinutes = getTransferMinutes(previous, next, context);
  return {
    ok: true,
    requiredStartMin: end.endMin + transferMinutes,
    previousEndMin: end.endMin,
    transferMinutes,
    error: null,
  };
}

/**
 * Break minutes = next advertised start − previous scheduling end.
 * May be negative when performances overlap under the policy.
 *
 * @param {unknown} previous
 * @param {unknown} next
 * @param {{
 *   policy?: typeof PLANNER_BUFFER_POLICY_V1,
 *   sameVenue?: boolean,
 *   sameBuilding?: boolean,
 *   planner?: boolean,
 * } | null | undefined} [context]
 * @returns {{
 *   ok: boolean,
 *   breakMinutes: number | null,
 *   previousEndMin: number | null,
 *   nextStartMin: number | null,
 *   transferMinutes: number | null,
 *   meetsTransfer: boolean,
 *   error: string | null,
 * }}
 */
export function calculateBreakMinutes(previous, next, context = null) {
  const end = calculateExpectedEndTime(previous, null, context);
  const nextStart = resolveAdvertisedStartMinutes(next, {
    planner: context?.planner !== false,
  });
  const transferMinutes = getTransferMinutes(previous, next, context);

  if (!end.ok) {
    return {
      ok: false,
      breakMinutes: null,
      previousEndMin: null,
      nextStartMin: nextStart,
      transferMinutes,
      meetsTransfer: false,
      error: end.error,
    };
  }
  if (nextStart === null) {
    return {
      ok: false,
      breakMinutes: null,
      previousEndMin: end.endMin,
      nextStartMin: null,
      transferMinutes,
      meetsTransfer: false,
      error: 'invalid_start',
    };
  }

  const breakMinutes = nextStart - /** @type {number} */ (end.endMin);
  return {
    ok: true,
    breakMinutes,
    previousEndMin: end.endMin,
    nextStartMin: nextStart,
    transferMinutes,
    meetsTransfer: breakMinutes >= transferMinutes,
    error: null,
  };
}

/**
 * Sequence validity: next start >= previous scheduling end + transfer buffer.
 * Missing runtime never reports valid:true.
 *
 * @param {unknown} previous
 * @param {unknown} next
 * @param {{
 *   policy?: typeof PLANNER_BUFFER_POLICY_V1,
 *   sameVenue?: boolean,
 *   sameBuilding?: boolean,
 *   planner?: boolean,
 * } | null | undefined} [context]
 * @returns {{
 *   valid: boolean,
 *   reason: string | null,
 *   breakMinutes: number | null,
 *   transferMinutes: number | null,
 *   requiredStartMin: number | null,
 *   previousEndMin: number | null,
 *   nextStartMin: number | null,
 * }}
 */
export function isValidSequence(previous, next, context = null) {
  const required = calculateRequiredNextStart(previous, next, context);
  const nextStart = resolveAdvertisedStartMinutes(next, {
    planner: context?.planner !== false,
  });

  if (!required.ok) {
    return {
      valid: false,
      reason: required.error,
      breakMinutes: null,
      transferMinutes: required.transferMinutes,
      requiredStartMin: null,
      previousEndMin: required.previousEndMin,
      nextStartMin: nextStart,
    };
  }
  if (nextStart === null) {
    return {
      valid: false,
      reason: 'invalid_start',
      breakMinutes: null,
      transferMinutes: required.transferMinutes,
      requiredStartMin: required.requiredStartMin,
      previousEndMin: required.previousEndMin,
      nextStartMin: null,
    };
  }

  const breakMinutes =
    nextStart - /** @type {number} */ (required.previousEndMin);
  if (nextStart < /** @type {number} */ (required.requiredStartMin)) {
    return {
      valid: false,
      reason: breakMinutes < 0 ? 'overlap' : 'insufficient_transfer',
      breakMinutes,
      transferMinutes: required.transferMinutes,
      requiredStartMin: required.requiredStartMin,
      previousEndMin: required.previousEndMin,
      nextStartMin: nextStart,
    };
  }

  return {
    valid: true,
    reason: null,
    breakMinutes,
    transferMinutes: required.transferMinutes,
    requiredStartMin: required.requiredStartMin,
    previousEndMin: required.previousEndMin,
    nextStartMin: nextStart,
  };
}
