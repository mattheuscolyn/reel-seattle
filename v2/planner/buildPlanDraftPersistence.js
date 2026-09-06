/**
 * Session-scoped persistence for the in-progress Build a Plan draft.
 *
 * Stores source inputs only. Derived itineraries / results are omitted and
 * recomputed from current showtime data when the user generates again.
 * Malformed or version-mismatched payloads fall back to live defaults.
 */

import { formatCompactDateLabel } from '../explore/exploreCatalog.js';
import { normalizeLockedShowtimes } from './lockedShowtimes.js';
import { MUST_INCLUDE_MAX, WOULD_LOVE_MAX } from './buildPlanFilmManageConfig.js';
import { normalizePlanSize } from './planSize.js';
import { normalizeBuildPlanTimeWindowFields } from './buildPlanTimeWindow.js';
import {
  createLiveBuildPlanFormState,
  formatBuildPlanDateDisplay,
} from './createLiveBuildPlanFormState.js';

export const BUILD_PLAN_DRAFT_STORAGE_KEY = 'reel-seattle.v2.buildPlanDraft';
export const BUILD_PLAN_DRAFT_VERSION = 1;

const THEATER_PREF_IDS = new Set(['any', 'amc', 'indie', 'custom']);
const FILM_CARD_MAX = {
  mustInclude: MUST_INCLUDE_MAX,
  wouldLove: WOULD_LOVE_MAX,
  notInterested: 50,
};
const LOCKED_SHOWTIMES_MAX = 24;
const SELECTED_THEATERS_MAX = 80;

const OMITTED_RESULT_KEYS = [
  'plans',
  'results',
  'generatedPlans',
  'generatedResults',
  'itineraries',
  'presentation',
  'candidates',
  'schedules',
];

/**
 * @returns {Storage | null}
 */
export function getBuildPlanDraftStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asIsoDate(value) {
  const trimmed = asTrimmed(value);
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 */
function asString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Persistable film-chip identity + display fields. Drops catalog-derived
 * eligibility counts that should be recomputed from live HomeData.
 * @param {unknown} raw
 * @returns {object | null}
 */
function sanitizeFilmCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const filmKey =
    asTrimmed(record.filmKey) ?? asTrimmed(record.id) ?? asTrimmed(record.showtimeFilmKey);
  if (!filmKey) return null;
  const title = asTrimmed(record.title) ?? 'Untitled';
  const imageUrl =
    asTrimmed(record.imageUrl) ?? asTrimmed(record.posterUrl) ?? '';
  /** @type {Record<string, unknown>} */
  const card = {
    id: asTrimmed(record.id) ?? filmKey,
    filmKey,
    filmId: asTrimmed(record.filmId),
    parentFilmKey: asTrimmed(record.parentFilmKey),
    showtimeFilmKey: asTrimmed(record.showtimeFilmKey) ?? filmKey,
    title,
    canonicalTitle: asTrimmed(record.canonicalTitle) ?? title,
    releaseYear:
      typeof record.releaseYear === 'number' && Number.isFinite(record.releaseYear)
        ? record.releaseYear
        : null,
    source: asTrimmed(record.source),
    sourceFilmId: asTrimmed(record.sourceFilmId),
    imageUrl,
    posterUrl: asTrimmed(record.posterUrl) ?? (imageUrl || null),
    detailLabel: asTrimmed(record.detailLabel) ?? asTrimmed(record.theaterLabel) ?? 'Any theater',
    theaterLabel: asTrimmed(record.theaterLabel) ?? asTrimmed(record.detailLabel) ?? 'Any theater',
  };
  if (Array.isArray(record.identityAliases)) {
    const aliases = record.identityAliases
      .map((item) => asTrimmed(item))
      .filter(Boolean);
    if (aliases.length) card.identityAliases = aliases;
  }
  return card;
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {object[]}
 */
function sanitizeFilmCards(value, max) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (out.length >= max) break;
    const card = sanitizeFilmCard(item);
    if (!card) continue;
    const token = String(card.filmId || card.filmKey);
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(card);
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function sanitizeTheaterIds(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (out.length >= SELECTED_THEATERS_MAX) break;
    const id = asTrimmed(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Allowlisted source inputs. Extra keys (results, UI chrome, errors) are dropped.
 * @param {unknown} raw
 * @param {{ now?: Date | (() => Date) }} [options]
 * @returns {object | null}
 */
export function sanitizeBuildPlanDraft(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const defaults = createLiveBuildPlanFormState(options.now ?? new Date());
  const record = /** @type {Record<string, unknown>} */ (raw);

  const dateIso = asIsoDate(record.dateIso) ?? defaults.dateIso;
  const theaterPrefId = THEATER_PREF_IDS.has(record.theaterPrefId)
    ? /** @type {string} */ (record.theaterPrefId)
    : defaults.theaterPrefId;

  const withTime = normalizeBuildPlanTimeWindowFields({
    startAfter: record.startAfter,
    finishBefore: record.finishBefore,
    finishBeforeNextDay: record.finishBeforeNextDay,
  });

  return {
    selectedPresetId: asTrimmed(record.selectedPresetId),
    flexible: record.flexible === true,
    dateIso,
    dateDisplay: formatBuildPlanDateDisplay(dateIso),
    dateShort: formatCompactDateLabel(dateIso),
    startAfter: withTime.startAfter,
    finishBefore: withTime.finishBefore,
    finishBeforeNextDay: withTime.finishBeforeNextDay,
    mustInclude: sanitizeFilmCards(record.mustInclude, FILM_CARD_MAX.mustInclude),
    wouldLove: sanitizeFilmCards(record.wouldLove, FILM_CARD_MAX.wouldLove),
    notInterested: sanitizeFilmCards(
      record.notInterested,
      FILM_CARD_MAX.notInterested,
    ),
    lockedShowtimes: normalizeLockedShowtimes(record.lockedShowtimes).slice(
      0,
      LOCKED_SHOWTIMES_MAX,
    ),
    theaterPrefId,
    selectedTheaters: sanitizeTheaterIds(record.selectedTheaters),
    locationDisplay: asString(record.locationDisplay, defaults.locationDisplay),
    locationShort: asString(record.locationShort, defaults.locationShort),
    planSize: normalizePlanSize(record.planSize),
    maxGap: asString(record.maxGap, defaults.maxGap),
    minGap: asString(record.minGap, defaults.minGap),
    walking: asString(record.walking, defaults.walking),
    premiumFormats: asString(record.premiumFormats, defaults.premiumFormats),
    budget: asString(record.budget, defaults.budget),
    accessibility: asString(record.accessibility, defaults.accessibility),
    includeSpecialEvents: record.includeSpecialEvents === true,
    allowRepeats: record.allowRepeats === true,
    excludeSoldOut: record.excludeSoldOut === true,
  };
}

/**
 * @param {object} form
 * @returns {{ version: number, savedAt: string, form: object }}
 */
export function serializeBuildPlanDraft(form) {
  const sanitized = sanitizeBuildPlanDraft(form);
  return {
    version: BUILD_PLAN_DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    form: sanitized ?? createLiveBuildPlanFormState(),
  };
}

/**
 * @param {unknown} raw
 * @param {{ now?: Date | (() => Date) }} [options]
 * @returns {{
 *   ok: boolean,
 *   form: object | null,
 *   reason?: 'empty' | 'corrupt' | 'unsupported_version' | 'invalid_form',
 * }}
 */
export function parseBuildPlanDraft(raw, options = {}) {
  if (raw == null || raw === '') {
    return { ok: false, form: null, reason: 'empty' };
  }

  let payload = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, form: null, reason: 'corrupt' };
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, form: null, reason: 'corrupt' };
  }

  const record = /** @type {Record<string, unknown>} */ (payload);
  if (record.version !== BUILD_PLAN_DRAFT_VERSION) {
    return { ok: false, form: null, reason: 'unsupported_version' };
  }

  if (
    record.form == null ||
    typeof record.form !== 'object' ||
    Array.isArray(record.form)
  ) {
    return { ok: false, form: null, reason: 'invalid_form' };
  }

  const form = sanitizeBuildPlanDraft(record.form, options);
  if (!form) {
    return { ok: false, form: null, reason: 'invalid_form' };
  }

  for (const key of OMITTED_RESULT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(form, key)) {
      delete form[key];
    }
  }

  return { ok: true, form };
}

/**
 * @param {Storage | null | undefined} storage
 * @param {{ now?: Date | (() => Date) }} [options]
 * @returns {{ ok: boolean, form: object | null, reason?: string }}
 */
export function readBuildPlanDraft(storage, options = {}) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ok: false, form: null, reason: 'empty' };
  }
  try {
    return parseBuildPlanDraft(storage.getItem(BUILD_PLAN_DRAFT_STORAGE_KEY), options);
  } catch {
    return { ok: false, form: null, reason: 'corrupt' };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} form
 * @returns {boolean}
 */
export function writeBuildPlanDraft(storage, form) {
  if (!storage || typeof storage.setItem !== 'function' || !form) return false;
  try {
    storage.setItem(
      BUILD_PLAN_DRAFT_STORAGE_KEY,
      JSON.stringify(serializeBuildPlanDraft(form)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearBuildPlanDraftStorage(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(BUILD_PLAN_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}