/**
 * Friend Detail presentation.
 *
 * Mutual Saved / Seen / Not Interested counts are the intersection of the
 * friend's shared activity and the viewer's own film stores, matched by
 * canonical film identity (preference key / film id), never by title.
 *
 * Watch Together is that Saved intersection. Activity tabs are the friend's
 * films only. Plans stay on the existing friend-plan-signal cards.
 */

import { filmPreferenceKeyFromRef } from '../auth/filmPreferenceIdentity.js';
import { LEAVING_SOON_BUCKET_LABELS } from '../adapters/buildLeavingSoon.js';
import {
  buildHomeFilmIdentityIndex,
  resolveHomeFilmForPreferenceRef,
} from '../collections/personalCollectionModel.js';
import { pacificDateString } from '../explore/exploreCatalog.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { findLeavingSoonEntryForFilm } from '../filmDetail/departureTiming.js';
import { buildOpeningDateCopy } from '../opening/openingDateCopy.js';
import { asCanonicalStoreFilmId, normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';
import {
  collectSpecialPresentationsByFilm,
  specialPresentationBrowseLabel,
} from '../specialPresentations/collectSpecialPresentations.js';
import {
  formatSavedFilmNextShowtimeLine,
  formatSavedFilmShowtimeSummary,
} from '../planner/plannerSavedFilmsUrgency.js';
import {
  listQualifyingFutureOpportunitiesForFilm,
} from '../showtimes/qualifyingShowtimes.js';
import { friendDisplayLabel } from './friendsCopy.js';
import { friendGivenName } from './friendsModel.js';
import { buildFriendActivityCollectionRows } from './friendFilmActivityModel.js';

/**
 * @param {string | null | undefined} createdAt
 * @returns {string | null}
 */
export function formatFriendsSinceLabel(createdAt) {
  if (typeof createdAt !== 'string' || !createdAt.trim()) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  let label = '';
  try {
    label = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    }).format(date);
  } catch {
    return null;
  }
  if (!label) return null;
  return `Friends since ${label}`;
}

/**
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function friendPairLabel(displayName) {
  return `You & ${friendGivenName(displayName)}`;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function upcomingPlansMetricLabel(count) {
  return count === 1 ? 'upcoming plan together' : 'upcoming plans together';
}

/**
 * @param {'saved' | 'seen' | 'not-interested' | string} tab
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function friendActivityEmptyCopy(tab, displayName) {
  const name = friendDisplayLabel(displayName);
  if (tab === 'seen') return `${name} hasn’t marked any films seen.`;
  if (tab === 'not-interested') {
    return `${name} hasn’t marked any films not interested.`;
  }
  return `${name} hasn’t saved any films.`;
}

/**
 * @param {string | null | undefined} displayName
 */
export function watchTogetherEmptyCopy(displayName) {
  const name = friendDisplayLabel(displayName);
  return {
    title: 'No films saved together yet',
    body: `When you and ${name} save the same films, they’ll show up here so it’s easy to find something to watch together.`,
    action: 'Browse films',
  };
}

/**
 * @param {string | null | undefined} displayName
 */
export function friendActivityLead(displayName) {
  return `Films ${friendDisplayLabel(displayName)} has saved, seen, or marked not interested.`;
}

/**
 * @param {Array<{ filmRef?: object } | object> | null | undefined} items
 */
export function indexViewerFilms(items) {
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {Set<string>} */
  const filmIds = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const ref =
      item && typeof item === 'object' && 'filmRef' in item
        ? /** @type {{ filmRef?: object }} */ (item).filmRef
        : item;
    const key = filmPreferenceKeyFromRef(ref);
    if (key) keys.add(key);
    const filmId = asCanonicalStoreFilmId(
      ref && typeof ref === 'object'
        ? /** @type {{ filmId?: unknown }} */ (ref).filmId
        : null,
    );
    if (filmId) filmIds.add(filmId);
  }
  return { keys, filmIds };
}

/**
 * @param {{ filmKey?: string | null, filmId?: string | null } | null | undefined} film
 * @param {{ keys: Set<string>, filmIds: Set<string> }} index
 */
export function filmMatchesViewerIndex(film, index) {
  if (!film || !index) return false;
  if (typeof film.filmKey === 'string' && index.keys.has(film.filmKey)) return true;
  const filmId =
    asCanonicalStoreFilmId(film.filmId) ?? asCanonicalStoreFilmId(film.filmKey);
  return Boolean(filmId && index.filmIds.has(filmId));
}

/**
 * @param {Array<{ filmKey?: string, filmId?: string | null }> | null | undefined} friendFilms
 * @param {Array<{ filmRef?: object } | object> | null | undefined} viewerItems
 */
export function selectMutualFilms(friendFilms, viewerItems) {
  const index = indexViewerFilms(viewerItems);
  return (Array.isArray(friendFilms) ? friendFilms : []).filter((film) =>
    filmMatchesViewerIndex(film, index),
  );
}

/**
 * @param {object | null | undefined} homeFilm
 * @param {object[]} entries
 */
function findOpeningEntry(homeFilm, entries) {
  if (!homeFilm) return null;
  const filmKey = typeof homeFilm.filmKey === 'string' ? homeFilm.filmKey : '';
  const parent =
    typeof homeFilm.parentFilmKey === 'string' ? homeFilm.parentFilmKey : '';
  return (
    entries.find((entry) => {
      const key = typeof entry?.filmKey === 'string' ? entry.filmKey : '';
      const showtime =
        typeof entry?.showtimeFilmKey === 'string' ? entry.showtimeFilmKey : '';
      return (
        (filmKey && (key === filmKey || showtime === filmKey)) ||
        (parent && key === parent)
      );
    }) ?? null
  );
}

/**
 * @param {object | null | undefined} opportunity
 * @returns {string | null}
 */
function singleShowtimeLine(opportunity) {
  if (!opportunity) return null;
  const line = formatSavedFilmNextShowtimeLine(opportunity, '12h');
  if (!line) return null;
  const venue =
    typeof opportunity.theaterName === 'string' ? opportunity.theaterName.trim() : '';
  if (venue && line.endsWith(venue)) {
    return line.slice(0, -venue.length).replace(/[\s•·]+$/u, '') || null;
  }
  return line;
}

/**
 * @param {{
 *   homeFilm: object | null,
 *   homeData: object | null,
 *   leaving: object[],
 *   opening: object[],
 *   specialByKey: Map<string, string>,
 *   now: Date,
 *   todayIso: string,
 * }} input
 */
function describeFilmContext(input) {
  const homeFilm = input.homeFilm;
  if (!homeFilm) {
    return {
      badge: null,
      venue: null,
      availability: null,
      nextOpportunityKey: null,
    };
  }
  const opportunities = listQualifyingFutureOpportunitiesForFilm(
    input.homeData,
    homeFilm.filmKey,
    input.now,
  );
  const next = opportunities[0] ?? null;
  const leaving = findLeavingSoonEntryForFilm(homeFilm, input.leaving);
  const opening = findOpeningEntry(homeFilm, input.opening);
  const specialId =
    input.specialByKey.get(homeFilm.filmKey) ||
    (typeof homeFilm.parentFilmKey === 'string'
      ? input.specialByKey.get(homeFilm.parentFilmKey)
      : null) ||
    null;

  let badge = null;
  const leavingLabel =
    (typeof leaving?.bucketLabel === 'string' && leaving.bucketLabel) ||
    LEAVING_SOON_BUCKET_LABELS[leaving?.bucket] ||
    null;
  if (leavingLabel) {
    badge = leavingLabel;
  } else if (opening?.openingDate) {
    badge =
      buildOpeningDateCopy({
        openingDate: opening.openingDate,
        engagementDays: opening.engagementDays ?? null,
        categoryId: opening.categoryId ?? null,
        todayIso: input.todayIso,
        hasUpcomingShowtimes: opportunities.length > 0,
        compact: true,
      }).dateLabel || null;
  } else if (specialId) {
    badge = specialPresentationBrowseLabel(specialId);
  }

  const venue =
    typeof next?.theaterName === 'string' && next.theaterName.trim()
      ? next.theaterName.trim()
      : null;
  let availability = null;
  if (opportunities.length === 1) {
    availability = singleShowtimeLine(next);
  } else if (opportunities.length > 1) {
    availability = formatSavedFilmShowtimeSummary(
      opportunities.length,
      opportunities,
      input.now,
    );
  }

  return {
    badge,
    venue,
    availability,
    nextOpportunityKey: next?.opportunityKey ?? null,
  };
}

/**
 * @param {object | null | undefined} homeData
 * @param {Date} [now]
 */
function buildCatalogContext(homeData, now = new Date()) {
  const resolvedNow = now instanceof Date ? now : new Date();
  const specials = homeData ? collectSpecialPresentationsByFilm(homeData) : [];
  return {
    homeData: homeData ?? null,
    now: resolvedNow,
    index: buildHomeFilmIdentityIndex(homeData),
    leaving: Array.isArray(homeData?.leavingSoon?.entries)
      ? homeData.leavingSoon.entries
      : [],
    opening: Array.isArray(homeData?.openingThisWeek?.entries)
      ? homeData.openingThisWeek.entries
      : [],
    specialByKey: new Map(
      specials.map((row) => [row.filmKey, row.bestCanonicalId]),
    ),
    todayIso: pacificDateString(resolvedNow),
  };
}

/**
 * Poster cards for Watch Together and activity tabs.
 *
 * @param {import('./friendFilmActivityModel.js').FriendActivityFilmRow[]} films
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   now?: Date,
 *   catalog?: ReturnType<typeof buildCatalogContext>,
 * }} [options]
 */
export function buildFriendDetailFilmCards(films, options = {}) {
  const list = Array.isArray(films) ? films : [];
  const base = buildFriendActivityCollectionRows(list, options);
  const catalog =
    options.catalog ??
    buildCatalogContext(
      options.homeData ?? null,
      options.now instanceof Date ? options.now : new Date(),
    );
  const { homeData, now, index, leaving, opening, specialByKey, todayIso } =
    catalog;

  return base.map((row, i) => {
    const source = list[i];
    const filmRef = normalizeSavedFilmRef({
      filmId: source?.filmId ?? row.filmId,
      showtimeFilmKey: source?.showtimeFilmKey ?? row.filmKey,
    });
    const homeFilm = filmRef
      ? resolveHomeFilmForPreferenceRef(filmRef, index)
      : null;
    const context = describeFilmContext({
      homeFilm,
      homeData,
      leaving,
      opening,
      specialByKey,
      now,
      todayIso,
    });
    return {
      ...row,
      badge: context.badge,
      venue: context.venue,
      availability: context.availability,
      nextOpportunityKey: context.nextOpportunityKey ?? row.nextOpportunityKey,
    };
  });
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} cards
 * @param {{ homeData?: object | null, enrichmentIndex?: object | null }} [options]
 */
export function enrichFriendPlanCards(cards, options = {}) {
  const homeData = options.homeData ?? null;
  const index = buildHomeFilmIdentityIndex(homeData);
  return (Array.isArray(cards) ? cards : []).map((card) => {
    const filmRef = normalizeSavedFilmRef({
      filmId: card.filmId,
      showtimeFilmKey: card.filmKey,
    });
    const homeFilm = filmRef
      ? resolveHomeFilmForPreferenceRef(filmRef, index)
      : null;
    const enriched = homeFilm
      ? enrichHomeFilm(homeFilm, options.enrichmentIndex ?? null, 'collection', homeData)
      : null;
    const posterUrl =
      (typeof enriched?.posterUrl === 'string' && enriched.posterUrl) ||
      (typeof homeFilm?.posterUrl === 'string' && homeFilm.posterUrl) ||
      null;
    return { ...card, posterUrl };
  });
}

/**
 * Avatars for a plan card. The viewer is included only when they are already
 * on the plan. Friend signal people are always included.
 *
 * @param {{ viewerOnPlan?: boolean, participants?: Array<{ userId: string, displayName?: string | null, avatarUrl?: string | null }> }} card
 * @param {{ displayName?: string | null, avatarUrl?: string | null } | null} [viewer]
 */
export function planCardAvatars(card, viewer = null) {
  /** @type {Array<{ key: string, displayName: string | null, avatarUrl: string | null }>} */
  const people = [];
  if (card?.viewerOnPlan && viewer) {
    people.push({
      key: 'viewer',
      displayName: viewer.displayName ?? null,
      avatarUrl: viewer.avatarUrl ?? null,
    });
  }
  for (const person of card?.participants ?? []) {
    if (!person?.userId) continue;
    people.push({
      key: person.userId,
      displayName: person.displayName ?? null,
      avatarUrl: person.avatarUrl ?? null,
    });
  }
  return people.slice(0, 4);
}

/**
 * @param {{
 *   friend?: { displayName?: string | null, createdAt?: string | null } | null,
 *   sharesActivity?: boolean,
 *   activity?: {
 *     saved?: object[],
 *     seen?: object[],
 *     notInterested?: object[],
 *   } | null,
 *   viewerSaved?: object[],
 *   viewerSeen?: object[],
 *   viewerNotInterested?: object[],
 *   planCards?: object[],
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   now?: Date,
 * }} input
 */
export function buildFriendDetailModel(input) {
  const sharesActivity = input?.sharesActivity === true;
  const activity = input?.activity ?? null;
  const savedMutual = sharesActivity
    ? selectMutualFilms(activity?.saved, input.viewerSaved)
    : [];
  const seenMutual = sharesActivity
    ? selectMutualFilms(activity?.seen, input.viewerSeen)
    : [];
  const notInterestedMutual = sharesActivity
    ? selectMutualFilms(activity?.notInterested, input.viewerNotInterested)
    : [];
  const plans = enrichFriendPlanCards(input.planCards, {
    homeData: input.homeData,
    enrichmentIndex: input.enrichmentIndex,
  });
  const cardOptions = sharesActivity
    ? {
        homeData: input.homeData,
        enrichmentIndex: input.enrichmentIndex,
        now: input.now,
        catalog: buildCatalogContext(input.homeData, input.now),
      }
    : null;

  return {
    friendsSinceLabel: formatFriendsSinceLabel(input.friend?.createdAt),
    pairLabel: friendPairLabel(input.friend?.displayName),
    sharesActivity,
    summary: sharesActivity
      ? {
          savedTogether: savedMutual.length,
          upcomingPlans: plans.length,
          seenTogether: seenMutual.length,
          notInterestedTogether: notInterestedMutual.length,
        }
      : null,
    plans,
    watchTogether: sharesActivity
      ? buildFriendDetailFilmCards(savedMutual, cardOptions)
      : [],
    activity: sharesActivity
      ? {
          saved: buildFriendDetailFilmCards(activity?.saved ?? [], cardOptions),
          seen: buildFriendDetailFilmCards(activity?.seen ?? [], cardOptions),
          notInterested: buildFriendDetailFilmCards(
            activity?.notInterested ?? [],
            cardOptions,
          ),
        }
      : { saved: [], seen: [], notInterested: [] },
  };
}
