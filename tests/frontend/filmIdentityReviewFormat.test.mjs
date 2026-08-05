import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDecisionPayload,
  candidateRoleLabel,
  copyTmdbRequestText,
  filterReviewRecords,
  formatTitleTransform,
  sortReviewRecords,
} from '../../cockpit/filmIdentityReviewFormat.js';

const sample = [
  {
    record_id: 'a',
    review_modes: ['unmatched'],
    source: {
      source_name: 'amc',
      sources: ['amc'],
      venues: ['Pacific Place'],
      match_status: 'unmatched',
      original_source_title: 'Zebra',
      showtime_film_key: 'a',
      source_film_id: '1',
    },
    sort_keys: {
      showtime_count: 2,
      venue_count: 1,
      best_score: 0.4,
      distance_to_auto_confirm: -0.52,
      missing_year: true,
      missing_runtime: false,
      has_qualifier: false,
      likely_non_film: false,
      current_window: true,
      discovery_surface: false,
    },
  },
  {
    record_id: 'b',
    review_modes: ['unmatched', 'source_only_identity'],
    source: {
      source_name: 'nwff',
      sources: ['nwff'],
      venues: ['NWFF'],
      match_status: 'unmatched',
      original_source_title: 'Alpha',
      showtime_film_key: 'b',
      source_film_id: '2',
    },
    sort_keys: {
      showtime_count: 9,
      venue_count: 1,
      best_score: 0.7,
      distance_to_auto_confirm: -0.22,
      missing_year: false,
      missing_runtime: true,
      has_qualifier: true,
      likely_non_film: false,
      current_window: true,
      discovery_surface: true,
    },
  },
];

test('filter and default impact sort prioritize showtimes', () => {
  const filtered = filterReviewRecords(sample, { mode: 'unmatched' });
  const sorted = sortReviewRecords(filtered, 'impact');
  assert.equal(sorted[0].record_id, 'b');
});

test('decorated title transform display', () => {
  const formatted = formatTitleTransform({
    original_title: 'Spider-Man: Brand New Day: Sensory Friendly Screening',
    normalized_search_title: 'Spider-Man: Brand New Day',
    changed: true,
    removed_segments: ['Sensory Friendly Screening'],
    display:
      'Spider-Man: Brand New Day: Sensory Friendly Screening → Spider-Man: Brand New Day',
  });
  assert.equal(formatted.changed, true);
  assert.deepEqual(formatted.removed, ['Sensory Friendly Screening']);
});

test('copy request text omits secrets fields', () => {
  const text = copyTmdbRequestText({
    endpoint: '/search/movie',
    query: 'One Night Only',
    year: 2026,
    include_year_parameter: true,
    language: 'en-US',
    region: null,
    page: 1,
    from_cache: false,
    alternate_title_lookup: false,
    status: 'success',
    follow_up_detail_requests: [{ endpoint: '/movie/1433367', append_to_response: 'credits' }],
  });
  assert.match(text, /One Night Only/);
  assert.doesNotMatch(text, /Bearer|api_key|Authorization/i);
});

test('decision payload for confirm', () => {
  const payload = buildDecisionPayload(sample[1], 'confirm_selected', 1433367);
  assert.equal(payload.decision, 'confirm');
  assert.equal(payload.tmdb_id, 1433367);
  assert.equal(payload.source_identity.showtime_film_key, 'b');
});

test('candidate role labels', () => {
  assert.equal(candidateRoleLabel('winning'), 'Winning / proposed');
  assert.equal(candidateRoleLabel('scored_rejected'), 'Scored but rejected');
});
