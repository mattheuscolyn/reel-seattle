/**
 * Helpers for persistent saved plans: upcoming/past classification,
 * date labels, and durable Plan Details resolution by planId.
 */

import {
  getAcceptedPlanById,
  getAcceptedPlans,
} from '../stores/acceptedPlansStore.js';
import { acceptedPlanToPlanDetailsPlan } from './acceptedPlanToPlanDetails.js';

export const SAVED_PLAN_ID_QUERY = 'planId';

/**
 * @param {string | null | undefined} isoDate YYYY-MM-DD
 * @returns {string}
 */
export function formatLongPlanDateLabel(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return isoDate;
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}

/**
 * Latest performance end (or start) for a saved plan, as epoch ms.
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null | undefined} plan
 * @returns {number | null}
 */
export function planEndsAtMs(plan) {
  const perfs = Array.isArray(plan?.performances) ? plan.performances : [];
  let latest = null;
  for (const perf of perfs) {
    const end = Date.parse(perf?.expectedEndsAt || '');
    const start = Date.parse(perf?.startsAt || '');
    const ms = Number.isFinite(end) ? end : Number.isFinite(start) ? start : null;
    if (ms == null) continue;
    if (latest == null || ms > latest) latest = ms;
  }
  return latest;
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null | undefined} plan
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isAcceptedPlanUpcoming(plan, now = new Date()) {
  if (!plan) return false;
  const ends = planEndsAtMs(plan);
  if (ends != null) return ends >= now.getTime();
  const date = typeof plan.date === 'string' ? plan.date : '';
  if (!date) return false;
  const today = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  return date >= today;
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem[]} plans
 * @param {Date} [now]
 */
export function partitionAcceptedPlans(plans, now = new Date()) {
  /** @type {import('../stores/acceptedPlansStore.js').AcceptedPlanItem[]} */
  const upcoming = [];
  /** @type {import('../stores/acceptedPlansStore.js').AcceptedPlanItem[]} */
  const past = [];
  for (const plan of plans) {
    if (isAcceptedPlanUpcoming(plan, now)) upcoming.push(plan);
    else past.push(plan);
  }
  const byStartAsc = (a, b) => {
    const aKey = `${a.date}|${a.performances?.[0]?.localTime ?? ''}|${a.planId}`;
    const bKey = `${b.date}|${b.performances?.[0]?.localTime ?? ''}|${b.planId}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  };
  const byStartDesc = (a, b) => -byStartAsc(a, b);
  upcoming.sort(byStartAsc);
  past.sort(byStartDesc);
  return { upcoming, past };
}

/**
 * @param {string | null | undefined} planId
 * @param {{
 *   storage?: Storage | null,
 *   enrichmentIndex?: object | null,
 *   homeData?: object | null,
 * }} [options]
 * @returns {object | null}
 */
export function resolveSavedPlanDetailsPlan(planId, options = {}) {
  const id = typeof planId === 'string' ? planId.trim() : '';
  if (!id) return null;
  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const saved = getAcceptedPlanById(storage, id);
  if (!saved) return null;
  const adapted = acceptedPlanToPlanDetailsPlan(saved, {
    enrichmentIndex: options.enrichmentIndex ?? null,
    homeData: options.homeData ?? null,
  });
  if (!adapted) return null;
  const dateLabel = formatLongPlanDateLabel(saved.date || adapted.date);
  return {
    ...adapted,
    dateLabel,
    dateDisplay: dateLabel,
    summaryDate: dateLabel,
    mode: 'saved',
    acceptedAt: saved.acceptedAt ?? null,
  };
}

/**
 * @param {object | null | undefined} plan
 * @returns {boolean}
 */
export function isSavedPlanDetailsPlan(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (plan.mode === 'saved' || plan.source === 'accepted-plan') return true;
  const id = typeof plan.planId === 'string' ? plan.planId : plan.id;
  return typeof id === 'string' && id.startsWith('accepted:');
}

/**
 * Read `?planId=` from the current location (browser only).
 * @returns {string | null}
 */
export function readSavedPlanIdQuery() {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URLSearchParams(window.location.search)
      .get(SAVED_PLAN_ID_QUERY)
      ?.trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Keep `?planId=` in sync for refreshable saved Plan Detail routes.
 * @param {string | null | undefined} planId
 */
export function syncSavedPlanIdQuery(planId) {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
    return;
  }
  try {
    const url = new URL(window.location.href);
    const next = typeof planId === 'string' ? planId.trim() : '';
    if (next) url.searchParams.set(SAVED_PLAN_ID_QUERY, next);
    else url.searchParams.delete(SAVED_PLAN_ID_QUERY);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== current) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  } catch {
    // ignore URL sync failures
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {Date} [now]
 */
export function listAcceptedPlansPartitioned(storage, now = new Date()) {
  return partitionAcceptedPlans(getAcceptedPlans(storage), now);
}

/**
 * Week offset (Mon-start Pacific weeks) so My Schedule can focus a plan date.
 * @param {string | null | undefined} focusDate YYYY-MM-DD
 * @param {Date} [now]
 * @returns {number}
 */
export function weekOffsetForFocusDate(focusDate, now = new Date()) {
  if (!focusDate || typeof focusDate !== 'string') return 0;
  const today = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  const parseUtcNoon = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d, 12);
  };
  const focusMs = parseUtcNoon(focusDate);
  const todayMs = parseUtcNoon(today);
  if (focusMs == null || todayMs == null) return 0;
  const day = (ms) => {
    // Monday=0 … Sunday=6 in UTC noon calendar math for ISO dates.
    const wd = new Date(ms).getUTCDay();
    return wd === 0 ? 6 : wd - 1;
  };
  const focusMonday = focusMs - day(focusMs) * 86400000;
  const todayMonday = todayMs - day(todayMs) * 86400000;
  return Math.round((focusMonday - todayMonday) / (7 * 86400000));
}
