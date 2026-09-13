/**
 * Pure lookup / presentation helpers for shorts_programs_current.json.
 * Does not duplicate showtimes — join via showtimeFilmKey / listing key.
 */

import { CONTENT_CLASSIFICATION_SHORTS_PROGRAM } from '../adapters/contentClassification.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Presentation title for a ShortsProgram (peel festival prefix / (Shorts) suffix).
 * @param {string | null | undefined} title
 */
export function programDisplayTitle(title) {
  const raw = asText(title);
  if (!raw) return null;
  let next = raw.replace(/^Local Sightings\s+\d{4}\s*[–—-]\s*/i, '');
  next = next.replace(/\s*\((?:Shorts|Experimental Shorts)\)\s*$/i, '');
  return asText(next) || raw;
}

/**
 * @param {string | null | undefined} title
 */
export function shortDisplayTitle(title) {
  return asText(title);
}

/**
 * @param {unknown} artifact
 */
export function indexShortsProgramsArtifact(artifact) {
  /** @type {Map<string, object>} */
  const shortById = new Map();
  /** @type {Map<string, object>} */
  const programById = new Map();
  /** @type {Map<string, string>} */
  const programIdByShowtimeFilmKey = new Map();
  /** @type {Map<string, string>} */
  const programIdBySourceListingKey = new Map();
  /** @type {Map<string, string>} */
  const programIdBySourceFilmId = new Map();
  /** @type {Map<string, object[]>} */
  const membershipsByProgramId = new Map();
  /** @type {Map<string, object[]>} */
  const membershipsByShortId = new Map();

  for (const short of Array.isArray(artifact?.shorts) ? artifact.shorts : []) {
    const id = asText(short?.shortId);
    if (!id) continue;
    shortById.set(id, short);
  }

  for (const program of Array.isArray(artifact?.shortsPrograms)
    ? artifact.shortsPrograms
    : []) {
    const id = asText(program?.shortsProgramId);
    if (!id) continue;
    programById.set(id, program);
    const showtimeKey = asText(program?.showtimeFilmKey);
    if (showtimeKey) programIdByShowtimeFilmKey.set(showtimeKey, id);
    const listingKey = asText(program?.sourceListingKey);
    if (listingKey) programIdBySourceListingKey.set(listingKey, id);
    const sourceFilmId = asText(program?.sourceFilmId);
    if (sourceFilmId) programIdBySourceFilmId.set(sourceFilmId, id);
  }

  for (const membership of Array.isArray(artifact?.memberships)
    ? artifact.memberships
    : []) {
    const programId = asText(membership?.shortsProgramId);
    const shortId = asText(membership?.shortId);
    if (!programId || !shortId) continue;
    if (!membershipsByProgramId.has(programId)) {
      membershipsByProgramId.set(programId, []);
    }
    membershipsByProgramId.get(programId).push(membership);
    if (!membershipsByShortId.has(shortId)) {
      membershipsByShortId.set(shortId, []);
    }
    membershipsByShortId.get(shortId).push(membership);
  }

  for (const [programId, rows] of membershipsByProgramId) {
    rows.sort(
      (a, b) =>
        (Number(a.position) || 0) - (Number(b.position) || 0) ||
        String(a.shortId).localeCompare(String(b.shortId)),
    );
    membershipsByProgramId.set(programId, rows);
  }

  return {
    shortById,
    programById,
    programIdByShowtimeFilmKey,
    programIdBySourceListingKey,
    programIdBySourceFilmId,
    membershipsByProgramId,
    membershipsByShortId,
  };
}

/**
 * Resolve a ShortsProgram id from a HomeData / schedule film listing.
 * Prefers explicit shorts_program classification, then listing identity join.
 *
 * @param {{
 *   film?: object | null,
 *   filmKey?: string | null,
 *   sourceFilmId?: string | null,
 *   sourceListingKey?: string | null,
 *   contentClassification?: string | null,
 *   index: ReturnType<typeof indexShortsProgramsArtifact> | null,
 * }} input
 * @returns {string | null}
 */
export function resolveShortsProgramIdForListing(input) {
  const index = input?.index;
  if (!index) return null;
  const film = input.film ?? null;
  const classification =
    asText(input.contentClassification) ||
    asText(film?.contentClassification) ||
    null;
  const filmKey = asText(input.filmKey) || asText(film?.filmKey);
  const sourceFilmId =
    asText(input.sourceFilmId) || asText(film?.sourceFilmId);
  const listingKey =
    asText(input.sourceListingKey) ||
    (sourceFilmId ? `nwff|id|${sourceFilmId}` : null);

  const byShowtime = filmKey
    ? index.programIdByShowtimeFilmKey.get(filmKey) ?? null
    : null;
  const byListing = listingKey
    ? index.programIdBySourceListingKey.get(listingKey) ?? null
    : null;
  const bySourceId = sourceFilmId
    ? index.programIdBySourceFilmId.get(sourceFilmId) ?? null
    : null;

  if (classification === CONTENT_CLASSIFICATION_SHORTS_PROGRAM) {
    return byShowtime || byListing || bySourceId;
  }
  // Collection / listing join without classification stamp.
  return byShowtime || byListing || bySourceId;
}

/**
 * @param {ReturnType<typeof indexShortsProgramsArtifact> | null} index
 * @param {string | null | undefined} shortsProgramId
 */
export function getShortsProgram(index, shortsProgramId) {
  const id = asText(shortsProgramId);
  if (!index || !id) return null;
  return index.programById.get(id) ?? null;
}

/**
 * @param {ReturnType<typeof indexShortsProgramsArtifact> | null} index
 * @param {string | null | undefined} shortId
 */
export function getShort(index, shortId) {
  const id = asText(shortId);
  if (!index || !id) return null;
  return index.shortById.get(id) ?? null;
}

/**
 * @param {ReturnType<typeof indexShortsProgramsArtifact> | null} index
 * @param {string | null | undefined} shortsProgramId
 */
export function membershipsForProgram(index, shortsProgramId) {
  const id = asText(shortsProgramId);
  if (!index || !id) return [];
  return index.membershipsByProgramId.get(id) ?? [];
}

/**
 * @param {ReturnType<typeof indexShortsProgramsArtifact> | null} index
 * @param {string | null | undefined} shortId
 */
export function programMembershipsForShort(index, shortId) {
  const id = asText(shortId);
  if (!index || !id) return [];
  return index.membershipsByShortId.get(id) ?? [];
}

/**
 * @param {object | null | undefined} program
 * @returns {string[]}
 */
export function collectionIdsForProgram(program) {
  const raw = program?.collectionIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => asText(id)).filter(Boolean);
}

/**
 * @param {object | null | undefined} short
 * @param {object | null | undefined} membership
 */
export function formatShortMetaLine(short, membership = null) {
  const year =
    short?.year ?? membership?.parsedYear ?? membership?.year ?? null;
  const runtime =
    short?.runtimeMin ??
    membership?.parsedRuntimeMin ??
    membership?.runtimeMin ??
    null;
  const language =
    asText(short?.language) ||
    asText(membership?.parsedLanguage) ||
    asText(membership?.language);
  /** @type {string[]} */
  const parts = [];
  if (year != null && Number.isFinite(Number(year))) parts.push(String(year));
  if (runtime != null && Number.isFinite(Number(runtime))) {
    parts.push(`${Number(runtime)} min`);
  }
  if (language) parts.push(language);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * @param {object | null | undefined} short
 * @param {object | null | undefined} membership
 */
export function formatShortDirectors(short, membership = null) {
  const dirs = Array.isArray(short?.directors)
    ? short.directors
    : Array.isArray(membership?.parsedDirectors)
      ? membership.parsedDirectors
      : [];
  const cleaned = dirs.map((d) => asText(d)).filter(Boolean);
  if (cleaned.length === 0) return null;
  return `Directed by ${cleaned.join(', ')}`;
}

/**
 * Detail rows for Short Detail — omit empty values.
 * Presentation-only; does not invent genres or provenance/source rows.
 * @param {object | null | undefined} short
 * @param {object | null | undefined} membership
 */
export function buildShortDetailRows(short, membership = null) {
  /** @type {{ label: string, value: string }[]} */
  const rows = [];
  const directors = Array.isArray(short?.directors)
    ? short.directors.map((d) => asText(d)).filter(Boolean)
    : Array.isArray(membership?.parsedDirectors)
      ? membership.parsedDirectors.map((d) => asText(d)).filter(Boolean)
      : [];
  if (directors.length) {
    rows.push({
      label: directors.length === 1 ? 'Director' : 'Directors',
      value: directors.join(', '),
    });
  }
  const year = short?.year ?? membership?.parsedYear;
  if (year != null && Number.isFinite(Number(year))) {
    rows.push({ label: 'Year', value: String(year) });
  }
  const runtime = short?.runtimeMin ?? membership?.parsedRuntimeMin;
  if (runtime != null && Number.isFinite(Number(runtime))) {
    rows.push({ label: 'Runtime', value: `${Number(runtime)} minutes` });
  }
  const language = asText(short?.language) || asText(membership?.parsedLanguage);
  if (language) rows.push({ label: 'Language', value: language });
  const location =
    asText(short?.locationText) || asText(membership?.parsedLocationText);
  if (location) rows.push({ label: 'Location', value: location });
  return rows;
}
