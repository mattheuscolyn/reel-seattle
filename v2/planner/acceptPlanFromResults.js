/**
 * Plan Results → accepted-plan acceptance (T-PLAN-01).
 *
 * Validates selected itinerary rows as live showtimes, then persists via
 * `acceptedPlansStore`. Fixture-only Results fail closed with no write.
 */

import {
  acceptPlan,
  buildAcceptedPlanItem,
} from '../stores/acceptedPlansStore.js';

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
 * True when a Results film row already carries exportable live fields.
 * Fixture display strings alone are insufficient.
 * @param {object} item
 */
export function isLiveResultsFilmRow(item) {
  if (!item || typeof item !== 'object' || item.type === 'break') return false;
  const date = asTrimmed(item.date) ?? asTrimmed(item.localDate);
  const time =
    asTrimmed(item.time) ??
    asTrimmed(item.localTime) ??
    asTrimmed(item.startTime);
  const theaterId =
    asTrimmed(item.theaterId) ?? asTrimmed(item.theater_id);
  const runtime =
    item.runtime ?? item.runtimeMin ?? item.runtimeMinutes ?? null;
  const filmKey = asTrimmed(item.filmKey);
  const hasIdentity = Boolean(
    (asTrimmed(item.source) &&
      (asTrimmed(item.sourceShowtimeId) ||
        asTrimmed(item.source_showtime_id))) ||
      (filmKey && theaterId && date && time),
  );
  return Boolean(date && time && theaterId && runtime != null && hasIdentity);
}

/**
 * Collect selected film rows from a Results plan card.
 * @param {object | null | undefined} plan
 * @param {string[]} selectedFilmIds
 */
export function selectedResultsFilmRows(plan, selectedFilmIds) {
  if (!plan || !Array.isArray(plan.items)) return [];
  const selected = new Set(selectedFilmIds ?? []);
  /** @type {object[]} */
  const films = [];
  for (const item of plan.items) {
    if (!item || item.type === 'break') continue;
    if (selected.size > 0 && !selected.has(item.id)) continue;
    films.push(item);
  }
  return films;
}

/**
 * @param {object | null | undefined} plan
 * @param {string[]} selectedFilmIds
 * @param {{
 *   storage?: Storage | null,
 *   provenance?: string | null,
 *   label?: string | null,
 *   settingsSnapshot?: Record<string, unknown> | null,
 *   now?: () => Date,
 * }} [options]
 */
export function acceptResultsPlan(plan, selectedFilmIds, options = {}) {
  const provenance =
    asTrimmed(options.provenance) ??
    asTrimmed(plan?.provenance) ??
    asTrimmed(plan?.source) ??
    'fixture';

  if (provenance !== 'live') {
    return {
      ok: false,
      error: 'fixture_plan',
      message:
        'Add to Planner needs a real itinerary. Fixture results can’t be saved.',
      store: null,
      plan: null,
      changed: false,
    };
  }

  const rows = selectedResultsFilmRows(plan, selectedFilmIds);
  if (rows.length === 0) {
    return {
      ok: false,
      error: 'empty_plan',
      message: 'Select at least one film with a real showtime to save.',
      store: null,
      plan: null,
      changed: false,
    };
  }

  if (!rows.every(isLiveResultsFilmRow)) {
    return {
      ok: false,
      error: 'mixed_or_incomplete',
      message:
        'This plan still has fixture or incomplete showtimes, so it wasn’t saved.',
      store: null,
      plan: null,
      changed: false,
    };
  }

  const built = buildAcceptedPlanItem({
    performances: rows,
    label: options.label ?? plan?.label ?? null,
    date: plan?.date ?? rows[0]?.date ?? rows[0]?.localDate ?? null,
    provenance: 'live',
    settingsSnapshot: options.settingsSnapshot ?? null,
    now: options.now,
  });
  if (!built.ok) {
    return {
      ok: false,
      error: built.error?.code ?? 'invalid_plan',
      message:
        built.error?.message ??
        'This plan can’t be saved. Check showtimes and try again.',
      store: null,
      plan: null,
      changed: false,
    };
  }

  const written = acceptPlan(options.storage, {
    performances: rows,
    label: built.plan.label,
    date: built.plan.date,
    provenance: 'live',
    settingsSnapshot: options.settingsSnapshot ?? null,
    now: options.now,
  });

  if (!written.ok) {
    return {
      ok: false,
      error: written.error ?? 'storage_set_failed',
      message:
        written.error === 'quota_exceeded'
          ? 'Could not save this plan — storage is full.'
          : 'Could not save this plan. Try again.',
      store: written.store,
      plan: null,
      changed: false,
    };
  }

  return {
    ok: true,
    error: null,
    message: written.changed
      ? 'Added to Planner.'
      : 'Already in Planner.',
    store: written.store,
    plan: written.plan,
    changed: Boolean(written.changed),
  };
}
