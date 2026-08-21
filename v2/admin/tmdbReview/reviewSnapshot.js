/**
 * Durable review-time snapshot for film_identity_reviews.snapshot.
 * Prefer enriching here over bloating operational columns.
 */

export const REVIEW_SNAPSHOT_VERSION = 2;

export const SELECTION_METHODS = Object.freeze({
  proposedCandidate: 'proposed_candidate',
  alternateCandidate: 'alternate_candidate',
  manualSearch: 'manual_search',
  confirmExistingCanonical: 'confirm_existing_canonical',
  manualId: 'manual_id',
});

/**
 * Compact ranked candidate rows for durable review telemetry (top N).
 * @param {unknown} candidates
 * @param {number} [limit]
 */
export function compactCandidateSnapshot(candidates, limit = 5) {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, limit).map((cand, index) => {
    const row = cand && typeof cand === 'object' ? cand : {};
    const signals =
      row.signals && typeof row.signals === 'object' ? row.signals : {};
    return {
      rank: index + 1,
      tmdb_id: row.tmdb_id ?? row.tmdbId ?? null,
      title: row.title ?? null,
      original_title: row.original_title ?? row.originalTitle ?? null,
      release_year: row.release_year ?? row.year ?? null,
      runtime_min: row.runtime_min ?? row.runtimeMin ?? null,
      score: row.score ?? null,
      warnings: Array.isArray(row.warnings) ? row.warnings : [],
      signals: {
        title_exact: Boolean(signals.title_exact),
        year_status: signals.year_status ?? null,
        year_exact: Boolean(signals.year_exact),
        runtime_near: Boolean(signals.runtime_near),
        runtime_status: signals.runtime_status ?? null,
        director_overlap: Boolean(signals.director_overlap),
        hard_conflict: Boolean(signals.hard_conflict),
      },
    };
  });
}

/**
 * Build immutable matcher_context from a film_identity_catalog row.
 * @param {object | null | undefined} film
 */
export function buildMatcherContextFromCatalogFilm(film) {
  if (!film || typeof film !== 'object') return null;
  const candidates = compactCandidateSnapshot(film.candidates, 5);
  const proposed = candidates[0] || null;
  return {
    matcher_artifact: 'film_identity_catalog',
    match_status: film.match_status ?? null,
    match_method: film.match_method ?? null,
    match_confidence: film.match_confidence ?? null,
    normalized_title: film.normalized_title ?? null,
    search_title:
      film.year_interpretation?.base_title ?? film.normalized_title ?? null,
    presentation_labels: Array.isArray(film.presentation_labels)
      ? film.presentation_labels
      : [],
    year_interpretation: film.year_interpretation ?? null,
    year_hint: film.year_hint ?? null,
    runtime_min: film.runtime_min ?? null,
    directors_raw: film.directors_raw ?? null,
    proposed_tmdb_id: proposed?.tmdb_id ?? film.tmdb_id ?? null,
    top_candidate_margin: film.top_candidate_margin ?? null,
    auto_confirm_blocked_reason: film.auto_confirm_blocked_reason ?? null,
    warnings: Array.isArray(film.warnings) ? film.warnings : [],
    candidates,
  };
}

/**
 * @param {{
 *   identity: {
 *     rawTitle?: string | null,
 *     displayTitle?: string | null,
 *     theaters?: string[] | null,
 *     runtimeMin?: number | null,
 *     canonicalFilmId?: string | null,
 *     source?: string | null,
 *     sourceFilmId?: string | null,
 *     showtimeFilmKey?: string | null,
 *     sourceIdentityKey?: string | null,
 *   },
 *   decision: string,
 *   selectedTmdb?: {
 *     tmdbId?: number | null,
 *     title?: string | null,
 *     originalTitle?: string | null,
 *     year?: number | null,
 *     runtimeMin?: number | null,
 *     overview?: string | null,
 *     posterUrl?: string | null,
 *     selectionMethod?: string | null,
 *     candidateRank?: number | null,
 *   } | null,
 *   matcherContext?: object | null,
 *   reviewedAt?: string | null,
 * }} args
 */
export function buildReviewDecisionSnapshot({
  identity,
  decision,
  selectedTmdb = null,
  matcherContext = null,
  reviewedAt = null,
}) {
  const selectedId =
    typeof selectedTmdb?.tmdbId === 'number' && selectedTmdb.tmdbId >= 1
      ? selectedTmdb.tmdbId
      : null;
  const context =
    matcherContext && typeof matcherContext === 'object' ? matcherContext : null;
  const candidates = Array.isArray(context?.candidates)
    ? context.candidates
    : [];
  let selectedRank =
    typeof selectedTmdb?.candidateRank === 'number'
      ? selectedTmdb.candidateRank
      : null;
  if (selectedRank == null && selectedId != null) {
    const hit = candidates.find((row) => row?.tmdb_id === selectedId);
    selectedRank = hit?.rank ?? null;
  }

  const snapshot = {
    snapshot_version: REVIEW_SNAPSHOT_VERSION,
    raw_title: identity?.rawTitle ?? null,
    display_title: identity?.displayTitle ?? null,
    search_title: context?.search_title ?? context?.normalized_title ?? null,
    presentation_labels: Array.isArray(context?.presentation_labels)
      ? context.presentation_labels
      : [],
    year_interpretation: context?.year_interpretation ?? null,
    theaters: Array.isArray(identity?.theaters) ? identity.theaters : [],
    runtime_min: identity?.runtimeMin ?? context?.runtime_min ?? null,
    canonical_film_id: identity?.canonicalFilmId ?? null,
    source: identity?.source ?? null,
    source_film_id: identity?.sourceFilmId ?? null,
    showtime_film_key: identity?.showtimeFilmKey ?? null,
    source_identity_key: identity?.sourceIdentityKey ?? null,
    decision,
    pre_review_match_status: context?.match_status ?? null,
    proposed_tmdb_id: context?.proposed_tmdb_id ?? null,
    match_confidence: context?.match_confidence ?? null,
    top_candidate_margin: context?.top_candidate_margin ?? null,
    auto_confirm_blocked_reason: context?.auto_confirm_blocked_reason ?? null,
    candidates,
    selected_tmdb_id: selectedId,
    selected_tmdb_title: selectedTmdb?.title ?? null,
    selected_tmdb_original_title: selectedTmdb?.originalTitle ?? null,
    selected_tmdb_release_year: selectedTmdb?.year ?? null,
    selected_tmdb_runtime_min: selectedTmdb?.runtimeMin ?? null,
    selected_tmdb_overview_excerpt: selectedTmdb?.overview
      ? String(selectedTmdb.overview).slice(0, 280)
      : null,
    selected_candidate_rank: selectedRank,
    selection_method: selectedTmdb?.selectionMethod ?? null,
    reviewed_at: reviewedAt ?? new Date().toISOString(),
  };
  if (context) {
    snapshot.matcher_context = context;
  }
  return snapshot;
}

/**
 * Infer how the admin selected the TMDB id.
 * @param {{
 *   selectedTmdbId?: number | null,
 *   canonicalFilmId?: string | null,
 *   proposedTmdbId?: number | null,
 *   fromManualSearch?: boolean,
 *   fromMatcherCandidate?: boolean,
 * }} args
 */
export function inferSelectionMethod({
  selectedTmdbId,
  canonicalFilmId,
  proposedTmdbId = null,
  fromManualSearch = false,
  fromMatcherCandidate = false,
}) {
  if (fromManualSearch) return SELECTION_METHODS.manualSearch;
  if (typeof selectedTmdbId !== 'number' || selectedTmdbId < 1) return null;
  const match = /^tmdb:([1-9][0-9]*)$/.exec(String(canonicalFilmId || '').trim());
  if (match && Number(match[1]) === selectedTmdbId) {
    return SELECTION_METHODS.confirmExistingCanonical;
  }
  if (fromMatcherCandidate) {
    if (
      typeof proposedTmdbId === 'number' &&
      proposedTmdbId >= 1 &&
      proposedTmdbId === selectedTmdbId
    ) {
      return SELECTION_METHODS.proposedCandidate;
    }
    return SELECTION_METHODS.alternateCandidate;
  }
  return SELECTION_METHODS.manualSearch;
}
