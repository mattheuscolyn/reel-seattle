/**
 * Pure helpers for the Browse / Showtimes action sheet.
 */

import { formatCompactDateLabel } from '../explore/exploreCatalog.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import {
  buildPerformanceKeyForOpportunity,
  findPlannedPerformanceByKey,
} from '../planner/addSavedFilmShowtimeToPlanner.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import { resolveHomeOpportunity } from './resolveHomeOpportunity.js';

/**
 * @param {{
 *   row?: {
 *     opportunityKey?: string | null,
 *     filmKey?: string | null,
 *     filmTitle?: string | null,
 *     localDate?: string | null,
 *     localTime?: string | null,
 *     timeDisplay?: string | null,
 *     theaterName?: string | null,
 *     formatLabels?: string[],
 *     ticketUrl?: string | null,
 *   } | null,
 *   homeData?: object | null,
 * }} params
 */
export function resolveBrowseShowtimeOpportunity({ row, homeData }) {
  if (!row?.opportunityKey) return null;
  return resolveHomeOpportunity(homeData, row.opportunityKey);
}

/**
 * @param {{
 *   storage?: Storage | null,
 *   opportunity?: object | null,
 *   filmKey?: string | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   row?: {
 *     filmTitle?: string | null,
 *     timeDisplay?: string | null,
 *     theaterName?: string | null,
 *     formatLabels?: string[],
 *     ticketUrl?: string | null,
 *     localDate?: string | null,
 *   } | null,
 * }} params
 */
export function resolveShowtimeActionSheetState({
  storage = null,
  opportunity = null,
  filmKey = null,
  homeData = null,
  enrichmentIndex = null,
  timeFormatId = '12h',
  row = null,
}) {
  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  if (!key || !opportunity) {
    return {
      ok: false,
      performanceKey: null,
      inPlanner: false,
      context: null,
      ticketUrl: null,
    };
  }

  const film = resolveFilm(homeData, key);
  if (!film) {
    return {
      ok: false,
      performanceKey: null,
      inPlanner: false,
      context: null,
      ticketUrl: null,
    };
  }

  const enriched = enrichHomeFilm(film, enrichmentIndex, 'showtimes', homeData);
  const performanceKey = buildPerformanceKeyForOpportunity(
    opportunity,
    film,
    enrichmentIndex,
    homeData,
  );
  const inPlanner = performanceKey
    ? Boolean(findPlannedPerformanceByKey(storage, performanceKey))
    : false;
  const localDate =
    opportunity.localDate ??
    row?.localDate ??
    (typeof opportunity.sortableLocalDateTime === 'string'
      ? opportunity.sortableLocalDateTime.slice(0, 10)
      : null);
  const localTime = opportunity.localTime ?? opportunity.time ?? null;
  const formatLabel =
    (Array.isArray(opportunity.formatLabels) && opportunity.formatLabels[0]) ||
    (Array.isArray(row?.formatLabels) && row.formatLabels[0]) ||
    null;
  const ticketUrl = normalizeExternalTicketUrl(
    opportunity.ticketUrl ?? row?.ticketUrl ?? null,
  );

  return {
    ok: true,
    performanceKey,
    inPlanner,
    film,
    opportunity,
    ticketUrl,
    context: {
      filmTitle:
        row?.filmTitle ??
        enriched.displayTitle ??
        film.title ??
        'Untitled',
      dateLabel: localDate ? formatCompactDateLabel(localDate) : null,
      timeLabel:
        row?.timeDisplay ??
        (localTime ? formatDisplayClock(localTime, timeFormatId) : null),
      theaterName:
        opportunity.theaterName ??
        row?.theaterName ??
        opportunity.theaterId ??
        'Theater',
      formatLabel,
      posterUrl: enriched.posterUrl ?? film.posterUrl ?? null,
    },
  };
}
