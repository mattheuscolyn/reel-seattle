/**
 * Recommended Experience destination presentation.
 */

import {
  buildVenueMark,
  opportunityFormatLabel,
  resolveFilm,
} from '../filmDetail/filmDetailModel.js';
import {
  buildDepartureTimingPresentation,
  findLeavingSoonEntryForFilm,
} from '../filmDetail/departureTiming.js';
import { formatCompactDateLabel, pacificDateString } from '../explore/exploreCatalog.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import {
  buildRecommendedExperienceSignals,
  listMatchingOpportunitiesForExperience,
  resolveRecommendedExperience,
} from './recommendedExperienceModel.js';

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   filmKey?: string | null,
 *   experienceType?: 'format' | 'venue' | null,
 *   experienceId?: string | null,
 *   timeFormatId?: string,
 *   now?: Date | (() => Date),
 *   departureTiming?: object | null,
 * }} params
 */
export function composeRecommendedExperienceDestination(params = {}) {
  const homeData = params.homeData ?? null;
  const filmKey = typeof params.filmKey === 'string' ? params.filmKey.trim() : '';
  const experienceType =
    params.experienceType === 'venue'
      ? 'venue'
      : params.experienceType === 'format'
        ? 'format'
        : null;
  const experienceId =
    typeof params.experienceId === 'string' ? params.experienceId.trim() : '';
  const timeFormatId = params.timeFormatId ?? '12h';
  const now =
    typeof params.now === 'function' ? params.now() : (params.now ?? new Date());

  if (!homeData || !filmKey || !experienceType || !experienceId) {
    return { ok: false, reason: 'missing_params', experience: null, groups: [] };
  }

  const film = resolveFilm(homeData, filmKey);
  if (!film) {
    return { ok: false, reason: 'film_not_found', experience: null, groups: [] };
  }

  const enriched = enrichHomeFilm(
    film,
    params.enrichmentIndex,
    'recommended-experience',
    homeData,
  );

  const leavingEntry = findLeavingSoonEntryForFilm(
    film,
    homeData?.leavingSoon?.entries,
  );
  const departureTiming =
    params.departureTiming ??
    buildDepartureTimingPresentation(leavingEntry, {
      todayIso: pacificDateString(now),
    });

  const experience =
    resolveRecommendedExperience({
      homeData,
      filmKey,
      departureTiming,
      now,
    }) ?? null;

  // Prefer the navigated identity if it still matches the temporary seed result;
  // otherwise rebuild from the explicit type/id so deep links stay stable.
  let active = experience;
  if (
    !active ||
    active.type !== experienceType ||
    active.id !== experienceId
  ) {
    const matching = listMatchingOpportunitiesForExperience({
      homeData,
      filmKey,
      type: experienceType,
      id: experienceId,
      now,
    });
    if (matching.length === 0) {
      return {
        ok: false,
        reason: 'no_matching_showtimes',
        experience: null,
        film: {
          filmKey,
          title: enriched.displayTitle ?? film.title ?? 'Untitled',
          posterUrl: enriched.posterUrl ?? film.posterUrl ?? null,
        },
        groups: [],
        signals: [],
      };
    }
    active = resolveRecommendedExperience({
      homeData,
      filmKey,
      opportunityKey: matching[0].opportunityKey,
      departureTiming: params.departureTiming ?? null,
      now,
    });
    if (!active || active.type !== experienceType || active.id !== experienceId) {
      // Explicit filter still valid even if temporary seed would pick differently.
      active = {
        type: experienceType,
        id: experienceId,
        label:
          experienceType === 'venue'
            ? matching[0].theaterName ?? experienceId
            : experienceId,
        reason: null,
        matchingPerformanceKeys: matching.map((o) => o.opportunityKey).filter(Boolean),
        venueCount: new Set(matching.map((o) => o.theaterId ?? o.theaterName)).size,
        showtimeCount: matching.length,
        firstShowDate: matching[0]?.localDate ?? null,
        bookedThroughLabel: params.departureTiming?.secondaryLabel ?? null,
        availabilityPattern: null,
        departureTimingLabel: params.departureTiming?.primaryLabel ?? null,
        urgencyConfidence: params.departureTiming?.confidence ?? null,
        source: 'temporary_best_way_seed',
        seedOpportunityKey: matching[0]?.opportunityKey ?? null,
      };
    }
  }

  const matching = listMatchingOpportunitiesForExperience({
    homeData,
    filmKey,
    type: active.type,
    id: active.id,
    now,
  });

  /** @type {Map<string, { localDate: string, dateLabel: string, theaters: Map<string, object> }>} */
  const byDate = new Map();
  for (const opp of matching) {
    const localDate =
      typeof opp.localDate === 'string'
        ? opp.localDate
        : typeof opp.sortableLocalDateTime === 'string'
          ? opp.sortableLocalDateTime.slice(0, 10)
          : null;
    if (!localDate) continue;
    if (!byDate.has(localDate)) {
      byDate.set(localDate, {
        localDate,
        dateLabel: formatCompactDateLabel(localDate) ?? localDate,
        theaters: new Map(),
      });
    }
    const day = byDate.get(localDate);
    const theaterKey = String(opp.theaterId ?? opp.theaterName ?? 'theater');
    if (!day.theaters.has(theaterKey)) {
      const mark = buildVenueMark(opp.theaterName, opp.theaterId);
      day.theaters.set(theaterKey, {
        theaterId: opp.theaterId ?? theaterKey,
        theaterName: opp.theaterName ?? 'Theater',
        venueMark: mark.label,
        accent: mark.accent,
        times: [],
      });
    }
    const theater = day.theaters.get(theaterKey);
    theater.times.push({
      opportunityKey: opp.opportunityKey,
      localTime: opp.localTime ?? null,
      timeDisplay: formatDisplayClock(
        opp.timeDisplay ?? opp.localTime,
        timeFormatId,
      ),
      formatLabel: opportunityFormatLabel(opp),
      ticketUrl: opp.ticketUrl ?? null,
    });
  }

  const groups = [...byDate.values()]
    .sort((a, b) => a.localDate.localeCompare(b.localDate))
    .map((day) => ({
      localDate: day.localDate,
      dateLabel: day.dateLabel,
      theaters: [...day.theaters.values()].sort((a, b) =>
        String(a.theaterName).localeCompare(String(b.theaterName)),
      ),
    }));

  return {
    ok: true,
    reason: null,
    film: {
      filmKey,
      title: enriched.displayTitle ?? film.title ?? 'Untitled',
      posterUrl: enriched.posterUrl ?? film.posterUrl ?? null,
    },
    experience: active,
    signals: buildRecommendedExperienceSignals(active),
    groups,
  };
}
