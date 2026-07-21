import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORBIDDEN_REASON_LABELS,
  LIMITED_SHOWTIME_MAX,
  SELECTION_REASON_CODES,
  SELECTION_REASON_LABELS,
  TOP_OPPORTUNITIES_DEFAULT_MAX,
  TOP_OPPORTUNITIES_HARD_MAX,
  assignPrimaryReasonCode,
  canGoNext,
  canGoPrevious,
  clampSelectionIndex,
  isSelectableCandidate,
  selectTopOpportunities,
} from '../../v2/adapters/selectTopOpportunities.js';
import {
  buildAdditionalListingsLabel,
  buildPositionLabel,
  formatLocalDateLabel,
} from '../../v2/topOpportunities/topOpportunityFormat.js';

function candidate(overrides = {}) {
  return {
    opportunityKey: 'opp-1',
    filmKey: 'film-a',
    title: 'Film A',
    theaterId: 'theater-1',
    theaterName: 'Theater One',
    sortableLocalDateTime: '2026-06-28T19:00',
    formatLabels: [],
    isNewlyAdded: false,
    filmShowtimeCount: 5,
    filmTheaterCount: 1,
    hasPoster: true,
    hasTicketUrl: false,
    chronologicalKey: '2026-06-28T19:00|theater-1|film-a|opp-1',
    ...overrides,
  };
}

function homeFromCandidates(candidates, extras = {}) {
  const films = [];
  const opportunities = [];
  const seenFilms = new Set();
  for (const c of candidates) {
    if (!seenFilms.has(c.filmKey)) {
      seenFilms.add(c.filmKey);
      films.push({
        filmKey: c.filmKey,
        title: c.title,
        posterUrl: c.hasPoster ? 'https://example.com/p.jpg' : null,
        runtimeMin: 100,
        showtimeCount: c.filmShowtimeCount,
        theaterCount: c.filmTheaterCount,
      });
    }
    opportunities.push({
      opportunityKey: c.opportunityKey,
      filmKey: c.filmKey,
      theaterId: c.theaterId,
      theaterName: c.theaterName,
      sortableLocalDateTime: c.sortableLocalDateTime,
      localDate: c.sortableLocalDateTime.slice(0, 10),
      localTime: c.sortableLocalDateTime.slice(11, 16),
      timeDisplay: '7:00 PM',
      formatLabels: c.formatLabels,
      ticketUrl: c.hasTicketUrl ? 'https://example.com/t' : null,
    });
  }
  return {
    films,
    opportunities,
    opportunityCandidates: candidates,
    ...extras,
  };
}

test('selector returns no more than configured maximum and hard ceiling', () => {
  const candidates = Array.from({ length: 8 }, (_, i) =>
    candidate({
      opportunityKey: `opp-${i}`,
      filmKey: `film-${i}`,
      title: `Film ${i}`,
      chronologicalKey: `2026-06-2${i}T19:00|theater-1|film-${i}|opp-${i}`,
      sortableLocalDateTime: `2026-06-2${i}T19:00`,
    }),
  );
  const def = selectTopOpportunities(homeFromCandidates(candidates));
  assert.equal(def.length, TOP_OPPORTUNITIES_DEFAULT_MAX);
  const capped = selectTopOpportunities(homeFromCandidates(candidates), {
    max: 10,
  });
  assert.equal(capped.length, TOP_OPPORTUNITIES_HARD_MAX);
});

test('selector does not select the same film more than once', () => {
  const candidates = [
    candidate({
      opportunityKey: 'a1',
      filmKey: 'same',
      title: 'Same',
      chronologicalKey: '2026-06-28T10:00|t1|same|a1',
      sortableLocalDateTime: '2026-06-28T10:00',
    }),
    candidate({
      opportunityKey: 'a2',
      filmKey: 'same',
      title: 'Same',
      chronologicalKey: '2026-06-28T20:00|t1|same|a2',
      sortableLocalDateTime: '2026-06-28T20:00',
      theaterId: 'theater-2',
      theaterName: 'Theater Two',
    }),
    candidate({
      opportunityKey: 'b1',
      filmKey: 'other',
      title: 'Other',
      chronologicalKey: '2026-06-29T19:00|t1|other|b1',
      sortableLocalDateTime: '2026-06-29T19:00',
    }),
  ];
  const selected = selectTopOpportunities(homeFromCandidates(candidates), {
    max: 3,
  });
  const keys = selected.map((item) => item.film.filmKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.filter((key) => key === 'same').length, 1);
  assert.equal(
    selected.find((item) => item.film.filmKey === 'same').representativeOpportunity
      .opportunityKey,
    'a1',
  );
});

test('ordering is deterministic across repeated runs', () => {
  const candidates = [
    candidate({
      opportunityKey: 'n1',
      filmKey: 'new',
      title: 'New Film',
      isNewlyAdded: true,
      chronologicalKey: '2026-06-30T19:00|t1|new|n1',
      sortableLocalDateTime: '2026-06-30T19:00',
    }),
    candidate({
      opportunityKey: 'f1',
      filmKey: 'imax',
      title: 'IMAX Film',
      formatLabels: ['IMAX'],
      chronologicalKey: '2026-06-29T19:00|t2|imax|f1',
      sortableLocalDateTime: '2026-06-29T19:00',
      theaterId: 'theater-2',
      theaterName: 'Theater Two',
    }),
    candidate({
      opportunityKey: 'l1',
      filmKey: 'scarce',
      title: 'Scarce',
      filmShowtimeCount: 1,
      chronologicalKey: '2026-06-28T19:00|t3|scarce|l1',
      sortableLocalDateTime: '2026-06-28T19:00',
      theaterId: 'theater-3',
      theaterName: 'Theater Three',
    }),
  ];
  const home = homeFromCandidates(candidates);
  const a = selectTopOpportunities(home);
  const b = selectTopOpportunities(home);
  assert.deepEqual(
    a.map((item) => item.film.filmKey),
    b.map((item) => item.film.filmKey),
  );
  assert.deepEqual(
    a.map((item) => item.film.filmKey),
    ['new', 'imax', 'scarce'],
  );
});

test('newly-added inclusion prefers one newly-added film', () => {
  const candidates = [
    candidate({
      opportunityKey: 'c1',
      filmKey: 'chron',
      title: 'Chron First',
      chronologicalKey: '2026-06-27T10:00|t1|chron|c1',
      sortableLocalDateTime: '2026-06-27T10:00',
    }),
    candidate({
      opportunityKey: 'n1',
      filmKey: 'new',
      title: 'Newly',
      isNewlyAdded: true,
      chronologicalKey: '2026-06-29T19:00|t1|new|n1',
      sortableLocalDateTime: '2026-06-29T19:00',
    }),
  ];
  const selected = selectTopOpportunities(homeFromCandidates(candidates), {
    max: 1,
  });
  assert.equal(selected[0].film.filmKey, 'new');
  assert.equal(selected[0].selectionReasonCode, SELECTION_REASON_CODES.newly_added);
  assert.equal(selected[0].selectionReasonLabel, 'Newly added');
});

test('mechanical scarcity uses limited current listings language', () => {
  const candidates = [
    candidate({
      opportunityKey: 'l1',
      filmKey: 'scarce',
      title: 'Scarce',
      filmShowtimeCount: LIMITED_SHOWTIME_MAX,
      chronologicalKey: '2026-06-28T19:00|t1|scarce|l1',
      sortableLocalDateTime: '2026-06-28T19:00',
    }),
  ];
  const selected = selectTopOpportunities(homeFromCandidates(candidates));
  assert.equal(selected[0].selectionReasonCode, SELECTION_REASON_CODES.limited_listings);
  assert.equal(selected[0].selectionReasonLabel, 'Limited current listings');
  assert.match(selected[0].supportingFacts.listingCountLabel, /current showtimes?/);
  assert.equal(selected[0].supportingFacts.limitedShowtimeThreshold, LIMITED_SHOWTIME_MAX);
});

test('stable fallback ordering uses chronology', () => {
  const candidates = [
    candidate({
      opportunityKey: 'b',
      filmKey: 'b',
      title: 'B',
      chronologicalKey: '2026-06-29T19:00|t1|b|b',
      sortableLocalDateTime: '2026-06-29T19:00',
    }),
    candidate({
      opportunityKey: 'a',
      filmKey: 'a',
      title: 'A',
      chronologicalKey: '2026-06-28T19:00|t1|a|a',
      sortableLocalDateTime: '2026-06-28T19:00',
    }),
  ];
  const selected = selectTopOpportunities(homeFromCandidates(candidates));
  assert.equal(selected[0].film.filmKey, 'a');
  assert.equal(selected[0].selectionReasonLabel, 'Showing soon');
});

test('invalid candidates are excluded', () => {
  const candidates = [
    candidate({ title: '' }),
    candidate({
      opportunityKey: 'ok',
      filmKey: 'ok',
      title: 'OK',
      chronologicalKey: '2026-06-28T19:00|t1|ok|ok',
    }),
    candidate({
      opportunityKey: 'unk',
      filmKey: 'unk',
      title: 'Unknown Theater Film',
      theaterName: 'Unknown theater',
      chronologicalKey: '2026-06-27T19:00|t1|unk|unk',
    }),
  ];
  assert.equal(isSelectableCandidate(candidates[0]), false);
  assert.equal(isSelectableCandidate(candidates[2]), false);
  const selected = selectTopOpportunities(homeFromCandidates(candidates));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].film.filmKey, 'ok');
});

test('missing poster does not exclude an otherwise valid candidate', () => {
  const candidates = [
    candidate({
      hasPoster: false,
      filmKey: 'noposter',
      title: 'No Poster',
      opportunityKey: 'np',
      chronologicalKey: '2026-06-28T19:00|t1|noposter|np',
    }),
  ];
  const selected = selectTopOpportunities(homeFromCandidates(candidates));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].film.posterUrl, null);
});

test('reason codes match supporting data and forbid editorial labels', () => {
  assert.equal(
    assignPrimaryReasonCode(candidate({ isNewlyAdded: true })),
    SELECTION_REASON_CODES.newly_added,
  );
  assert.equal(
    assignPrimaryReasonCode(candidate({ formatLabels: ['Dolby Cinema'] })),
    SELECTION_REASON_CODES.special_format,
  );
  assert.equal(
    assignPrimaryReasonCode(candidate({ filmShowtimeCount: 1 })),
    SELECTION_REASON_CODES.limited_listings,
  );
  assert.equal(
    assignPrimaryReasonCode(candidate({ filmTheaterCount: 3 })),
    SELECTION_REASON_CODES.multiple_theaters,
  );
  assert.equal(assignPrimaryReasonCode(candidate()), SELECTION_REASON_CODES.showing_soon);

  for (const label of Object.values(SELECTION_REASON_LABELS)) {
    assert.equal(FORBIDDEN_REASON_LABELS.includes(label), false);
  }

  const selected = selectTopOpportunities(
    homeFromCandidates([
      candidate({
        filmKey: 'x',
        title: 'X',
        opportunityKey: 'x',
        chronologicalKey: '2026-06-28T19:00|t1|x|x',
        filmTheaterCount: 3,
      }),
    ]),
  );
  assert.equal(selected[0].selectionReasonLabel, 'Available at multiple theaters');
  assert.equal('recommendationScore' in selected[0], false);
  assert.equal('importance' in selected[0], false);
  assert.equal('urgency' in selected[0], false);
});

test('empty candidates return empty selection', () => {
  assert.deepEqual(selectTopOpportunities(homeFromCandidates([])), []);
  assert.deepEqual(selectTopOpportunities(null), []);
});

test('one-candidate behavior works', () => {
  const selected = selectTopOpportunities(
    homeFromCandidates([
      candidate({
        filmKey: 'only',
        title: 'Only',
        opportunityKey: 'only',
        chronologicalKey: '2026-06-28T19:00|t1|only|only',
      }),
    ]),
  );
  assert.equal(selected.length, 1);
  assert.equal(canGoPrevious(0, 1), false);
  assert.equal(canGoNext(0, 1), false);
});

test('theater diversity preferred on chronological ties when filling', () => {
  const candidates = [
    candidate({
      opportunityKey: 'n1',
      filmKey: 'new',
      title: 'New',
      isNewlyAdded: true,
      theaterId: 'theater-1',
      theaterName: 'Theater One',
      chronologicalKey: '2026-06-28T12:00|theater-1|new|n1',
      sortableLocalDateTime: '2026-06-28T12:00',
    }),
    candidate({
      opportunityKey: 'a',
      filmKey: 'a',
      title: 'A',
      theaterId: 'theater-1',
      theaterName: 'Theater One',
      chronologicalKey: '2026-06-29T19:00|theater-1|a|a',
      sortableLocalDateTime: '2026-06-29T19:00',
    }),
    candidate({
      opportunityKey: 'b',
      filmKey: 'b',
      title: 'B',
      theaterId: 'theater-2',
      theaterName: 'Theater Two',
      chronologicalKey: '2026-06-29T19:00|theater-2|b|b',
      sortableLocalDateTime: '2026-06-29T19:00',
    }),
  ];
  const selected = selectTopOpportunities(homeFromCandidates(candidates), {
    max: 2,
  });
  assert.equal(selected[0].film.filmKey, 'new');
  assert.equal(selected[1].film.filmKey, 'b');
});

test('navigation helpers clamp and bound previous/next', () => {
  assert.equal(clampSelectionIndex(-1, 3), 0);
  assert.equal(clampSelectionIndex(9, 3), 2);
  assert.equal(canGoPrevious(0, 3), false);
  assert.equal(canGoPrevious(1, 3), true);
  assert.equal(canGoNext(2, 3), false);
  assert.equal(canGoNext(1, 3), true);
  assert.equal(buildPositionLabel(0, 3), '1 of 3');
  assert.equal(buildPositionLabel(0, 0), 'No featured opportunities');
});

test('format helpers stay factual', () => {
  assert.equal(formatLocalDateLabel('2026-06-28'), 'Sun, Jun 28');
  assert.equal(formatLocalDateLabel('bad'), null);
  assert.equal(
    buildAdditionalListingsLabel({
      additionalShowtimeCount: 4,
      film: { theaterCount: 2 },
    }),
    '4 more showtimes · At 2 theaters',
  );
  assert.equal(
    buildAdditionalListingsLabel({
      additionalShowtimeCount: 0,
      film: { theaterCount: 1 },
    }),
    null,
  );
  assert.equal(
    buildAdditionalListingsLabel({
      additionalShowtimeCount: 900,
      film: { theaterCount: 3 },
    }),
    'Multiple showtimes · At 3 theaters',
  );
});

test('special format reason uses format labels', () => {
  const selected = selectTopOpportunities(
    homeFromCandidates([
      candidate({
        filmKey: 'imax',
        title: 'IMAX Night',
        opportunityKey: 'imax',
        formatLabels: ['IMAX'],
        chronologicalKey: '2026-06-28T19:00|t1|imax|imax',
      }),
    ]),
  );
  assert.equal(selected[0].selectionReasonCode, SELECTION_REASON_CODES.special_format);
  assert.equal(selected[0].selectionReasonLabel, 'Special format');
  assert.equal(selected[0].supportingFacts.formatLabel, 'IMAX');
});
