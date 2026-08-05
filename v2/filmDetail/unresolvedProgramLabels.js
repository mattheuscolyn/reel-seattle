/**
 * Light-touch labels for reviewed non-TMDB programs/events.
 * Used only when canonical filmId is absent — no page redesign.
 */

/** @type {Record<string, string>} */
export const UNRESOLVED_PROGRAM_LABELS_BY_FILM_KEY = Object.freeze({
  'six-the-musical-live': 'Special event',
  'met-summer-encore-aida-2026': 'Special event',
  'grateful-dead-meet-up-at-the-movies-2026': 'Special event',
  'texas-chainsaw-day-2026': 'Program',
  '2026-cortis-tour-put-your-phone-down-in-la-live-viewing-2026': 'Special event',
  'amc-screen-unseen-august-10': 'Special event',
  'children-of-the-night-the-third-annual-beacon-all-nighter': 'Multi-film event',
  'this-doesn-t-sound-like-it-has-anything-to-do-with-what-our-store-is-doing-films-by-frank-heath':
    'Shorts program',
  'cartoon-happy-hour': 'Shorts program',
  'private-rental-event': 'Special event',
  'catvideofest-2026': 'Shorts program',
  'wine-crime-live': 'Special event',
});

/**
 * @param {{ filmId?: string | null, filmKey?: string | null, screeningVariantType?: string | null } | null | undefined} film
 * @returns {string | null}
 */
export function unresolvedProgramLabel(film) {
  if (!film || film.filmId) return null;
  const key = typeof film.filmKey === 'string' ? film.filmKey.trim() : '';
  if (key && UNRESOLVED_PROGRAM_LABELS_BY_FILM_KEY[key]) {
    return UNRESOLVED_PROGRAM_LABELS_BY_FILM_KEY[key];
  }
  const variant =
    typeof film.screeningVariantType === 'string'
      ? film.screeningVariantType.trim().toLowerCase()
      : '';
  if (variant === 'special_event' || variant === 'live_encore') {
    return 'Special event';
  }
  if (variant === 'fan_event') return 'Fan event';
  return null;
}
