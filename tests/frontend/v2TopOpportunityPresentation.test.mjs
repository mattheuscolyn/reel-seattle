import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpportunityStageMedia } from '../../v2/topOpportunities/opportunityStageMedia.js';
import {
  buildAdditionalListingsLabel,
  buildPositionLabel,
  buildShowingContextLabel,
  buildSupportingFactsLabel,
  canGoNext,
  canGoPrevious,
} from '../../v2/topOpportunities/topOpportunityFormat.js';
import {
  SELECTION_REASON_LABELS,
  selectTopOpportunities,
} from '../../v2/adapters/selectTopOpportunities.js';

function selectionFixture(overrides = {}) {
  return {
    film: {
      filmKey: 'film-a',
      title: 'Film A',
      posterUrl: 'https://example.com/poster.jpg',
      runtimeMin: 120,
      theaterCount: 2,
      showtimeCount: 5,
      ...overrides.film,
    },
    representativeOpportunity: {
      opportunityKey: 'opp-1',
      theaterName: 'AMC Pacific Place 11',
      localDate: '2026-06-28',
      timeDisplay: '10:00 AM',
      formatLabels: ['IMAX'],
      ticketUrl: null,
      ...overrides.opportunity,
    },
    selectionReasonLabel: SELECTION_REASON_LABELS.newly_added,
    additionalShowtimeCount: 4,
    ...overrides,
  };
}

test('stage media prefers backdropUrl when provided for future TMDB use', () => {
  assert.deepEqual(
    resolveOpportunityStageMedia({
      backdropUrl: 'https://example.com/backdrop.jpg',
      posterUrl: 'https://example.com/poster.jpg',
    }),
    { kind: 'backdrop', url: 'https://example.com/backdrop.jpg' },
  );
});

test('stage media uses poster without distortion metadata when no backdrop', () => {
  assert.deepEqual(
    resolveOpportunityStageMedia({
      posterUrl: 'https://example.com/poster.jpg',
    }),
    { kind: 'poster', url: 'https://example.com/poster.jpg' },
  );
});

test('stage media falls back without fabricating artwork', () => {
  assert.deepEqual(resolveOpportunityStageMedia({}), {
    kind: 'fallback',
    url: null,
  });
  assert.deepEqual(
    resolveOpportunityStageMedia({ posterUrl: '  ', backdropUrl: null }),
    { kind: 'fallback', url: null },
  );
});

test('showing context reads as natural prose without admin headings', () => {
  const label = buildShowingContextLabel(selectionFixture());
  assert.equal(label, 'AMC Pacific Place 11 · Sun, Jun 28 · 10:00 AM');
  assert.equal(label.includes('THEATER'), false);
  assert.equal(label.includes('SHOWING'), false);
});

test('supporting facts include runtime and format; genre only when present', () => {
  assert.equal(
    buildSupportingFactsLabel(selectionFixture()),
    '120 min · IMAX',
  );
  assert.equal(
    buildSupportingFactsLabel(
      selectionFixture({ film: { genre: 'Drama', runtimeMin: 145 } }),
    ),
    '145 min · Drama · IMAX',
  );
  assert.equal(
    buildSupportingFactsLabel(
      selectionFixture({
        film: { runtimeMin: null },
        opportunity: { formatLabels: [] },
      }),
    ),
    null,
  );
});

test('runtime omitted when unavailable; genre never inferred', () => {
  const noRuntime = buildSupportingFactsLabel(
    selectionFixture({
      film: { runtimeMin: undefined, genre: undefined },
      opportunity: { formatLabels: [] },
    }),
  );
  assert.equal(noRuntime, null);
});

test('position and bounded navigation helpers remain correct', () => {
  assert.equal(buildPositionLabel(0, 3), '1 of 3');
  assert.equal(canGoPrevious(0, 3), false);
  assert.equal(canGoNext(0, 3), true);
  assert.equal(canGoNext(2, 3), false);
  assert.equal(canGoPrevious(0, 1), false);
  assert.equal(canGoNext(0, 1), false);
});

test('additional listings label stays factual', () => {
  assert.equal(
    buildAdditionalListingsLabel(selectionFixture()),
    '4 more showtimes · 2 theaters',
  );
});

test('selector output still drives first visible item fields', () => {
  const home = {
    films: [
      {
        filmKey: 'a',
        title: 'Alpha',
        posterUrl: null,
        runtimeMin: null,
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'a',
        theaterId: 't1',
        theaterName: 'Theater One',
        sortableLocalDateTime: '2026-06-28T19:00',
        localDate: '2026-06-28',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        formatLabels: [],
        ticketUrl: null,
      },
    ],
    opportunityCandidates: [
      {
        opportunityKey: 'o1',
        filmKey: 'a',
        title: 'Alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        sortableLocalDateTime: '2026-06-28T19:00',
        formatLabels: [],
        isNewlyAdded: false,
        filmShowtimeCount: 1,
        filmTheaterCount: 1,
        hasPoster: false,
        hasTicketUrl: false,
        chronologicalKey: '2026-06-28T19:00|t1|a|o1',
      },
    ],
  };
  const selected = selectTopOpportunities(home);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].film.title, 'Alpha');
  assert.equal(selected[0].film.posterUrl, null);
  assert.equal(
    buildShowingContextLabel(selected[0]),
    'Theater One · Sun, Jun 28 · 7:00 PM',
  );
});

test('primary product labels avoid implementation disclaimer language', () => {
  // Guardrail for Home copy: these strings must not return as selection reasons.
  for (const label of Object.values(SELECTION_REASON_LABELS)) {
    assert.equal(label.includes('mechanical rules'), false);
    assert.equal(label.includes('personal taste'), false);
  }
});
