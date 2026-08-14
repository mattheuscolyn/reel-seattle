/**
 * Pure SHOWTIMES_AVAILABLE watch-episode reconciliation + notification draft.
 *
 * Transition rule (Phase 3):
 * - A Save becomes watch-eligible when first observed (or re-activated after
 *   unsave) while there are NO qualifying future Seattle showtimes
 *   (`enrolled_unavailable = true`).
 * - Saving while showtimes already exist baselines as available
 *   (`enrolled_unavailable = false`) and never notifies for that episode.
 * - One notification per episode when enrolled_unavailable flips to available.
 * - Unsave deactivates the watch; history notifications remain.
 * - Re-save starts a new episode only via re-activation (new episode_id).
 */

import { randomUUID } from 'node:crypto';
import {
  hasQualifyingFutureShowtimes,
  pickEarliestQualifyingOpportunity,
} from '../showtimes/qualifyingShowtimes.js';
import { opportunitySortableKey } from '../showtimes/showtimeEligibility.js';
import { NOTIFICATION_TYPES } from './notificationModel.js';

export const SHOWTIMES_AVAILABLE_BODY =
  'You saved this film before showtimes were announced.';

/**
 * @param {string} userId
 * @param {string} filmKey
 * @param {string} episodeId
 */
export function buildShowtimesAvailableOccurrenceKey(userId, filmKey, episodeId) {
  return `showtimes_available:${userId}:${filmKey}:${episodeId}`;
}

/**
 * Short month+day label for notification snapshot (e.g. "Dec 17").
 * @param {string | null | undefined} isoDate
 */
export function formatNotificationDateLabel(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * @param {object | null | undefined} opportunity
 */
export function formatNotificationTimeLabel(opportunity) {
  const display =
    typeof opportunity?.timeDisplay === 'string' && opportunity.timeDisplay.trim()
      ? opportunity.timeDisplay.trim()
      : null;
  if (display) return `First showing ${display}`;
  return null;
}

/**
 * Reconcile one Saved preference against current availability + existing watch.
 *
 * @param {{
 *   userId: string,
 *   filmKey: string,
 *   filmId?: string | null,
 *   showtimeFilmKey?: string | null,
 *   isSavedActive: boolean,
 *   available: boolean,
 *   existingWatch?: {
 *     is_active: boolean,
 *     enrolled_unavailable: boolean,
 *     episode_id: string,
 *     notified_at: string | null,
 *     film_id?: string | null,
 *     showtime_film_key?: string | null,
 *   } | null,
 *   nowIso?: string,
 *   newEpisodeId?: () => string,
 * }} input
 * @returns {{
 *   watch: {
 *     user_id: string,
 *     film_key: string,
 *     film_id: string | null,
 *     showtime_film_key: string | null,
 *     is_active: boolean,
 *     enrolled_unavailable: boolean,
 *     episode_id: string,
 *     notified_at: string | null,
 *   } | null,
 *   shouldNotify: boolean,
 *   skipReason: string | null,
 * }}
 */
export function reconcileShowtimeWatch(input) {
  const {
    userId,
    filmKey,
    filmId = null,
    showtimeFilmKey = null,
    isSavedActive,
    available,
    existingWatch = null,
    nowIso = new Date().toISOString(),
    newEpisodeId = () => randomUUID(),
  } = input;

  if (!userId || !filmKey) {
    return { watch: null, shouldNotify: false, skipReason: 'identity_failure' };
  }

  if (!isSavedActive) {
    if (!existingWatch) {
      return { watch: null, shouldNotify: false, skipReason: 'unsaved_no_watch' };
    }
    return {
      watch: {
        user_id: userId,
        film_key: filmKey,
        film_id: filmId ?? existingWatch.film_id ?? null,
        showtime_film_key:
          showtimeFilmKey ?? existingWatch.showtime_film_key ?? null,
        is_active: false,
        enrolled_unavailable: existingWatch.enrolled_unavailable,
        episode_id: existingWatch.episode_id,
        notified_at: existingWatch.notified_at,
      },
      shouldNotify: false,
      skipReason: 'unsaved',
    };
  }

  // First observation OR re-activation after unsave → new episode baseline.
  if (!existingWatch || !existingWatch.is_active) {
    const episodeId = newEpisodeId();
    return {
      watch: {
        user_id: userId,
        film_key: filmKey,
        film_id: filmId,
        showtime_film_key: showtimeFilmKey,
        is_active: true,
        enrolled_unavailable: !available,
        episode_id: episodeId,
        notified_at: null,
      },
      shouldNotify: false,
      skipReason: available
        ? 'baseline_already_available'
        : 'enrolled_watching',
    };
  }

  // Active episode continues.
  const watch = {
    user_id: userId,
    film_key: filmKey,
    film_id: filmId ?? existingWatch.film_id ?? null,
    showtime_film_key:
      showtimeFilmKey ?? existingWatch.showtime_film_key ?? null,
    is_active: true,
    enrolled_unavailable: existingWatch.enrolled_unavailable,
    episode_id: existingWatch.episode_id,
    notified_at: existingWatch.notified_at,
  };

  if (!available) {
    // Do not flip baseline-available → enrolled on temporary disappearance.
    return {
      watch,
      shouldNotify: false,
      skipReason: 'still_unavailable',
    };
  }

  if (!watch.enrolled_unavailable) {
    return {
      watch,
      shouldNotify: false,
      skipReason: 'baseline_already_available',
    };
  }

  if (watch.notified_at) {
    return {
      watch,
      shouldNotify: false,
      skipReason: 'already_notified',
    };
  }

  return {
    watch: { ...watch, notified_at: nowIso },
    shouldNotify: true,
    skipReason: null,
  };
}

/**
 * Build a durable notification draft for SHOWTIMES_AVAILABLE.
 *
 * @param {{
 *   userId: string,
 *   filmKey: string,
 *   episodeId: string,
 *   filmId?: string | null,
 *   showtimeFilmKey?: string | null,
 *   title?: string | null,
 *   posterUrl?: string | null,
 *   opportunity?: object | null,
 *   createdAt?: string,
 * }} input
 */
export function buildShowtimesAvailableNotificationDraft(input) {
  const {
    userId,
    filmKey,
    episodeId,
    filmId = null,
    showtimeFilmKey = null,
    title = null,
    posterUrl = null,
    opportunity = null,
    createdAt = new Date().toISOString(),
  } = input;

  const occurrenceKey = buildShowtimesAvailableOccurrenceKey(
    userId,
    filmKey,
    episodeId,
  );
  const startsAt =
    opportunity != null ? opportunitySortableKey(opportunity) : null;

  const dateLabel = formatNotificationDateLabel(opportunity?.localDate);
  const timeLabel = formatNotificationTimeLabel(opportunity);

  return {
    user_id: userId,
    type: NOTIFICATION_TYPES.showtimesAvailable,
    film_key: filmKey,
    film_id: filmId,
    showtime_film_key: showtimeFilmKey,
    occurrence_key: occurrenceKey,
    title_snapshot: title,
    body_snapshot: SHOWTIMES_AVAILABLE_BODY,
    poster_url_snapshot: posterUrl,
    event_snapshot: {
      theaterId: opportunity?.theaterId ?? null,
      theaterName: opportunity?.theaterName ?? null,
      localDate: opportunity?.localDate ?? null,
      localTime: opportunity?.localTime ?? null,
      timeDisplay: opportunity?.timeDisplay ?? null,
      opportunityKey: opportunity?.opportunityKey ?? null,
      startsAt,
      dateLabel,
      timeLabel,
      filmKey: opportunity?.filmKey ?? showtimeFilmKey ?? null,
    },
    created_at: createdAt,
    read_at: null,
  };
}

/**
 * Run detector over Saved prefs + watches + homeData (pure; no I/O).
 *
 * @param {{
 *   homeData: object | null,
 *   savedPreferences: Array<{
 *     user_id: string,
 *     film_key: string,
 *     film_id?: string | null,
 *     showtime_film_key?: string | null,
 *     is_active: boolean,
 *     title_snapshot?: string | null,
 *     poster_url_snapshot?: string | null,
 *   }>,
 *   watches: Array<object>,
 *   resolveHomeFilm: (pref: object) => object | null,
 *   now?: Date,
 *   newEpisodeId?: () => string,
 * }} input
 */
export function detectShowtimeAvailabilityNotifications(input) {
  const {
    homeData,
    savedPreferences,
    watches,
    resolveHomeFilm,
    now = new Date(),
    newEpisodeId = () => randomUUID(),
  } = input;

  const nowIso = now.toISOString();
  /** @type {Map<string, object>} */
  const watchByUserFilm = new Map();
  for (const w of watches ?? []) {
    if (!w?.user_id || !w?.film_key) continue;
    watchByUserFilm.set(`${w.user_id}::${w.film_key}`, w);
  }

  /** @type {Map<string, object>} */
  const activeSaved = new Map();
  for (const pref of savedPreferences ?? []) {
    if (!pref?.user_id || !pref?.film_key) continue;
    if (pref.is_active) {
      activeSaved.set(`${pref.user_id}::${pref.film_key}`, pref);
    }
  }

  /** @type {object[]} */
  const watchUpserts = [];
  /** @type {object[]} */
  const notificationInserts = [];
  /** @type {Record<string, number>} */
  const counts = {
    eligibleWatchesScanned: 0,
    filmsCurrentlyAvailable: 0,
    notificationsWouldCreate: 0,
    skippedAlreadyNotified: 0,
    skippedBaselineAvailable: 0,
    skippedUnsaved: 0,
    skippedStillUnavailable: 0,
    enrolledWatching: 0,
    identityFailures: 0,
  };

  // Process all active Saves.
  for (const pref of activeSaved.values()) {
    counts.eligibleWatchesScanned += 1;
    const homeFilm = resolveHomeFilm(pref);
    const catalogKey =
      (homeFilm && typeof homeFilm.filmKey === 'string' && homeFilm.filmKey) ||
      (typeof pref.showtime_film_key === 'string' && pref.showtime_film_key) ||
      null;

    let available = false;
    let opportunity = null;
    if (homeFilm?.filmKey) {
      available = hasQualifyingFutureShowtimes(homeData, homeFilm.filmKey, now);
      if (available) {
        counts.filmsCurrentlyAvailable += 1;
        opportunity = pickEarliestQualifyingOpportunity(
          homeData,
          homeFilm.filmKey,
          now,
        );
      }
    } else if (!catalogKey && !pref.film_id && !pref.film_key) {
      counts.identityFailures += 1;
    }

    const watchKey = `${pref.user_id}::${pref.film_key}`;
    const existing = watchByUserFilm.get(watchKey) ?? null;
    const result = reconcileShowtimeWatch({
      userId: pref.user_id,
      filmKey: pref.film_key,
      filmId: pref.film_id ?? homeFilm?.filmId ?? null,
      showtimeFilmKey:
        pref.showtime_film_key ?? homeFilm?.filmKey ?? catalogKey,
      isSavedActive: true,
      available,
      existingWatch: existing,
      nowIso,
      newEpisodeId,
    });

    if (result.skipReason === 'identity_failure') counts.identityFailures += 1;
    if (result.skipReason === 'already_notified') counts.skippedAlreadyNotified += 1;
    if (result.skipReason === 'baseline_already_available') {
      counts.skippedBaselineAvailable += 1;
    }
    if (result.skipReason === 'still_unavailable') counts.skippedStillUnavailable += 1;
    if (result.skipReason === 'enrolled_watching') counts.enrolledWatching += 1;

    if (result.watch) {
      watchUpserts.push(result.watch);
      watchByUserFilm.set(watchKey, result.watch);
    }

    if (result.shouldNotify && result.watch) {
      const title =
        homeFilm?.title ??
        pref.title_snapshot ??
        'A saved film';
      const posterUrl =
        homeFilm?.posterUrl ?? pref.poster_url_snapshot ?? null;
      notificationInserts.push(
        buildShowtimesAvailableNotificationDraft({
          userId: pref.user_id,
          filmKey: pref.film_key,
          episodeId: result.watch.episode_id,
          filmId: result.watch.film_id,
          showtimeFilmKey: result.watch.showtime_film_key,
          title,
          posterUrl,
          opportunity,
          createdAt: nowIso,
        }),
      );
      counts.notificationsWouldCreate += 1;
    }
  }

  // Deactivate watches whose Save is no longer active.
  for (const [key, existing] of watchByUserFilm) {
    if (activeSaved.has(key)) continue;
    if (!existing.is_active) continue;
    const [userId, filmKey] = key.split('::');
    const result = reconcileShowtimeWatch({
      userId,
      filmKey,
      filmId: existing.film_id,
      showtimeFilmKey: existing.showtime_film_key,
      isSavedActive: false,
      available: false,
      existingWatch: existing,
      nowIso,
      newEpisodeId,
    });
    counts.skippedUnsaved += 1;
    if (result.watch) watchUpserts.push(result.watch);
  }

  return {
    watchUpserts,
    notificationInserts,
    counts,
  };
}
