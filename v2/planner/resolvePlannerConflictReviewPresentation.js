/**
 * Resolve Planner conflict review presentation from accepted plans + HomeData.
 */

import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import { formatLongPlanDateLabel } from './planLifecycle.js';
import { listUpcomingPlannerScreenings } from './composePlannerLandingPresentation.js';
import { findConflictClusters } from './plannerScreeningOverlap.js';
import { deriveConflictReviewAlternates } from './deriveConflictReviewAlternates.js';
import { recommendConflictBestPath } from './plannerConflictBestPath.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import {
  PLANNER_CONFLICT_REVIEW_MOCKUP_ID,
  resolvePlannerConflictReviewMockupPresentation,
} from '../fixtures/plannerConflictReviewMockupFixture.js';

/**
 * @param {string} isoDate
 */
function weekdayLong(isoDate) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(date);
  } catch {
    return '';
  }
}

/**
 * @param {object | null | undefined} perf
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} enrichmentIndex
 */
function resolvePosterUrl(perf, homeData, enrichmentIndex) {
  if (perf?.posterUrl) return perf.posterUrl;
  const filmKey = perf?.filmKey;
  if (!filmKey || !homeData) return null;
  const film = resolveFilm(homeData, filmKey);
  if (!film) return null;
  const enriched = enrichHomeFilm(film, enrichmentIndex, 'planner', homeData);
  return enriched.posterUrl ?? enriched.imageUrl ?? null;
}

/**
 * @param {object} screening
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} enrichmentIndex
 * @param {string} timeFormatId
 */
function toConflictMember(screening, homeData, enrichmentIndex, timeFormatId) {
  const dateLabel = formatLongPlanDateLabel(screening.localDate || screening.dateKey);
  const weekdayLabel = weekdayLong(screening.localDate || screening.dateKey || '');
  const timeLabel =
    screening.timeLabel ??
    formatDisplayClock(screening.localTime, timeFormatId) ??
    screening.localTime ??
    null;
  const formatLabel = formatUserFacingFormatLabel(
    screening.formatLabel ?? screening.format,
  );
  const venue = screening.venueLabel ?? screening.theaterName ?? screening.theaterId;
  const currentScreeningLabel = [timeLabel, venue].filter(Boolean).join(' • ');
  return {
    planId: screening.planId,
    performanceKey: screening.performanceKey,
    title: screening.title,
    posterUrl: resolvePosterUrl(screening, homeData, enrichmentIndex),
    dateLabel,
    weekdayLabel,
    localDate: screening.localDate,
    timeLabel,
    localTime: screening.localTime,
    theaterName: venue,
    theaterId: screening.theaterId,
    formatLabel: formatLabel || null,
    ticketUrl: normalizeExternalTicketUrl(screening.ticketUrl),
    filmKey: screening.filmKey ?? null,
    filmId: screening.filmId ?? null,
    source: screening.source ?? null,
    sourceShowtimeId: screening.sourceShowtimeId ?? null,
    runtimeMin: screening.runtimeMin,
    currentScreeningLabel,
    startMs: screening.startMs ?? null,
    endMs: screening.endMs ?? null,
    startsAt: screening.startsAt ?? null,
    expectedEndsAt: screening.expectedEndsAt ?? null,
  };
}

/**
 * @param {string} conflictId
 * @param {Array<object>} allScreenings
 */
export function findConflictClusterById(conflictId, allScreenings) {
  const id =
    typeof conflictId === 'string' && conflictId.trim() ? conflictId.trim() : '';
  if (!id) return null;
  const clusters = findConflictClusters(allScreenings);
  return clusters.find((cluster) => cluster.id === id) ?? null;
}

/**
 * @param {{
 *   conflictId: string,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   now?: Date,
 *   mockupMode?: boolean,
 * }} options
 */
export function resolvePlannerConflictReviewPresentation(options) {
  const conflictId =
    typeof options.conflictId === 'string' ? options.conflictId.trim() : '';
  if (!conflictId) {
    return { ok: false, reason: 'missing_conflict_id', presentation: null };
  }

  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';

  if (
    options.mockupMode ||
    conflictId === PLANNER_CONFLICT_REVIEW_MOCKUP_ID ||
    conflictId.includes('mock-bottoms')
  ) {
    return resolvePlannerConflictReviewMockupPresentation(conflictId, {
      timeFormatId,
    });
  }

  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = options.now ?? new Date();
  const homeData = options.homeData ?? null;
  const enrichmentIndex = options.enrichmentIndex ?? null;

  const screenings = listUpcomingPlannerScreenings({ storage, now, timeFormatId });
  const cluster = findConflictClusterById(conflictId, screenings);
  if (!cluster) {
    return { ok: false, reason: 'conflict_not_found', presentation: null };
  }

  const clusterMemberIds = new Set(cluster.members.map((m) => m.id));
  const plannedWindows = screenings
    .filter((s) => !clusterMemberIds.has(s.id))
    .map((s) => ({ startMs: s.startMs, endMs: s.endMs }));

  const members = cluster.members.map((screening) => {
    const member = toConflictMember(
      screening,
      homeData,
      enrichmentIndex,
      timeFormatId,
    );
    const windowsForMember = [
      ...plannedWindows,
      ...cluster.members
        .filter((other) => other.id !== screening.id)
        .map((other) => ({ startMs: other.startMs, endMs: other.endMs })),
    ];
    const alternates = deriveConflictReviewAlternates(homeData, {
      filmKey: screening.filmKey,
      theaterId: screening.theaterId,
      performanceKey: screening.performanceKey,
      localDate: screening.localDate,
      localTime: screening.localTime,
      source: screening.source,
      sourceShowtimeId: screening.sourceShowtimeId,
      runtimeMin: screening.runtimeMin,
      referenceDate: screening.localDate,
      plannedWindows: windowsForMember,
      now,
      timeFormatId,
    });
    return {
      ...member,
      viableAlternates: alternates.items,
      visibleAlternates: alternates.visibleItems,
      moreAlternateCount: alternates.moreCount,
      hasAlternatives: alternates.visibleItems.length > 0,
    };
  });

  const dateKey = cluster.dateKey || members[0]?.localDate || '';
  const bestPath = recommendConflictBestPath(members);

  return {
    ok: true,
    reason: null,
    presentation: {
      source: 'accepted-plans',
      conflictId: cluster.id,
      dateLabel: formatLongPlanDateLabel(dateKey),
      weekdayLabel: weekdayLong(dateKey),
      title: 'These showtimes overlap',
      subtitle:
        'Review each film below. Move a film to another showtime, or remove it from Planner.',
      members,
      bestPath,
    },
  };
}

/**
 * @param {string} conflictId
 * @param {Storage | null | undefined} storage
 * @param {Date} [now]
 * @param {string[]} [memberPlanIds]
 */
export function isPlannerConflictResolved(
  conflictId,
  storage,
  now = new Date(),
  memberPlanIds = [],
) {
  const screenings = listUpcomingPlannerScreenings({ storage, now });
  if (findConflictClusterById(conflictId, screenings)) return false;

  const planIdSet = new Set(
    (Array.isArray(memberPlanIds) ? memberPlanIds : []).filter(Boolean),
  );
  if (planIdSet.size < 2) return true;

  const involved = screenings.filter((s) => planIdSet.has(s.planId));
  if (involved.length < 2) return true;
  return findConflictClusters(involved).length === 0;
}

/**
 * Map a conflict-review alternate row to accepted-plan performance input.
 * @param {object} alternate
 * @param {object} member
 */
export function alternateToAcceptedPerformanceInput(alternate, member) {
  return {
    title: member.title,
    filmId: member.filmId,
    filmKey: alternate.filmKey ?? member.filmKey,
    parentFilmKey: member.parentFilmKey ?? null,
    theaterId: alternate.theaterId ?? member.theaterId,
    theaterName: alternate.theaterName ?? member.theaterName,
    localDate: alternate.localDate,
    localTime: alternate.localTime,
    source: alternate.source ?? member.source,
    sourceShowtimeId: alternate.sourceShowtimeId ?? member.sourceShowtimeId,
    opportunityKey: alternate.opportunityKey ?? null,
    runtimeMin: alternate.runtimeMin ?? member.runtimeMin,
    format: alternate.formatLabel ?? member.formatLabel,
    ticketUrl: alternate.ticketUrl ?? member.ticketUrl,
    posterUrl: member.posterUrl,
  };
}
