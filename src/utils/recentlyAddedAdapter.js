/**
 * Fetch and parse newly_added_current.json for the Recently Added section.
 */

const isViteDev =
  typeof import.meta !== 'undefined' &&
  import.meta.env != null &&
  import.meta.env.DEV === true;

export const NEWLY_ADDED_URL = isViteDev
  ? '/data/newly_added_current.json'
  : './data/newly_added_current.json';

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function cleanIsoDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

/**
 * @param {unknown} artifact
 * @returns {Array<{
 *   showtime_film_key: string;
 *   film_title: string;
 *   theater_id: string;
 *   theater_name: string;
 *   first_announced_date: string;
 *   last_seen_date: string;
 * }>}
 */
export function parseRecentlyAddedEntries(artifact) {
  if (!artifact || typeof artifact !== 'object') return [];
  const rawEntries = Array.isArray(artifact.entries) ? artifact.entries : [];

  const entries = [];
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object') continue;

    const showtime_film_key = cleanString(raw.showtime_film_key);
    const film_title = cleanString(raw.film_title);
    const theater_id = cleanString(raw.theater_id);
    const theater_name = cleanString(raw.theater_name);
    const first_announced_date = cleanIsoDate(raw.first_announced_date);
    const last_seen_date = cleanIsoDate(raw.last_seen_date);

    if (
      !showtime_film_key ||
      !film_title ||
      !theater_id ||
      !theater_name ||
      !first_announced_date ||
      !last_seen_date
    ) {
      continue;
    }

    entries.push({
      showtime_film_key,
      film_title,
      theater_id,
      theater_name,
      first_announced_date,
      last_seen_date,
    });
  }

  return entries;
}

/**
 * @param {unknown} artifact
 * @returns {number | null}
 */
export function daysBackFromArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') return null;
  const daysBack = artifact.days_back;
  return typeof daysBack === 'number' && Number.isFinite(daysBack) && daysBack > 0
    ? daysBack
    : null;
}

export async function fetchRecentlyAddedArtifact(url = NEWLY_ADDED_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Recently added data unavailable');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Recently added data unavailable');
  }
}
