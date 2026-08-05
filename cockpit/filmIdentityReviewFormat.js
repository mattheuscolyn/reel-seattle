/**
 * Pure helpers for Film Identity Review cockpit (no network).
 */

export const REVIEW_MODES = [
  { id: 'unmatched', label: 'Unmatched' },
  { id: 'ambiguous', label: 'Ambiguous' },
  { id: 'probable_review', label: 'Probable / review' },
  { id: 'source_only_identity', label: 'Source-only identity' },
  { id: 'confirmed_thin_enrichment', label: 'Confirmed, thin enrichment' },
  { id: 'non_film', label: 'Non-film / program' },
  { id: 'all', label: 'All reviewable' },
];

export const SORT_OPTIONS = [
  { id: 'impact', label: 'High impact (default)' },
  { id: 'showtimes', label: 'Showtimes' },
  { id: 'venues', label: 'Venues' },
  { id: 'best_score', label: 'Highest candidate score' },
  { id: 'distance_auto', label: 'Closest to auto-confirm' },
  { id: 'title', label: 'Title' },
];

export function filterReviewRecords(records, filters) {
  const mode = filters.mode || 'unmatched';
  const source = (filters.source || '').trim().toLowerCase();
  const venue = (filters.venue || '').trim().toLowerCase();
  const status = (filters.matchStatus || '').trim().toLowerCase();
  const missingYear = Boolean(filters.missingYear);
  const missingRuntime = Boolean(filters.missingRuntime);
  const hasQualifier = Boolean(filters.hasQualifier);
  const likelyNonFilm = Boolean(filters.likelyNonFilm);
  const currentWindow = filters.currentWindow !== false;

  return (records || []).filter((row) => {
    const modes = row.review_modes || [];
    if (mode !== 'all' && !modes.includes(mode)) return false;
    const src = row.source || {};
    const sort = row.sort_keys || {};
    if (source) {
      const names = [src.source_name, ...(src.sources || [])].map((x) =>
        String(x || '').toLowerCase(),
      );
      if (!names.some((n) => n.includes(source))) return false;
    }
    if (venue) {
      const venues = (src.venues || []).map((v) => String(v || '').toLowerCase());
      if (!venues.some((v) => v.includes(venue))) return false;
    }
    if (status && String(src.match_status || '').toLowerCase() !== status) return false;
    if (missingYear && !sort.missing_year) return false;
    if (missingRuntime && !sort.missing_runtime) return false;
    if (hasQualifier && !sort.has_qualifier) return false;
    if (likelyNonFilm && !sort.likely_non_film) return false;
    if (currentWindow && sort.current_window === false) return false;
    return true;
  });
}

export function sortReviewRecords(records, sortId = 'impact') {
  const rows = [...(records || [])];
  const titleOf = (r) => String(r?.source?.original_source_title || r?.record_id || '');
  rows.sort((a, b) => {
    const sa = a.sort_keys || {};
    const sb = b.sort_keys || {};
    if (sortId === 'showtimes') {
      return (sb.showtime_count || 0) - (sa.showtime_count || 0) || titleOf(a).localeCompare(titleOf(b));
    }
    if (sortId === 'venues') {
      return (sb.venue_count || 0) - (sa.venue_count || 0) || titleOf(a).localeCompare(titleOf(b));
    }
    if (sortId === 'best_score') {
      return (sb.best_score || -1) - (sa.best_score || -1) || titleOf(a).localeCompare(titleOf(b));
    }
    if (sortId === 'distance_auto') {
      const da =
        sa.distance_to_auto_confirm == null ? Number.POSITIVE_INFINITY : Math.abs(sa.distance_to_auto_confirm);
      const db =
        sb.distance_to_auto_confirm == null ? Number.POSITIVE_INFINITY : Math.abs(sb.distance_to_auto_confirm);
      return da - db || titleOf(a).localeCompare(titleOf(b));
    }
    if (sortId === 'title') {
      return titleOf(a).localeCompare(titleOf(b));
    }
    // impact default
    return (
      (sb.showtime_count || 0) - (sa.showtime_count || 0) ||
      (sb.venue_count || 0) - (sa.venue_count || 0) ||
      (sb.best_score || -1) - (sa.best_score || -1) ||
      Number(sb.discovery_surface) - Number(sa.discovery_surface) ||
      titleOf(a).localeCompare(titleOf(b))
    );
  });
  return rows;
}

export function formatTitleTransform(transform) {
  if (!transform) return { display: '—', removed: [] };
  return {
    display: transform.display || transform.original_title || '—',
    removed: transform.removed_segments || [],
    changed: Boolean(transform.changed),
    original: transform.original_title,
    normalized: transform.normalized_search_title,
  };
}

export function copyTmdbRequestText(request) {
  if (!request) return '';
  const lines = [
    `endpoint: ${request.endpoint}`,
    `query: ${request.query}`,
    `year: ${request.year ?? '(none)'}`,
    `include_year_parameter: ${request.include_year_parameter}`,
    `language: ${request.language}`,
    `region: ${request.region ?? '(none)'}`,
    `page: ${request.page}`,
    `from_cache: ${request.from_cache}`,
    `alternate_title_lookup: ${request.alternate_title_lookup}`,
    `status: ${request.status}`,
  ];
  for (const follow of request.follow_up_detail_requests || []) {
    lines.push(`detail: ${follow.endpoint} append=${follow.append_to_response}`);
  }
  return lines.join('\n');
}

export function candidateRoleLabel(role) {
  if (role === 'winning') return 'Winning / proposed';
  if (role === 'runner_up') return 'Runner-up';
  if (role === 'search_result') return 'Search result';
  if (role === 'detail_enriched') return 'Detail-enriched';
  if (role === 'excluded') return 'Excluded before scoring';
  if (role === 'scored_rejected') return 'Scored but rejected';
  return role || 'Candidate';
}

export function buildDecisionPayload(record, actionId, selectedTmdbId) {
  const src = record?.source || {};
  const source_identity = {
    source: src.source_name || (src.sources || [])[0] || 'unknown',
    source_film_id: src.source_film_id,
    showtime_film_key: src.showtime_film_key || record?.record_id,
  };
  if (actionId === 'confirm' || actionId === 'confirm_selected') {
    const tmdbId = Number(selectedTmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId < 1) {
      throw new Error('Select a TMDB candidate to confirm');
    }
    return {
      source_identity,
      decision: 'confirm',
      tmdb_id: tmdbId,
      reason: 'manual-review',
    };
  }
  if (actionId === 'unmapped') {
    return { source_identity, decision: 'unmapped', tmdb_id: null, reason: 'manual-review' };
  }
  if (actionId === 'non_film') {
    return { source_identity, decision: 'non_film', tmdb_id: null, reason: 'manual-review' };
  }
  if (actionId === 'program_block') {
    return {
      source_identity,
      decision: 'non_film',
      tmdb_id: null,
      reason: 'program-or-festival-block',
    };
  }
  if (actionId === 'defer') {
    return { source_identity, decision: 'defer', tmdb_id: null, reason: 'manual-review' };
  }
  throw new Error(`Unknown action ${actionId}`);
}
