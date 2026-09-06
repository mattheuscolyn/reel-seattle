/**
 * Mechanical Top Opportunities selection for v2 Home (I-03).
 *
 * This is NOT a recommendation engine. It picks a scarce, deterministic set of
 * film-level representatives from HomeData.opportunityCandidates using only
 * fields already present in I-02.
 *
 * Policy (exact):
 * 1. Cap at `max` (default 3, hard ceiling 5).
 * 2. Collapse to one representative candidate per filmKey: earliest
 *    chronologicalKey among that film’s candidates.
 * 3. Exclude candidates missing title, theaterId, theaterName, or
 *    sortableLocalDateTime (“Unknown theater” theaterName is excluded).
 * 4. Fill slots in order:
 *    a. One newly-added film (earliest chronological among newly-added reps)
 *    b. One special-format film (non-empty formatLabels; earliest; not yet selected)
 *    c. One limited-listings film (filmShowtimeCount <= LIMITED_SHOWTIME_MAX;
 *       earliest; not yet selected)
 *    d. Remaining slots by upcoming sortableLocalDateTime, preferring
 *       theaterIds not yet represented when times are equal
 * 5. Primary reason code is the first matching factual category used for
 *    inclusion (or showing_soon when filled only by chronology).
 *
 * Labels explain inclusion mechanics — never cultural importance or taste.
 */

export const TOP_OPPORTUNITIES_DEFAULT_MAX = 3;
export const TOP_OPPORTUNITIES_HARD_MAX = 5;
/** Inclusive: films with this many current showtimes (or fewer) may use limited_listings. */
export const LIMITED_SHOWTIME_MAX = 2;

export const SELECTION_REASON_CODES = Object.freeze({
  newly_added: 'newly_added',
  special_format: 'special_format',
  limited_listings: 'limited_listings',
  multiple_theaters: 'multiple_theaters',
  showing_soon: 'showing_soon',
});

export const SELECTION_REASON_LABELS = Object.freeze({
  newly_added: 'Newly added',
  special_format: 'Special format',
  limited_listings: 'Limited current listings',
  multiple_theaters: 'Available at multiple theaters',
  showing_soon: 'Showing soon',
});

const FORBIDDEN_REASON_LABELS = Object.freeze([
  'Essential',
  'Critics’ pick',
  "Critics' pick",
  'Don’t miss',
  "Don't miss",
  'Best choice',
  'Recommended for you',
  'Seattle favorite',
  'Last chance',
  'One night only',
  'Final screening',
]);

/**
 * @param {number} value
 * @param {number} fallback
 */
function clampMax(value, fallback) {
  const n = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(0, Math.min(TOP_OPPORTUNITIES_HARD_MAX, n));
}

/**
 * @param {object} candidate
 */
export function isSelectableCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (typeof candidate.filmKey !== 'string' || !candidate.filmKey.trim()) return false;
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) return false;
  if (typeof candidate.theaterId !== 'string' || !candidate.theaterId.trim()) return false;
  if (typeof candidate.theaterName !== 'string' || !candidate.theaterName.trim()) {
    return false;
  }
  if (candidate.theaterName.trim().toLowerCase() === 'unknown theater') return false;
  if (
    typeof candidate.sortableLocalDateTime !== 'string' ||
    !candidate.sortableLocalDateTime.trim()
  ) {
    return false;
  }
  if (typeof candidate.chronologicalKey !== 'string' || !candidate.chronologicalKey.trim()) {
    return false;
  }
  if (typeof candidate.opportunityKey !== 'string' || !candidate.opportunityKey.trim()) {
    return false;
  }
  return true;
}

/**
 * @param {object} a
 * @param {object} b
 */
function compareChronological(a, b) {
  if (a.chronologicalKey !== b.chronologicalKey) {
    return a.chronologicalKey < b.chronologicalKey ? -1 : 1;
  }
  return a.filmKey < b.filmKey ? -1 : 1;
}

/**
 * @param {object} candidate
 * @returns {string}
 */
export function assignPrimaryReasonCode(candidate) {
  if (candidate.isNewlyAdded === true) return SELECTION_REASON_CODES.newly_added;
  if (Array.isArray(candidate.formatLabels) && candidate.formatLabels.length > 0) {
    return SELECTION_REASON_CODES.special_format;
  }
  if (
    typeof candidate.filmShowtimeCount === 'number' &&
    candidate.filmShowtimeCount <= LIMITED_SHOWTIME_MAX
  ) {
    return SELECTION_REASON_CODES.limited_listings;
  }
  if (typeof candidate.filmTheaterCount === 'number' && candidate.filmTheaterCount >= 2) {
    return SELECTION_REASON_CODES.multiple_theaters;
  }
  return SELECTION_REASON_CODES.showing_soon;
}

/**
 * @param {string} code
 * @param {object} candidate
 */
function buildSupportingFacts(code, candidate) {
  const facts = {
    filmShowtimeCount: candidate.filmShowtimeCount ?? null,
    filmTheaterCount: candidate.filmTheaterCount ?? null,
    formatLabels: Array.isArray(candidate.formatLabels) ? [...candidate.formatLabels] : [],
    isNewlyAdded: candidate.isNewlyAdded === true,
  };

  if (code === SELECTION_REASON_CODES.limited_listings) {
    facts.limitedShowtimeThreshold = LIMITED_SHOWTIME_MAX;
    facts.listingCountLabel =
      candidate.filmShowtimeCount === 1
        ? '1 current showtime'
        : `${candidate.filmShowtimeCount} current showtimes`;
  }
  if (code === SELECTION_REASON_CODES.multiple_theaters) {
    facts.theaterCountLabel = `At ${candidate.filmTheaterCount} theaters`;
  }
  if (code === SELECTION_REASON_CODES.special_format && facts.formatLabels.length > 0) {
    facts.formatLabel = facts.formatLabels.join(', ');
  }

  return facts;
}

/**
 * @param {object} candidate
 * @param {Map<string, object>} filmsByKey
 * @param {Map<string, object>} opportunitiesByKey
 * @param {string} reasonCode
 * @param {number} index
 */
function toSelection(candidate, filmsByKey, opportunitiesByKey, reasonCode, index) {
  const film = filmsByKey.get(candidate.filmKey) ?? {
    filmKey: candidate.filmKey,
    title: candidate.title,
    posterUrl: null,
    runtimeMin: null,
    showtimeCount: candidate.filmShowtimeCount ?? 0,
    theaterCount: candidate.filmTheaterCount ?? 0,
  };
  const opportunity = opportunitiesByKey.get(candidate.opportunityKey) ?? {
    opportunityKey: candidate.opportunityKey,
    filmKey: candidate.filmKey,
    theaterId: candidate.theaterId,
    theaterName: candidate.theaterName,
    sortableLocalDateTime: candidate.sortableLocalDateTime,
    localDate: candidate.sortableLocalDateTime.slice(0, 10),
    localTime: candidate.sortableLocalDateTime.slice(11, 16),
    timeDisplay: candidate.sortableLocalDateTime.slice(11, 16),
    formatLabels: candidate.formatLabels ?? [],
    ticketUrl: null,
  };

  const additionalShowtimes = Math.max(0, (film.showtimeCount ?? 0) - 1);
  const label = SELECTION_REASON_LABELS[reasonCode];
  if (FORBIDDEN_REASON_LABELS.includes(label)) {
    throw new Error(`Forbidden selection reason label: ${label}`);
  }

  return {
    film,
    representativeOpportunity: opportunity,
    selectionReasonCode: reasonCode,
    selectionReasonLabel: label,
    supportingFacts: buildSupportingFacts(reasonCode, candidate),
    additionalShowtimeCount: additionalShowtimes,
    candidateIndex: index,
    chronologicalKey: candidate.chronologicalKey,
  };
}

/**
 * Select Top Opportunities from HomeData.
 *
 * @param {{
 *   opportunityCandidates?: object[],
 *   films?: object[],
 *   opportunities?: object[],
 * } | null | undefined} homeData
 * @param {{ max?: number }} [options]
 * @returns {object[]}
 */
export function selectTopOpportunities(homeData, options = {}) {
  const max = clampMax(
    options.max ?? TOP_OPPORTUNITIES_DEFAULT_MAX,
    TOP_OPPORTUNITIES_DEFAULT_MAX,
  );
  if (max === 0 || !homeData) return [];

  const candidates = Array.isArray(homeData.opportunityCandidates)
    ? homeData.opportunityCandidates
    : [];
  const filmsByKey = new Map(
    (Array.isArray(homeData.films) ? homeData.films : []).map((film) => [
      film.filmKey,
      film,
    ]),
  );
  const opportunitiesByKey = new Map(
    (Array.isArray(homeData.opportunities) ? homeData.opportunities : []).map(
      (opportunity) => [opportunity.opportunityKey, opportunity],
    ),
  );

  /** @type {Map<string, object>} */
  const repsByFilm = new Map();
  for (const candidate of candidates) {
    if (!isSelectableCandidate(candidate)) continue;
    const existing = repsByFilm.get(candidate.filmKey);
    if (!existing || compareChronological(candidate, existing) < 0) {
      repsByFilm.set(candidate.filmKey, candidate);
    }
  }

  const representatives = [...repsByFilm.values()].sort(compareChronological);
  if (representatives.length === 0) return [];

  /** @type {object[]} */
  const selected = [];
  const selectedFilmKeys = new Set();
  const selectedTheaterIds = new Set();

  /**
   * @param {(c: object) => boolean} predicate
   */
  function pickFirst(predicate) {
    for (const candidate of representatives) {
      if (selectedFilmKeys.has(candidate.filmKey)) continue;
      if (!predicate(candidate)) continue;
      selected.push(candidate);
      selectedFilmKeys.add(candidate.filmKey);
      selectedTheaterIds.add(candidate.theaterId);
      return true;
    }
    return false;
  }

  if (selected.length < max) {
    pickFirst((c) => c.isNewlyAdded === true);
  }
  if (selected.length < max) {
    pickFirst(
      (c) => Array.isArray(c.formatLabels) && c.formatLabels.length > 0,
    );
  }
  if (selected.length < max) {
    pickFirst(
      (c) =>
        typeof c.filmShowtimeCount === 'number' &&
        c.filmShowtimeCount <= LIMITED_SHOWTIME_MAX,
    );
  }

  const remaining = representatives.filter((c) => !selectedFilmKeys.has(c.filmKey));
  remaining.sort((a, b) => {
    if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
      return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
    }
    const aSeenTheater = selectedTheaterIds.has(a.theaterId) ? 1 : 0;
    const bSeenTheater = selectedTheaterIds.has(b.theaterId) ? 1 : 0;
    if (aSeenTheater !== bSeenTheater) return aSeenTheater - bSeenTheater;
    if (a.theaterId !== b.theaterId) {
      return a.theaterId < b.theaterId ? -1 : 1;
    }
    return a.filmKey < b.filmKey ? -1 : 1;
  });

  for (const candidate of remaining) {
    if (selected.length >= max) break;
    selected.push(candidate);
    selectedFilmKeys.add(candidate.filmKey);
    selectedTheaterIds.add(candidate.theaterId);
  }

  return selected.map((candidate, index) => {
    // Reason reflects the factual category that best explains the film’s
    // mechanical inclusion — not a quality score.
    let reasonCode = assignPrimaryReasonCode(candidate);
    // Chronology-only fills without other signals stay "Showing soon".
    if (
      reasonCode === SELECTION_REASON_CODES.multiple_theaters &&
      candidate.isNewlyAdded !== true &&
      !(Array.isArray(candidate.formatLabels) && candidate.formatLabels.length > 0) &&
      !(
        typeof candidate.filmShowtimeCount === 'number' &&
        candidate.filmShowtimeCount <= LIMITED_SHOWTIME_MAX
      )
    ) {
      // multiple_theaters is still factual when true — keep it.
    }
    return toSelection(
      candidate,
      filmsByKey,
      opportunitiesByKey,
      reasonCode,
      index,
    );
  });
}

/**
 * Pure navigation helpers for Previous/Next controls.
 * Invalid indices clamp into range; circular next/prev wrap with modular math.
 * @param {number} index
 * @param {number} length
 */
export function clampSelectionIndex(index, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}

/**
 * Wrap an index into `[0, length)`.
 * @param {number} index
 * @param {number} length
 */
export function wrapSelectionIndex(index, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const i = Math.floor(index);
  return ((i % length) + length) % length;
}

/**
 * Circular carousel: Previous is available whenever there is more than one item.
 * @param {number} index
 * @param {number} length
 */
export function canGoPrevious(index, length) {
  void index;
  return length > 1;
}

/**
 * Circular carousel: Next is available whenever there is more than one item.
 * @param {number} index
 * @param {number} length
 */
export function canGoNext(index, length) {
  void index;
  return length > 1;
}

export { FORBIDDEN_REASON_LABELS };
