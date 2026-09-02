/**
 * Add one exact showtime from Saved Films to accepted plans.
 */

import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import { parseRuntimeMinutes } from '../../src/utils/timeUtils.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import {
  acceptPlan,
  buildAcceptedPerformanceKey,
  findAcceptedPlanPerformance,
  getAcceptedPlans,
  normalizeAcceptedPerformance,
} from '../stores/acceptedPlansStore.js';

/**
 * @param {Storage | null | undefined} storage
 * @returns {Set<string>}
 */
export function listPlannedPerformanceKeys(storage) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const plan of getAcceptedPlans(storage)) {
    for (const perf of plan.performances ?? []) {
      if (perf.performanceKey) keys.add(perf.performanceKey);
    }
  }
  return keys;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} performanceKey
 */
export function findPlannedPerformanceByKey(storage, performanceKey) {
  const key =
    typeof performanceKey === 'string' ? performanceKey.trim() : '';
  if (!key) return null;
  for (const plan of getAcceptedPlans(storage)) {
    const perf = findAcceptedPlanPerformance(plan, key);
    if (perf) {
      return { planId: plan.planId, performance: perf, plan };
    }
  }
  return null;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} filmKey
 */
export function listPlannedPerformancesForFilmKey(storage, filmKey) {
  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  if (!key) return [];
  /** @type {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance[]} */
  const matches = [];
  for (const plan of getAcceptedPlans(storage)) {
    for (const perf of plan.performances ?? []) {
      if (perf.filmKey === key) matches.push(perf);
    }
  }
  return matches;
}

/**
 * @param {object} opportunity
 * @param {object | null} film
 * @param {object | null | undefined} enrichmentIndex
 * @param {object | null | undefined} homeData
 */
export function opportunityToAcceptedPerformanceInput(
  opportunity,
  film,
  enrichmentIndex = null,
  homeData = null,
) {
  if (!opportunity || !film) return null;
  const enriched = enrichHomeFilm(film, enrichmentIndex, 'planner', homeData);
  const runtimeMin =
    parseRuntimeMinutes(
      opportunity.runtimeMin ??
        opportunity.runtime ??
        film.runtimeMin ??
        film.runtime,
    ) ?? parseRuntimeMinutes(enriched.runtimeMin ?? enriched.runtime);
  if (runtimeMin == null) return null;

  const localDate =
    opportunity.localDate ??
    (typeof opportunity.sortableLocalDateTime === 'string'
      ? opportunity.sortableLocalDateTime.slice(0, 10)
      : null);
  const localTime = opportunity.localTime ?? opportunity.time ?? null;

  return {
    title: film.title ?? enriched.displayTitle ?? 'Untitled',
    filmId: film.filmId ?? null,
    filmKey: film.filmKey ?? opportunity.filmKey ?? null,
    parentFilmKey: film.parentFilmKey ?? null,
    theaterId: opportunity.theaterId ?? opportunity.theater_id,
    theaterName:
      opportunity.theaterName ?? opportunity.theater ?? opportunity.theaterId,
    localDate,
    localTime,
    date: localDate,
    time: localTime,
    runtimeMin,
    runtime: runtimeMin,
    format:
      (Array.isArray(opportunity.formatLabels)
        ? opportunity.formatLabels[0]
        : null) ??
      opportunity.format ??
      opportunity.formatLabel,
    ticketUrl: normalizeExternalTicketUrl(opportunity.ticketUrl),
    posterUrl: enriched.posterUrl ?? film.posterUrl ?? null,
    source: opportunity.source ?? film.source ?? null,
    sourceShowtimeId:
      opportunity.sourceShowtimeId ?? opportunity.source_showtime_id ?? null,
    opportunityKey: opportunity.opportunityKey ?? null,
    addressLabel: opportunity.addressLabel ?? null,
    provenance: 'live',
  };
}

/**
 * @param {object} opportunity
 * @param {object | null} film
 * @param {object | null | undefined} enrichmentIndex
 * @param {object | null | undefined} homeData
 */
export function buildPerformanceKeyForOpportunity(
  opportunity,
  film,
  enrichmentIndex = null,
  homeData = null,
) {
  const input = opportunityToAcceptedPerformanceInput(
    opportunity,
    film,
    enrichmentIndex,
    homeData,
  );
  if (!input) return null;
  return (
    buildAcceptedPerformanceKey(input) ??
    buildPerformanceKey({
      source: input.source,
      sourceShowtimeId: input.sourceShowtimeId,
      filmKey: input.filmKey,
      theaterId: input.theaterId,
      localDate: input.localDate,
      localTime: input.localTime,
    })
  );
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object} opportunity
 * @param {string} filmKey
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   now?: () => Date,
 * }} [options]
 */
export function addSavedFilmShowtimeToPlanner(
  storage,
  opportunity,
  filmKey,
  options = {},
) {
  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  if (!key || !opportunity) {
    return {
      ok: false,
      changed: false,
      status: 'invalid_args',
      error: 'invalid_args',
      plan: null,
      performanceKey: null,
    };
  }

  const homeData = options.homeData ?? null;
  const film = resolveFilm(homeData, key);
  if (!film) {
    return {
      ok: false,
      changed: false,
      status: 'film_not_found',
      error: 'film_not_found',
      plan: null,
      performanceKey: null,
    };
  }

  const input = opportunityToAcceptedPerformanceInput(
    opportunity,
    film,
    options.enrichmentIndex ?? null,
    homeData,
  );
  if (!input) {
    return {
      ok: false,
      changed: false,
      status: 'invalid_showtime',
      error: 'invalid_showtime',
      plan: null,
      performanceKey: null,
    };
  }

  const built = normalizeAcceptedPerformance(input);
  if (!built.ok) {
    return {
      ok: false,
      changed: false,
      status: built.error?.code ?? 'invalid_performance',
      error: built.error?.code ?? 'invalid_performance',
      plan: null,
      performanceKey: null,
    };
  }

  const performanceKey = built.performance.performanceKey;
  const existing = findPlannedPerformanceByKey(storage, performanceKey);
  if (existing) {
    return {
      ok: true,
      changed: false,
      status: 'already_planned',
      error: null,
      plan: existing.plan,
      performanceKey,
      planId: existing.planId,
    };
  }

  const written = acceptPlan(storage, {
    performances: [built.performance],
    date: built.performance.localDate,
    provenance: 'live',
    now: options.now,
  });

  if (!written.ok) {
    return {
      ok: false,
      changed: false,
      status: written.error ?? 'storage_failed',
      error: written.error ?? 'storage_failed',
      plan: null,
      performanceKey,
    };
  }

  return {
    ok: true,
    changed: Boolean(written.changed),
    status: written.changed ? 'added' : 'already_planned',
    error: null,
    plan: written.plan,
    performanceKey,
    planId: written.plan?.planId ?? null,
  };
}
