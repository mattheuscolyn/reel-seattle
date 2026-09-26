/**
 * Explore Quick Start — defaults, ranking, and item builder.
 *
 * Personalized shortcuts are derived from local visit history only.
 * Ranking is deterministic: recent repeats outweigh older history.
 */

import {
  pacificDateString,
  resolveWeekendRange,
} from './exploreCatalog.js';
import { COLLECTION_IDS, COLLECTION_TITLES } from './exploreIds.js';
import {
  BROWSE_ROWS,
  BROWSE_SHOWTIMES_ID,
} from './exploreBrowseBy.js';
import {
  browseDestinationId,
  collectionDestinationId,
  formatDestinationId,
  loadQuickStartHistory,
  showtimesDestinationId,
  theaterDestinationId,
} from './quickStartHistoryStore.js';
import { createDefaultShowtimesBrowseUi } from '../showtimes/showtimesBrowseModel.js';
import { FORMAT_CONTENT } from '../formatsExperiences/formatsExperiencesContent.js';

export const QUICK_START_ALL_SHOWTIMES_ID = 'all-showtimes';
export const QUICK_START_TODAY_ID = 'today-showtimes';
export const QUICK_START_WEEKEND_ID = 'this-weekend';

export const QUICK_START_ITEM_LIMIT = 3;
/** Visits within this window get the recent weight. */
export const QUICK_START_RECENT_DAYS = 7;
export const QUICK_START_RECENT_WEIGHT = 3;
export const QUICK_START_OLDER_WEIGHT = 1;
/** Need one recent visit or two total visits to personalize a destination. */
export const QUICK_START_MIN_RECENT_VISITS = 1;
export const QUICK_START_MIN_TOTAL_VISITS = 2;
/**
 * Generic Browse By hubs (Movies, Theaters, …) need a bit more signal before
 * they personalize — they are opened often as gateways to specific destinations.
 */
export const QUICK_START_BROWSE_MIN_RECENT_VISITS = 2;
export const QUICK_START_BROWSE_MIN_TOTAL_VISITS = 3;
/**
 * Soft diversity: prefer a different kind only when its score is within this
 * gap of the same-kind candidate being considered. Larger gaps keep relevance.
 */
export const QUICK_START_DIVERSITY_MAX_SCORE_GAP = 3;

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   icon: string,
 *   kind: 'showtimes' | 'browse' | 'theater' | 'format' | 'collection',
 *   action:
 *     | { type: 'showtimes-browse', quickStartId: string }
 *     | { type: 'collection', collectionId: string }
 *     | { type: 'theater', theaterId: string }
 *     | { type: 'format', formatId: string }
 *     | { type: 'collection-detail', collectionId: string },
 * }} QuickStartItem
 */

/** Deterministic defaults for users with little/no history. */
export const DEFAULT_QUICK_START = Object.freeze([
  Object.freeze({
    id: QUICK_START_ALL_SHOWTIMES_ID,
    label: 'All showtimes',
    icon: 'showtimes',
    kind: 'showtimes',
    action: Object.freeze({
      type: 'showtimes-browse',
      quickStartId: QUICK_START_ALL_SHOWTIMES_ID,
    }),
  }),
  Object.freeze({
    id: QUICK_START_TODAY_ID,
    label: 'Today',
    icon: 'today',
    kind: 'showtimes',
    action: Object.freeze({
      type: 'showtimes-browse',
      quickStartId: QUICK_START_TODAY_ID,
    }),
  }),
  Object.freeze({
    id: QUICK_START_WEEKEND_ID,
    label: 'This weekend',
    icon: 'weekend',
    kind: 'showtimes',
    action: Object.freeze({
      type: 'showtimes-browse',
      quickStartId: QUICK_START_WEEKEND_ID,
    }),
  }),
]);

/** @deprecated Prefer DEFAULT_QUICK_START / buildQuickStartItems. */
export const QUICK_START = DEFAULT_QUICK_START;

/**
 * @param {Date | (() => Date) | string} [now]
 * @returns {string}
 */
function resolveTodayIso(now) {
  const resolved = typeof now === 'function' ? now() : now;
  if (typeof resolved === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
    return resolved;
  }
  return pacificDateString(resolved instanceof Date ? resolved : new Date());
}

/**
 * Canonical Showtimes browse UI for an Explore Quick Start / Showtimes id.
 *
 * @param {string} id
 * @param {Date | (() => Date) | string} [now]
 * @returns {object | null}
 */
export function browseUiForQuickStart(id, now = new Date()) {
  const base = createDefaultShowtimesBrowseUi();
  if (id === QUICK_START_ALL_SHOWTIMES_ID || id === BROWSE_SHOWTIMES_ID) {
    return { ...base, dateMode: 'week' };
  }
  if (id === QUICK_START_TODAY_ID) {
    return { ...base, dateMode: 'today' };
  }
  if (id === QUICK_START_WEEKEND_ID) {
    const weekend = resolveWeekendRange(resolveTodayIso(now));
    return {
      ...base,
      dateSelection: {
        mode: 'range',
        startDate: weekend.start,
        endDate: weekend.end,
      },
    };
  }
  return null;
}

/**
 * @param {string} destinationId
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} fallbackLabel
 * @returns {QuickStartItem | null}
 */
export function resolveQuickStartCandidate(
  destinationId,
  homeData = null,
  fallbackLabel = null,
) {
  const id = typeof destinationId === 'string' ? destinationId.trim() : '';
  if (!id) return null;

  if (id.startsWith('showtimes:')) {
    const quickId = id.slice('showtimes:'.length);
    const defaults = DEFAULT_QUICK_START.find((item) => item.id === quickId);
    if (defaults) return { ...defaults };
    if (quickId === BROWSE_SHOWTIMES_ID || quickId === QUICK_START_ALL_SHOWTIMES_ID) {
      return {
        id: QUICK_START_ALL_SHOWTIMES_ID,
        label: 'All showtimes',
        icon: 'showtimes',
        kind: 'showtimes',
        action: {
          type: 'showtimes-browse',
          quickStartId: QUICK_START_ALL_SHOWTIMES_ID,
        },
      };
    }
    return null;
  }

  if (id.startsWith('browse:')) {
    const browseId = id.slice('browse:'.length);
    if (browseId === BROWSE_SHOWTIMES_ID) {
      return {
        id: BROWSE_SHOWTIMES_ID,
        label: 'Showtimes',
        icon: 'showtimes',
        kind: 'showtimes',
        action: {
          type: 'showtimes-browse',
          quickStartId: QUICK_START_ALL_SHOWTIMES_ID,
        },
      };
    }
    const row = BROWSE_ROWS.find((r) => r.id === browseId);
    if (!row || row.id === BROWSE_SHOWTIMES_ID) return null;
    return {
      id: row.id,
      label: row.label,
      icon: row.icon,
      kind: 'browse',
      action: { type: 'collection', collectionId: row.id },
    };
  }

  if (id.startsWith('theater:')) {
    const theaterId = id.slice('theater:'.length);
    if (!theaterId) return null;
    const theater = homeData?.theatersById?.[theaterId] ?? null;
    const label =
      (typeof theater?.name === 'string' && theater.name.trim()) ||
      (typeof fallbackLabel === 'string' && fallbackLabel.trim()) ||
      theaterId;
    return {
      id: `theater:${theaterId}`,
      label,
      icon: 'building',
      kind: 'theater',
      action: { type: 'theater', theaterId },
    };
  }

  if (id.startsWith('format:')) {
    const formatId = id.slice('format:'.length);
    if (!formatId) return null;
    const content = FORMAT_CONTENT?.[formatId] ?? null;
    const label =
      (typeof content?.name === 'string' && content.name.trim()) ||
      (typeof content?.tileLabel === 'string' && content.tileLabel.trim()) ||
      (typeof fallbackLabel === 'string' && fallbackLabel.trim()) ||
      formatId;
    return {
      id: `format:${formatId}`,
      label,
      icon: 'formats',
      kind: 'format',
      action: { type: 'format', formatId },
    };
  }

  if (id.startsWith('collection:')) {
    const collectionId = id.slice('collection:'.length);
    if (!collectionId) return null;
    const label =
      COLLECTION_TITLES[collectionId] ||
      (typeof fallbackLabel === 'string' && fallbackLabel.trim()) ||
      collectionId;
    return {
      id: `collection:${collectionId}`,
      label,
      icon: 'grid',
      kind: 'collection',
      action: { type: 'collection-detail', collectionId },
    };
  }

  return null;
}

/**
 * @param {{
 *   events: { destinationId: string, kind: string, label?: string | null, at: string }[],
 * }} history
 * @param {{ now?: Date | number, homeData?: object | null }} [options]
 */
export function rankQuickStartCandidates(history, options = {}) {
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === 'number'
        ? options.now
        : Date.now();
  const recentCutoff = nowMs - QUICK_START_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const events = Array.isArray(history?.events) ? history.events : [];

  /** @type {Map<string, { destinationId: string, kind: string, label: string | null, recentCount: number, olderCount: number, lastAt: number }>} */
  const byId = new Map();
  for (const event of events) {
    const destinationId =
      typeof event?.destinationId === 'string' ? event.destinationId.trim() : '';
    if (!destinationId) continue;
    const atMs = Date.parse(event.at);
    if (!Number.isFinite(atMs)) continue;
    const current = byId.get(destinationId) ?? {
      destinationId,
      kind: event.kind,
      label: event.label ?? null,
      recentCount: 0,
      olderCount: 0,
      lastAt: 0,
    };
    if (atMs >= recentCutoff) current.recentCount += 1;
    else current.olderCount += 1;
    if (atMs > current.lastAt) {
      current.lastAt = atMs;
      if (event.label) current.label = event.label;
      current.kind = event.kind;
    }
    byId.set(destinationId, current);
  }

  /** @type {{ item: QuickStartItem, score: number, lastAt: number, kind: string }[]} */
  const ranked = [];
  for (const stats of byId.values()) {
    const total = stats.recentCount + stats.olderCount;
    const item = resolveQuickStartCandidate(
      stats.destinationId,
      options.homeData,
      stats.label,
    );
    if (!item) continue;
    const isBrowseHub = item.kind === 'browse';
    const qualified = isBrowseHub
      ? stats.recentCount >= QUICK_START_BROWSE_MIN_RECENT_VISITS ||
        total >= QUICK_START_BROWSE_MIN_TOTAL_VISITS
      : stats.recentCount >= QUICK_START_MIN_RECENT_VISITS ||
        total >= QUICK_START_MIN_TOTAL_VISITS;
    if (!qualified) continue;
    const score =
      stats.recentCount * QUICK_START_RECENT_WEIGHT +
      stats.olderCount * QUICK_START_OLDER_WEIGHT;
    ranked.push({
      item,
      score,
      lastAt: stats.lastAt,
      kind: item.kind,
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
    return a.item.id.localeCompare(b.item.id);
  });
  return ranked;
}

/**
 * Soft diversity over a score-ordered list.
 *
 * Walk by relevance first. When a kind is already represented, defer that
 * candidate only if a near-score unused-kind alternative exists (within
 * QUICK_START_DIVERSITY_MAX_SCORE_GAP). Weak candidates never displace
 * dramatically stronger ones merely to change kind.
 *
 * @param {{ item: QuickStartItem, score: number, lastAt: number, kind: string }[]} ranked
 * @param {number} limit
 * @returns {QuickStartItem[]}
 */
export function pickDiverseQuickStartItems(ranked, limit = QUICK_START_ITEM_LIMIT) {
  const picked = [];
  const usedKinds = new Set();
  const usedIds = new Set();

  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (usedIds.has(row.item.id)) continue;

    if (usedKinds.has(row.kind)) {
      const nearAlternative = ranked.some(
        (candidate) =>
          !usedIds.has(candidate.item.id) &&
          !usedKinds.has(candidate.kind) &&
          candidate.score + QUICK_START_DIVERSITY_MAX_SCORE_GAP >= row.score,
      );
      if (nearAlternative) continue;
    }

    picked.push(row.item);
    usedKinds.add(row.kind);
    usedIds.add(row.item.id);
  }

  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (usedIds.has(row.item.id)) continue;
    picked.push(row.item);
    usedIds.add(row.item.id);
  }

  return picked;
}

/**
 * Build Quick Start items for Explore.
 *
 * @param {{
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   now?: Date | number,
 *   limit?: number,
 *   history?: object | null,
 * }} [context]
 * @returns {QuickStartItem[]}
 */
export function buildQuickStartItems(context = {}) {
  const limit = Math.max(1, Number(context.limit) || QUICK_START_ITEM_LIMIT);
  const defaults = DEFAULT_QUICK_START.map((item) => ({ ...item }));
  let history = context.history;
  if (!history) {
    history = loadQuickStartHistory(context.storage ?? null);
  }

  const ranked = rankQuickStartCandidates(history, {
    now: context.now,
    homeData: context.homeData,
  });

  if (!ranked.length) {
    return defaults.slice(0, limit);
  }

  const personalized = pickDiverseQuickStartItems(ranked, limit);
  const usedIds = new Set(personalized.map((item) => item.id));
  for (const item of defaults) {
    if (personalized.length >= limit) break;
    if (usedIds.has(item.id)) continue;
    personalized.push({ ...item });
    usedIds.add(item.id);
  }
  return personalized.slice(0, limit);
}

export {
  browseDestinationId,
  collectionDestinationId,
  formatDestinationId,
  showtimesDestinationId,
  theaterDestinationId,
};
