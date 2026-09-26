/**
 * Adapt personal AcceptedPlanItem ↔ SharedPlan screenings without mutating
 * the solo Planner store. Shared plans may reference a source accepted plan id
 * but do not auto-convert every local plan into a network-shared plan.
 */

import {
  buildAcceptedPlanItem,
  normalizeAcceptedPlansStore,
} from '../stores/acceptedPlansStore.js';
import {
  createSharedPlan,
  normalizeSharedPlanScreenings,
} from './sharedPlanModel.js';

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null | undefined} accepted
 * @param {{
 *   ownerId: string,
 *   type?: 'proposal' | 'decided',
 *   visibility?: 'private' | 'invited' | 'friends',
 *   now?: string | number | Date,
 * }} options
 */
export function sharedPlanFromAcceptedPlan(accepted, options) {
  if (!accepted || typeof accepted !== 'object') {
    return { ok: false, reason: 'invalid_plan' };
  }
  if (accepted.provenance !== 'live') {
    return { ok: false, reason: 'invalid_plan' };
  }
  const rebuilt = buildAcceptedPlanItem({
    performances: accepted.performances,
    label: accepted.label,
    date: accepted.date,
    provenance: 'live',
    settingsSnapshot: accepted.settingsSnapshot,
    now: () => new Date(accepted.acceptedAt || Date.now()),
  });
  if (!rebuilt.ok || !rebuilt.plan) {
    return { ok: false, reason: 'invalid_screening' };
  }
  return createSharedPlan({
    ownerId: options.ownerId,
    type: options.type ?? 'decided',
    visibility: options.visibility ?? 'private',
    screenings: rebuilt.plan.performances,
    label: accepted.label ?? rebuilt.plan.label,
    date: accepted.date ?? rebuilt.plan.date,
    timezone: accepted.timezone ?? rebuilt.plan.timezone,
    sourceAcceptedPlanId: accepted.planId,
    now: options.now,
  });
}

/**
 * Build a local AcceptedPlanItem-shaped snapshot from a SharedPlan for
 * personal Planner mirrors (optional later). Does not write storage.
 *
 * @param {import('./sharedPlanModel.js').SharedPlan} plan
 * @param {{ now?: string | number | Date }} [options]
 */
export function acceptedPlanSnapshotFromSharedPlan(plan, options = {}) {
  const screenings = normalizeSharedPlanScreenings(plan?.screenings);
  if (screenings.length === 0) return { ok: false, reason: 'empty_screenings' };
  const now =
    options.now instanceof Date
      ? options.now
      : typeof options.now === 'number'
        ? new Date(options.now)
        : new Date(plan.createdAt || Date.now());
  const built = buildAcceptedPlanItem({
    performances: screenings,
    label: plan.label,
    date: plan.date ?? screenings[0].localDate,
    provenance: 'live',
    settingsSnapshot: null,
    now: () => now,
  });
  if (!built.ok || !built.plan) return { ok: false, reason: 'invalid_plan' };
  // Preserve shared plan id separately from personal accepted plan id.
  return {
    ok: true,
    plan: {
      ...built.plan,
      // Personal store still uses its deterministic accepted: id.
      // Shared identity remains plan.planId on the shared object.
      label: plan.label ?? built.plan.label,
    },
    sharedPlanId: plan.planId,
    sourceAcceptedPlanId: plan.sourceAcceptedPlanId,
  };
}

/**
 * Confirm existing solo accepted plans still load after shared-plan code lands.
 *
 * @param {Storage | null | undefined} storage
 */
export function loadSoloAcceptedPlansUnchanged(storage) {
  let raw = null;
  try {
    if (storage && typeof storage.getItem === 'function') {
      const text = storage.getItem('reel-seattle.v2.acceptedPlans');
      raw = text ? JSON.parse(text) : null;
    }
  } catch {
    raw = null;
  }
  const normalized = normalizeAcceptedPlansStore(raw);
  return normalized.store;
}
