/**
 * Reviewed unresolved-event content classification.
 *
 * Source: identity `unresolved_event_classifications.json`, emitted onto
 * showtimes_current films as `content_classification`, then HomeData.
 *
 * This is TMDB-identity classification (not a conventional movie), not a
 * public-vs-private or ticketability flag. Absence means unclassified.
 */

export const CONTENT_CLASSIFICATION_NON_FILM_EVENT = 'non_film_event';
export const CONTENT_CLASSIFICATION_PROGRAM_BLOCK = 'program_block';
export const CONTENT_CLASSIFICATION_COMPOSITE_EVENT = 'composite_event';
export const CONTENT_CLASSIFICATION_SHORTS_PROGRAM = 'shorts_program';

export const KNOWN_CONTENT_CLASSIFICATIONS = Object.freeze([
  CONTENT_CLASSIFICATION_NON_FILM_EVENT,
  CONTENT_CLASSIFICATION_PROGRAM_BLOCK,
  CONTENT_CLASSIFICATION_COMPOSITE_EVENT,
  CONTENT_CLASSIFICATION_SHORTS_PROGRAM,
]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeContentClassification(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNonFilmEventClassification(value) {
  return (
    normalizeContentClassification(value) === CONTENT_CLASSIFICATION_NON_FILM_EVENT
  );
}

/**
 * @param {unknown} doc
 * @returns {Map<string, string>}
 */
export function indexEventClassifications(doc) {
  /** @type {Map<string, string>} */
  const byFilmKey = new Map();
  const entries = Array.isArray(doc?.classifications)
    ? doc.classifications
    : Array.isArray(doc)
      ? doc
      : [];
  for (const entry of entries) {
    if (entry == null || typeof entry !== 'object') continue;
    const filmKey = normalizeContentClassification(entry.showtime_film_key);
    const classification = normalizeContentClassification(
      entry.classification ?? entry.content_classification,
    );
    if (!filmKey || !classification || byFilmKey.has(filmKey)) continue;
    byFilmKey.set(filmKey, classification);
  }
  return byFilmKey;
}

/**
 * @param {{
 *   filmKey?: string | null,
 *   filmRecord?: object | null,
 *   showtimeRecord?: object | null,
 *   classificationIndex?: Map<string, string> | null,
 * }} [input]
 * @returns {string | null}
 */
export function resolveContentClassification(input = {}) {
  const fromShowtime = normalizeContentClassification(
    input.showtimeRecord?.content_classification ??
      input.showtimeRecord?.contentClassification,
  );
  if (fromShowtime) return fromShowtime;
  const fromFilm = normalizeContentClassification(
    input.filmRecord?.content_classification ??
      input.filmRecord?.contentClassification,
  );
  if (fromFilm) return fromFilm;
  const filmKey = normalizeContentClassification(input.filmKey);
  if (filmKey && input.classificationIndex instanceof Map) {
    return input.classificationIndex.get(filmKey) ?? null;
  }
  return null;
}
