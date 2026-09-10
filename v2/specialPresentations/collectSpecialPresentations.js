/**
 * Canonical Special Presentations film collection.
 *
 * Qualification matches Home shelf semantics: an opportunity qualifies when it
 * matches any id in SPECIAL_PRESENTATION_CANONICAL_IDS (format + experience
 * canonicals from formatNormalize — e.g. 70mm, IMAX, Live Score, Open Captions).
 *
 * List is film-level: one entry per film with aggregated qualifying opportunities.
 */

import {
  CANONICAL_BROWSE_LABEL,
  EXPERIENCE_CANONICAL_IDS,
  FORMAT_CANONICAL_IDS,
  opportunityMatchesCanonical,
} from '../formatsExperiences/formatNormalize.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';

/** Prefer rarer / more premium specials when a film has multiple. */
export const SPECIAL_PRESENTATION_PRIORITY = Object.freeze([
  'imax-70mm',
  '70mm',
  '35mm',
  'imax',
  'dolby-cinema',
  'xl-amc',
  'reald-3d',
  'live-score',
  'open-caption',
  'audio-description',
]);

export const SPECIAL_PRESENTATION_CANONICAL_IDS = Object.freeze([
  ...FORMAT_CANONICAL_IDS,
  ...EXPERIENCE_CANONICAL_IDS,
]);

/**
 * @param {object} opportunity
 * @returns {string | null}
 */
export function resolveBestSpecialCanonicalId(opportunity) {
  const matches = SPECIAL_PRESENTATION_CANONICAL_IDS.filter((id) =>
    opportunityMatchesCanonical(opportunity, id),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const ai = SPECIAL_PRESENTATION_PRIORITY.indexOf(a);
    const bi = SPECIAL_PRESENTATION_PRIORITY.indexOf(b);
    const ap = ai === -1 ? 99 : ai;
    const bp = bi === -1 ? 99 : bi;
    return ap - bp;
  });
  return matches[0];
}

/**
 * @param {string} canonicalId
 * @returns {string}
 */
export function specialPresentationBrowseLabel(canonicalId) {
  return (
    CANONICAL_BROWSE_LABEL[canonicalId] ??
    formatUserFacingFormatLabel(canonicalId) ??
    canonicalId
  );
}

/**
 * All special-presentation canonical ids matched by one opportunity.
 * @param {object} opportunity
 * @returns {string[]}
 */
export function matchingSpecialCanonicalIds(opportunity) {
  return SPECIAL_PRESENTATION_CANONICAL_IDS.filter((id) =>
    opportunityMatchesCanonical(opportunity, id),
  );
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareSpecialPriority(a, b) {
  const ai = SPECIAL_PRESENTATION_PRIORITY.indexOf(a);
  const bi = SPECIAL_PRESENTATION_PRIORITY.indexOf(b);
  const ap = ai === -1 ? 99 : ai;
  const bp = bi === -1 ? 99 : bi;
  if (ap !== bp) return ap - bp;
  return String(a).localeCompare(String(b));
}

/**
 * Collect film-level Special Presentations from Home opportunities.
 *
 * @param {object | null | undefined} homeData
 * @returns {{
 *   filmKey: string,
 *   qualifyingOpportunities: object[],
 *   presentationCanonicalIds: string[],
 *   bestCanonicalId: string,
 *   bestOpportunity: object,
 *   earliestLocalDate: string | null,
 *   earliestSortableLocalDateTime: string | null,
 * }[]}
 */
export function collectSpecialPresentationsByFilm(homeData) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];

  /** @type {Map<string, object[]>} */
  const qualifyingByFilm = new Map();

  for (const opportunity of opportunities) {
    const filmKey =
      typeof opportunity?.filmKey === 'string' ? opportunity.filmKey.trim() : '';
    if (!filmKey) continue;
    const matched = matchingSpecialCanonicalIds(opportunity);
    if (matched.length === 0) continue;
    let list = qualifyingByFilm.get(filmKey);
    if (!list) {
      list = [];
      qualifyingByFilm.set(filmKey, list);
    }
    list.push(opportunity);
  }

  /** @type {ReturnType<typeof collectSpecialPresentationsByFilm>} */
  const rows = [];

  for (const [filmKey, qualifyingOpportunities] of qualifyingByFilm) {
    /** @type {Set<string>} */
    const idSet = new Set();
    for (const opportunity of qualifyingOpportunities) {
      for (const id of matchingSpecialCanonicalIds(opportunity)) {
        idSet.add(id);
      }
    }
    const presentationCanonicalIds = [...idSet].sort(compareSpecialPriority);
    if (presentationCanonicalIds.length === 0) continue;

    let bestCanonicalId = presentationCanonicalIds[0];
    let bestOpportunity = qualifyingOpportunities[0];
    for (const opportunity of qualifyingOpportunities) {
      const canonicalId = resolveBestSpecialCanonicalId(opportunity);
      if (!canonicalId) continue;
      const existingPri = SPECIAL_PRESENTATION_PRIORITY.indexOf(bestCanonicalId);
      const nextPri = SPECIAL_PRESENTATION_PRIORITY.indexOf(canonicalId);
      const existingRank = existingPri === -1 ? 99 : existingPri;
      const nextRank = nextPri === -1 ? 99 : nextPri;
      if (nextRank < existingRank) {
        bestCanonicalId = canonicalId;
        bestOpportunity = opportunity;
        continue;
      }
      if (nextRank === existingRank) {
        const a = bestOpportunity.sortableLocalDateTime ?? '';
        const b = opportunity.sortableLocalDateTime ?? '';
        if (b && (!a || b < a)) {
          bestCanonicalId = canonicalId;
          bestOpportunity = opportunity;
        }
      }
    }

    let earliestLocalDate = null;
    let earliestSortableLocalDateTime = null;
    for (const opportunity of qualifyingOpportunities) {
      const sortable =
        typeof opportunity.sortableLocalDateTime === 'string'
          ? opportunity.sortableLocalDateTime
          : '';
      const localDate =
        typeof opportunity.localDate === 'string'
          ? opportunity.localDate.trim()
          : '';
      if (
        sortable &&
        (!earliestSortableLocalDateTime ||
          sortable < earliestSortableLocalDateTime)
      ) {
        earliestSortableLocalDateTime = sortable;
        earliestLocalDate = /^\d{4}-\d{2}-\d{2}$/.test(localDate)
          ? localDate
          : sortable.slice(0, 10);
      } else if (
        !earliestSortableLocalDateTime &&
        /^\d{4}-\d{2}-\d{2}$/.test(localDate) &&
        (!earliestLocalDate || localDate < earliestLocalDate)
      ) {
        earliestLocalDate = localDate;
      }
    }

    rows.push({
      filmKey,
      qualifyingOpportunities,
      presentationCanonicalIds,
      bestCanonicalId,
      bestOpportunity,
      earliestLocalDate,
      earliestSortableLocalDateTime,
    });
  }

  rows.sort((a, b) => {
    const ap = SPECIAL_PRESENTATION_PRIORITY.indexOf(a.bestCanonicalId);
    const bp = SPECIAL_PRESENTATION_PRIORITY.indexOf(b.bestCanonicalId);
    const aRank = ap === -1 ? 99 : ap;
    const bRank = bp === -1 ? 99 : bp;
    if (aRank !== bRank) return aRank - bRank;
    const at = a.earliestSortableLocalDateTime ?? '';
    const bt = b.earliestSortableLocalDateTime ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.filmKey < b.filmKey ? -1 : 1;
  });

  return rows;
}
