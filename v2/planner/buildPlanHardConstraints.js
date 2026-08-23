/**
 * Shared hard-constraint resolution for Build-a-Plan pickers (PR2).
 * Candidate eligibility only — not full schedule feasibility.
 */

import { calculateExpectedEndTime } from '../../src/utils/plannerBufferPolicy.js';
import { parsePlannerShowtimeMinutes } from '../../src/utils/timeUtils.js';
import { parseLocalTimeMinutes } from '../showtimes/showtimeEligibility.js';
import {
  resolveBuildFormDateIso,
  resolveTheaterFilterIds,
} from './mapBuildFormToPlannerFilters.js';
import { resolveBuildPlanTimeWindowMinutes } from './buildPlanTimeWindow.js';

/**
 * Parse opportunity localTime (HH:MM) or legacy compact 12h for hard constraints.
 * @param {unknown} localTime
 * @returns {number | null}
 */
export function parseOpportunityStartMinutes(localTime) {
  if (typeof localTime !== 'string') return null;
  const trimmed = localTime.trim();
  if (!trimmed) return null;
  const fromLocal = parseLocalTimeMinutes(trimmed);
  if (fromLocal != null) return fromLocal;
  return parsePlannerShowtimeMinutes(trimmed.replace(/\s+/g, ''));
}

/**
 * @param {object} form
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [options]
 * @returns {{
 *   dateIso: string,
 *   theaterIds: string[],
 *   startAfterMin: number | null,
 *   finishByMin: number | null,
 * }}
 */
export function resolveBuildPlanHardConstraints(form, homeData, options = {}) {
  const dateIso = resolveBuildFormDateIso(form, options.now);
  const theaterIds = resolveTheaterFilterIds(form, homeData);
  const { startAfterMin, finishByMin } = resolveBuildPlanTimeWindowMinutes(form);
  return {
    dateIso,
    theaterIds: Array.isArray(theaterIds) ? theaterIds.filter(Boolean) : [],
    startAfterMin,
    finishByMin,
  };
}

/**
 * Whether an opportunity satisfies hard date/theater/time constraints.
 * @param {object} opportunity
 * @param {{
 *   dateIso: string,
 *   theaterIds?: string[],
 *   startAfterMin?: number | null,
 *   finishByMin?: number | null,
 *   runtimeMin?: number | null,
 * }} constraints
 */
export function opportunityMatchesHardConstraints(opportunity, constraints) {
  if (!opportunity || typeof opportunity !== 'object') return false;
  if (opportunity.localDate !== constraints.dateIso) return false;

  const theaterIds = constraints.theaterIds ?? [];
  if (theaterIds.length) {
    const tid = String(opportunity.theaterId ?? '').trim();
    const tname = String(opportunity.theaterName ?? '').trim();
    if (
      !theaterIds.includes(tid) &&
      !theaterIds.includes(tname)
    ) {
      return false;
    }
  }

  const localTime = opportunity.localTime ?? opportunity.timeDisplay;
  const startMin = parseOpportunityStartMinutes(localTime);

  if (startMin == null) return false;

  if (
    constraints.startAfterMin != null &&
    startMin < constraints.startAfterMin
  ) {
    return false;
  }

  const runtime =
    typeof constraints.runtimeMin === 'number' &&
    Number.isFinite(constraints.runtimeMin)
      ? constraints.runtimeMin
      : typeof opportunity.runtimeMin === 'number' &&
          Number.isFinite(opportunity.runtimeMin)
        ? opportunity.runtimeMin
        : null;

  if (constraints.finishByMin != null) {
    if (runtime == null || runtime <= 0) {
      // Without runtime we cannot prove end-time eligibility — treat as out.
      return false;
    }
    const expected = calculateExpectedEndTime(
      { startMin, runtime },
      runtime,
    );
    if (!expected.ok || expected.endMin == null) return false;
    if (expected.endMin > constraints.finishByMin) return false;
  }

  return true;
}

/**
 * Availability summary for film-level picker options.
 * @param {{ showtimeCount: number, theaterCount?: number }} counts
 * @returns {string}
 */
export function formatEligibleShowtimeSummary({
  showtimeCount,
  theaterCount = 0,
}) {
  const n = Number(showtimeCount);
  const count = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  if (count <= 0) return 'No eligible showtimes';
  const showLabel =
    count === 1 ? '1 eligible showtime' : `${count} eligible showtimes`;
  const theaters = Number(theaterCount);
  if (Number.isFinite(theaters) && theaters > 1) {
    return `${theaters} theaters · ${showLabel}`;
  }
  return showLabel;
}
