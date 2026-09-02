/**
 * Resolve a single planned screening for the Planner detail sheet.
 * Source of truth: accepted-plan snapshot (planId + performanceKey).
 */

import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import {
  findAcceptedPlanPerformance,
  getAcceptedPlanById,
} from '../stores/acceptedPlansStore.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import { formatLongPlanDateLabel } from './planLifecycle.js';
import { deriveOtherShowtimesAtTheater } from './deriveOtherShowtimesAtTheater.js';
import { resolvePlannedScreeningMockupPresentation } from '../fixtures/plannerScreeningSheetMockupFixture.js';

/**
 * @param {string | null | undefined} iso
 */
function parseMs(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance} perf
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} enrichmentIndex
 */
function resolvePosterUrl(perf, homeData, enrichmentIndex) {
  const direct = perf.posterUrl;
  if (direct) return direct;
  const filmKey = perf.filmKey;
  if (!filmKey || !homeData) return null;
  const film = resolveFilm(homeData, filmKey);
  if (!film) return null;
  const enriched = enrichHomeFilm(film, enrichmentIndex, 'planner', homeData);
  return enriched.posterUrl ?? enriched.imageUrl ?? null;
}

/**
 * @param {{
 *   planId: string,
 *   performanceKey: string,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   now?: Date,
 *   mockupMode?: boolean,
 * }} options
 */
export function resolvePlannedScreeningPresentation(options) {
  const planId =
    typeof options.planId === 'string' ? options.planId.trim() : '';
  const performanceKey =
    typeof options.performanceKey === 'string'
      ? options.performanceKey.trim()
      : '';
  if (!planId || !performanceKey) {
    return {
      ok: false,
      reason: 'missing_identity',
      screening: null,
    };
  }

  if (options.mockupMode || planId.startsWith('mock-plan-')) {
    return resolvePlannedScreeningMockupPresentation(planId, performanceKey, {
      timeFormatId: options.timeFormatId,
    });
  }

  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const plan = getAcceptedPlanById(storage, planId);
  if (!plan) {
    return { ok: false, reason: 'plan_not_found', screening: null };
  }

  const perf = findAcceptedPlanPerformance(plan, performanceKey);
  if (!perf) {
    return { ok: false, reason: 'performance_not_found', screening: null };
  }

  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';
  const now = options.now ?? new Date();
  const homeData = options.homeData ?? null;
  const enrichmentIndex = options.enrichmentIndex ?? null;

  const dateLabel = formatLongPlanDateLabel(perf.localDate || plan.date);
  const timeLabel =
    formatDisplayClock(perf.localTime, timeFormatId) ?? perf.localTime ?? null;
  const formatLabel = formatUserFacingFormatLabel(perf.format);
  const posterUrl = resolvePosterUrl(perf, homeData, enrichmentIndex);
  const otherShowtimes = deriveOtherShowtimesAtTheater(homeData, {
    filmKey: perf.filmKey,
    theaterId: perf.theaterId,
    performanceKey: perf.performanceKey,
    localDate: perf.localDate,
    localTime: perf.localTime,
    source: perf.source,
    sourceShowtimeId: perf.sourceShowtimeId,
    now,
    timeFormatId,
  });

  return {
    ok: true,
    reason: null,
    screening: {
      planId: plan.planId,
      performanceKey: perf.performanceKey,
      title: perf.title || 'Untitled',
      posterUrl,
      dateLabel,
      localDate: perf.localDate,
      timeLabel,
      localTime: perf.localTime,
      theaterName: perf.theaterName || perf.theaterId,
      theaterId: perf.theaterId,
      formatLabel: formatLabel || null,
      ticketUrl: normalizeExternalTicketUrl(perf.ticketUrl),
      filmId: perf.filmId ?? null,
      filmKey: perf.filmKey ?? null,
      opportunityKey: perf.opportunityKey ?? null,
      runtimeMin: perf.runtimeMin,
      expectedEndsAt: perf.expectedEndsAt ?? null,
      startsAt: perf.startsAt ?? null,
      startMs: parseMs(perf.startsAt),
      source: perf.source ?? null,
      sourceShowtimeId: perf.sourceShowtimeId ?? null,
      ticketsPurchased: perf.ticketsPurchased === true,
      performanceCount: plan.performances.length,
    },
    otherShowtimes,
  };
}
