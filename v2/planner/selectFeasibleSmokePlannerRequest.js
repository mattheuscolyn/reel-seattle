/**
 * Smoke / deploy helper: pick a live Build form that yields feasible
 * same-theater planner results against current HomeData.
 *
 * Production defaults (no must-includes, Any theater, default plan size) are
 * preserved — only the plan date may advance when Pacific “today” has no
 * remaining actionable screenings.
 */

import {
  formatCompactDateLabel,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import {
  createLiveBuildPlanFormState,
  formatBuildPlanDateDisplay,
} from './createLiveBuildPlanFormState.js';
import { generateLivePlannerResults } from './generateLivePlannerResults.js';

/**
 * Upcoming local dates present in HomeData opportunities (Pacific today first).
 *
 * @param {object | null | undefined} homeData
 * @param {Date | (() => Date)} [now]
 * @param {number} [maxDates]
 * @returns {string[]}
 */
export function collectSmokePlannerCandidateDates(
  homeData,
  now = new Date(),
  maxDates = 14,
) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const todayIso = pacificDateString(nowFn());
  /** @type {Set<string>} */
  const dates = new Set();
  for (const opportunity of Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : []) {
    const localDate =
      typeof opportunity?.localDate === 'string'
        ? opportunity.localDate.trim()
        : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) continue;
    if (localDate < todayIso) continue;
    dates.add(localDate);
  }
  if (!dates.has(todayIso)) dates.add(todayIso);
  return [...dates].sort().slice(0, Math.max(1, maxDates));
}

/**
 * @param {object | null | undefined} homeData
 * @param {{
 *   now?: Date | (() => Date),
 *   maxDatesToTry?: number,
 *   sortId?: string | null,
 * }} [options]
 * @returns {{
 *   ok: boolean,
 *   form: object | null,
 *   generated: object | null,
 *   dateIso: string | null,
 *   attemptedDates: string[],
 *   error: string | null,
 *   message: string | null,
 * }}
 */
export function selectFeasibleSmokePlannerRequest(homeData, options = {}) {
  const now = options.now ?? new Date();
  const sortId = options.sortId ?? 'best-match';
  const maxDatesToTry = options.maxDatesToTry ?? 14;

  if (!homeData || !Array.isArray(homeData.opportunities)) {
    return {
      ok: false,
      form: null,
      generated: null,
      dateIso: null,
      attemptedDates: [],
      error: 'missing_home_data',
      message: 'Showtimes aren’t loaded yet.',
    };
  }

  const base = createLiveBuildPlanFormState(now);
  const candidateDates = collectSmokePlannerCandidateDates(
    homeData,
    now,
    maxDatesToTry,
  );
  /** @type {string[]} */
  const attemptedDates = [];

  for (const dateIso of candidateDates) {
    attemptedDates.push(dateIso);
    const form = {
      ...base,
      dateIso,
      dateDisplay: formatBuildPlanDateDisplay(dateIso),
      dateShort: formatCompactDateLabel(dateIso),
    };
    const generated = generateLivePlannerResults({
      homeData,
      form,
      sortId,
      now,
    });
    if (generated?.ok && Array.isArray(generated.plans) && generated.plans.length > 0) {
      return {
        ok: true,
        form,
        generated,
        dateIso,
        attemptedDates,
        error: null,
        message: null,
      };
    }
  }

  return {
    ok: false,
    form: null,
    generated: null,
    dateIso: null,
    attemptedDates,
    error: 'no_feasible_plan',
    message:
      'No same-theater plans fit these filters across upcoming showtimes dates.',
  };
}

/**
 * Assert each plan is a single-theater itinerary (T-PENG-01).
 * @param {object[]} plans
 * @returns {boolean}
 */
export function plansAreSameTheater(plans) {
  if (!Array.isArray(plans) || plans.length === 0) return false;
  for (const plan of plans) {
    const planTheater =
      typeof plan?.theaterId === 'string' ? plan.theaterId.trim() : '';
    if (!planTheater) return false;
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const filmItems = items.filter((item) => item?.type !== 'break');
    if (filmItems.length === 0) return false;
    for (const film of filmItems) {
      const filmTheater =
        typeof film?.theaterId === 'string' ? film.theaterId.trim() : '';
      if (filmTheater && filmTheater !== planTheater) return false;
    }
  }
  return true;
}
