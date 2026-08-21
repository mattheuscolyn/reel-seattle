/**
 * Human-facing copy for Planner structured constraint conflicts (PR2 / PLAN-10).
 */

/**
 * @param {{ code?: string, message?: string }} conflict
 * @returns {string}
 */
export function formatPlannerConflictMessage(conflict) {
  if (!conflict || typeof conflict !== 'object') {
    return 'These plan constraints conflict. Adjust locks, films, or the time window.';
  }
  if (typeof conflict.message === 'string' && conflict.message.trim()) {
    return conflict.message.trim();
  }
  switch (conflict.code) {
    case 'locked_showtimes_overlap':
      return 'Two locked screenings overlap or leave too little time between them.';
    case 'locked_showtimes_multiple_theaters':
      return 'Locked screenings are at different theaters. Same-theater plans can’t include both yet.';
    case 'locked_showtime_date_mismatch':
      return 'A locked screening is not on the selected plan date.';
    case 'locked_showtime_theater_mismatch':
      return 'A locked screening is outside the selected theater filter.';
    case 'locked_showtime_outside_time_window':
      return 'A locked screening is outside your start/finish time window.';
    case 'locked_showtime_unresolved':
      return 'A locked screening is no longer available in the current showtimes data.';
    case 'plan_size_smaller_than_locks':
      return 'Plan size is smaller than the number of locked screenings.';
    case 'must_include_not_interested':
      return 'A film can’t be both Must Include and Not Interested.';
    case 'locked_film_not_interested':
      return 'A locked film is also marked Not Interested.';
    case 'must_include_no_eligible_performance':
      return 'A Must Include film has no matching screening under your current filters.';
    default:
      return 'These plan constraints conflict. Adjust locks, films, or the time window.';
  }
}

/**
 * @param {object[]} conflicts
 * @returns {string[]}
 */
export function formatPlannerConflictMessages(conflicts) {
  if (!Array.isArray(conflicts)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const conflict of conflicts) {
    const message = formatPlannerConflictMessage(conflict);
    if (seen.has(message)) continue;
    seen.add(message);
    out.push(message);
  }
  return out;
}

/**
 * @param {object[]} conflicts
 * @param {string} performanceKey
 */
export function conflictsForPerformance(conflicts, performanceKey) {
  const key = String(performanceKey ?? '').trim();
  if (!key || !Array.isArray(conflicts)) return [];
  return conflicts.filter((c) =>
    (c.relatedPerformanceKeys ?? []).includes(key),
  );
}

/**
 * @param {object[]} conflicts
 * @param {object} filmCard
 */
export function conflictsForFilmCard(conflicts, filmCard) {
  if (!Array.isArray(conflicts) || !filmCard) return [];
  const tokens = [
    filmCard.filmId,
    filmCard.filmKey,
    filmCard.id,
    filmCard.showtimeFilmKey,
  ]
    .map((t) => String(t ?? '').trim())
    .filter(Boolean);
  if (!tokens.length) return [];
  return conflicts.filter((c) =>
    (c.relatedFilmKeys ?? []).some((k) => tokens.includes(String(k))),
  );
}
