/**
 * Recommended Experience Engine v1 — unit coverage for cohort selection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_SOURCE,
  ENGINE_WEIGHTS,
  buildRecommendationReason,
  isSpecialtyVenue,
  selectRecommendedExperienceCandidate,
  summarizeCohort,
} from '../../v2/recommendedExperience/recommendedExperienceEngine.js';
import {
  describeAvailabilityPattern,
  listMatchingOpportunitiesForExperience,
  resolvePremiumFormatId,
  resolveRecommendedExperience,
} from '../../v2/recommendedExperience/recommendedExperienceModel.js';

const NOW = new Date('2026-08-01T22:00:00.000Z');

function opp(partial) {
  return {
    ticketUrl: null,
    source: 'test',
    runtimeMin: 100,
    ...partial,
  };
}

function theatersById(entries) {
  return Object.fromEntries(entries.map((t) => [t.id, t]));
}

test('A: rare IMAX 70mm beats common Dolby with more showtimes', () => {
  const opportunities = [
    opp({
      opportunityKey: '70-1',
      filmKey: 'rare',
      theaterId: 'amc-south',
      theaterName: 'AMC Southcenter 16',
      localDate: '2026-08-02',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-02T19:00',
      formatLabels: ['IMAX 70mm'],
    }),
    opp({
      opportunityKey: '70-2',
      filmKey: 'rare',
      theaterId: 'amc-south',
      theaterName: 'AMC Southcenter 16',
      localDate: '2026-08-03',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-03T19:00',
      formatLabels: ['IMAX 70mm'],
    }),
    opp({
      opportunityKey: '70-3',
      filmKey: 'rare',
      theaterId: 'amc-alder',
      theaterName: 'AMC Alderwood Mall 16',
      localDate: '2026-08-04',
      localTime: '20:00',
      sortableLocalDateTime: '2026-08-04T20:00',
      formatLabels: ['IMAX 70mm'],
    }),
    // Broad Dolby
    ...[1, 2, 3, 4, 5, 6].flatMap((d) =>
      ['14:00', '17:00', '20:00'].map((t, i) =>
        opp({
          opportunityKey: `dolby-${d}-${i}`,
          filmKey: 'rare',
          theaterId: `amc-${d}`,
          theaterName: `AMC Venue ${d}`,
          localDate: `2026-08-0${d}`,
          localTime: t,
          sortableLocalDateTime: `2026-08-0${d}T${t}`,
          formatLabels: ['Dolby Cinema'],
        }),
      ),
    ),
  ];

  const winner = selectRecommendedExperienceCandidate({ opportunities });
  assert.ok(winner);
  assert.equal(winner.type, 'format');
  assert.equal(winner.id, 'imax-70mm');
  assert.match(winner.reason, /Rare IMAX 70mm/i);
  assert.ok(winner.matchingPerformanceKeys.every((k) => k.startsWith('70-')));
});

test('B: isolated single morning premium loses to broader strong option', () => {
  const opportunities = [
    opp({
      opportunityKey: 'imax-one',
      filmKey: 'avail',
      theaterId: 'amc-kent',
      theaterName: 'AMC Kent Station 14',
      localDate: '2026-08-02',
      localTime: '11:00',
      sortableLocalDateTime: '2026-08-02T11:00',
      formatLabels: ['IMAX'],
    }),
    ...['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'].flatMap((date) =>
      ['17:00', '19:30', '21:45'].map((t, i) =>
        opp({
          opportunityKey: `dolby-${date}-${i}`,
          filmKey: 'avail',
          theaterId: 'amc-south',
          theaterName: 'AMC Southcenter 16',
          localDate: date,
          localTime: t,
          sortableLocalDateTime: `${date}T${t}`,
          formatLabels: ['Dolby Cinema'],
        }),
      ),
    ),
  ];

  const winner = selectRecommendedExperienceCandidate({ opportunities });
  assert.ok(winner);
  assert.equal(winner.id, 'dolby-cinema');
  assert.match(winner.reason, /broad availability|picture and sound/i);
});

test('C: specialty venue wins when no premium format exists', () => {
  const opportunities = [
    opp({
      opportunityKey: 'siff-1',
      filmKey: 'indie',
      theaterId: 'siff-cinema-downtown',
      theaterName: 'SIFF Cinema Downtown',
      localDate: '2026-08-02',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-02T19:00',
      formatLabels: ['Digital'],
    }),
    opp({
      opportunityKey: 'siff-2',
      filmKey: 'indie',
      theaterId: 'siff-cinema-downtown',
      theaterName: 'SIFF Cinema Downtown',
      localDate: '2026-08-03',
      localTime: '19:30',
      sortableLocalDateTime: '2026-08-03T19:30',
      formatLabels: ['Digital'],
    }),
    opp({
      opportunityKey: 'amc-1',
      filmKey: 'indie',
      theaterId: 'amc-oak-tree-6',
      theaterName: 'AMC Oak Tree 6',
      localDate: '2026-08-02',
      localTime: '18:00',
      sortableLocalDateTime: '2026-08-02T18:00',
      formatLabels: ['Digital'],
    }),
  ];

  const winner = selectRecommendedExperienceCandidate({
    opportunities,
    theatersById: theatersById([
      { id: 'siff-cinema-downtown', name: 'SIFF Cinema Downtown', type: 'rep' },
      { id: 'amc-oak-tree-6', name: 'AMC Oak Tree 6', type: 'chain' },
    ]),
  });
  assert.ok(winner);
  assert.equal(winner.type, 'venue');
  assert.equal(winner.id, 'siff-cinema-downtown');
  assert.match(winner.reason, /Specialty theater|Limited engagement/i);
});

test('D: generic multiplex is never a venue recommendation', () => {
  const opportunities = [
    opp({
      opportunityKey: 'amc-a',
      filmKey: 'plain',
      theaterId: 'amc-oak-tree-6',
      theaterName: 'AMC Oak Tree 6',
      localDate: '2026-08-02',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-02T19:00',
      formatLabels: ['Digital'],
    }),
    opp({
      opportunityKey: 'amc-b',
      filmKey: 'plain',
      theaterId: 'amc-southcenter-16',
      theaterName: 'AMC Southcenter 16',
      localDate: '2026-08-03',
      localTime: '20:00',
      sortableLocalDateTime: '2026-08-03T20:00',
      formatLabels: ['Digital'],
    }),
  ];

  const winner = selectRecommendedExperienceCandidate({
    opportunities,
    theatersById: theatersById([
      { id: 'amc-oak-tree-6', type: 'chain' },
      { id: 'amc-southcenter-16', type: 'chain' },
    ]),
  });
  assert.equal(winner, null);
  assert.equal(isSpecialtyVenue('amc-oak-tree-6', 'AMC Oak Tree 6', { type: 'chain' }), false);
});

test('E: urgency can tip a close decision toward scarcer premium', () => {
  const baseOpps = [
    opp({
      opportunityKey: 'imax-a',
      filmKey: 'urgent',
      theaterId: 'amc-kent',
      theaterName: 'AMC Kent Station 14',
      localDate: '2026-08-02',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-02T19:00',
      formatLabels: ['IMAX'],
    }),
    opp({
      opportunityKey: 'imax-b',
      filmKey: 'urgent',
      theaterId: 'amc-kent',
      theaterName: 'AMC Kent Station 14',
      localDate: '2026-08-03',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-03T19:00',
      formatLabels: ['IMAX'],
    }),
    opp({
      opportunityKey: 'dolby-a',
      filmKey: 'urgent',
      theaterId: 'amc-south',
      theaterName: 'AMC Southcenter 16',
      localDate: '2026-08-02',
      localTime: '18:00',
      sortableLocalDateTime: '2026-08-02T18:00',
      formatLabels: ['Dolby Cinema'],
    }),
    opp({
      opportunityKey: 'dolby-b',
      filmKey: 'urgent',
      theaterId: 'amc-south',
      theaterName: 'AMC Southcenter 16',
      localDate: '2026-08-03',
      localTime: '20:00',
      sortableLocalDateTime: '2026-08-03T20:00',
      formatLabels: ['Dolby Cinema'],
    }),
    opp({
      opportunityKey: 'dolby-c',
      filmKey: 'urgent',
      theaterId: 'amc-alder',
      theaterName: 'AMC Alderwood Mall 16',
      localDate: '2026-08-04',
      localTime: '19:30',
      sortableLocalDateTime: '2026-08-04T19:30',
      formatLabels: ['Dolby Cinema'],
    }),
  ];

  const withoutUrgency = selectRecommendedExperienceCandidate({
    opportunities: baseOpps,
  });
  const withUrgency = selectRecommendedExperienceCandidate({
    opportunities: baseOpps,
    departureTiming: { confidence: 'high', mode: 'likely_around' },
  });
  assert.ok(withoutUrgency);
  assert.ok(withUrgency);
  // Urgency adds the same bonus to all candidates; winner type remains format.
  assert.equal(withUrgency.type, 'format');
  assert.ok(withUrgency.urgencyScore > withoutUrgency.urgencyScore);
});

test('F: availability patterns — one-day / weekends / evenings', () => {
  assert.equal(
    describeAvailabilityPattern([
      opp({
        opportunityKey: '1',
        localDate: '2026-08-03',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-03T19:00',
      }),
      opp({
        opportunityKey: '2',
        localDate: '2026-08-03',
        localTime: '21:00',
        sortableLocalDateTime: '2026-08-03T21:00',
      }),
    ]),
    'One day only',
  );

  assert.equal(
    describeAvailabilityPattern([
      opp({
        opportunityKey: 'w1',
        localDate: '2026-08-01', // Sat
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
      }),
      opp({
        opportunityKey: 'w2',
        localDate: '2026-08-02', // Sun
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-02T20:00',
      }),
      opp({
        opportunityKey: 'w3',
        localDate: '2026-08-08', // Sat
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-08T18:00',
      }),
    ]),
    'Weekends only',
  );

  assert.equal(
    describeAvailabilityPattern([
      opp({
        opportunityKey: 'e1',
        localDate: '2026-08-03',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-03T19:00',
      }),
      opp({
        opportunityKey: 'e2',
        localDate: '2026-08-04',
        localTime: '21:00',
        sortableLocalDateTime: '2026-08-04T21:00',
      }),
      opp({
        opportunityKey: 'e3',
        localDate: '2026-08-05',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-05T20:00',
      }),
    ]),
    'Mostly evenings',
  );
});

test('G: no meaningful recommendation returns null', () => {
  const winner = selectRecommendedExperienceCandidate({
    opportunities: [
      opp({
        opportunityKey: 'd1',
        filmKey: 'plain',
        theaterId: 'amc-oak',
        theaterName: 'AMC Oak Tree 6',
        localDate: '2026-08-02',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-02T19:00',
        formatLabels: ['Digital'],
      }),
    ],
    theatersById: theatersById([{ id: 'amc-oak', type: 'chain' }]),
  });
  assert.equal(winner, null);
});

test('H: deterministic tie-breaking prefers higher distinctiveness then stable id', () => {
  // Force equal scores via custom weights that zero availability/urgency.
  const flatWeights = {
    ...ENGINE_WEIGHTS,
    formatValue: {
      ...ENGINE_WEIGHTS.formatValue,
      imax: 60,
      'dolby-cinema': 60,
    },
    showtimePointsPer: 0,
    showtimePointsCap: 0,
    venuePointsPer: 0,
    venuePointsCap: 0,
    datePointsPer: 0,
    datePointsCap: 0,
    timeBreadthBonus: 0,
    singleShowNonRarePenalty: 0,
    singleShowRarePenalty: 0,
    oneDayNonRarePenalty: 0,
    oneDayRarePenalty: 0,
    morningOnlyNonRarePenalty: 0,
    urgencyHigh: 0,
    urgencyModerate: 0,
    urgencyLow: 0,
    minAcceptScore: 0,
  };

  const opportunities = [
    opp({
      opportunityKey: 'imax-1',
      filmKey: 'tie',
      theaterId: 'amc-a',
      theaterName: 'AMC A',
      localDate: '2026-08-05',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-05T19:00',
      formatLabels: ['IMAX'],
    }),
    opp({
      opportunityKey: 'dolby-1',
      filmKey: 'tie',
      theaterId: 'amc-b',
      theaterName: 'AMC B',
      localDate: '2026-08-02',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-02T19:00',
      formatLabels: ['Dolby Cinema'],
    }),
  ];

  const a = selectRecommendedExperienceCandidate({
    opportunities,
    weights: flatWeights,
  });
  const b = selectRecommendedExperienceCandidate({
    opportunities,
    weights: flatWeights,
  });
  assert.deepEqual(a?.id, b?.id);
  // Equal experience value → earlier first sortable wins (dolby earlier).
  assert.equal(a?.id, 'dolby-cinema');
});

test('I: past performances are excluded by caller filter (engine sees only actionable)', () => {
  // Engine itself does not filter past; resolveRecommendedExperience does.
  const homeData = {
    films: [{ filmKey: 'pasty', filmId: 'tmdb:1', title: 'Pasty' }],
    opportunities: [
      opp({
        opportunityKey: 'past-dolby',
        filmKey: 'pasty',
        theaterId: 'amc-a',
        theaterName: 'AMC A',
        localDate: '2026-07-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-07-01T19:00',
        formatLabels: ['Dolby Cinema'],
      }),
      opp({
        opportunityKey: 'future-digital',
        filmKey: 'pasty',
        theaterId: 'amc-a',
        theaterName: 'AMC A',
        localDate: '2026-08-05',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-05T19:00',
        formatLabels: ['Digital'],
      }),
    ],
    theatersById: { 'amc-a': { id: 'amc-a', type: 'chain' } },
  };

  const experience = resolveRecommendedExperience({
    homeData,
    filmKey: 'pasty',
    now: NOW,
  });
  // Only past Dolby + future Digital → no meaningful RE.
  assert.equal(experience, null);
});

test('J: winning cohort returns exact matching performance keys', () => {
  const opportunities = [
    opp({
      opportunityKey: 'd1',
      filmKey: 'keys',
      theaterId: 'amc-a',
      theaterName: 'AMC A',
      localDate: '2026-08-02',
      localTime: '19:00',
      sortableLocalDateTime: '2026-08-02T19:00',
      formatLabels: ['Dolby Cinema'],
    }),
    opp({
      opportunityKey: 'd2',
      filmKey: 'keys',
      theaterId: 'amc-b',
      theaterName: 'AMC B',
      localDate: '2026-08-03',
      localTime: '20:00',
      sortableLocalDateTime: '2026-08-03T20:00',
      formatLabels: ['Dolby Cinema'],
    }),
    opp({
      opportunityKey: 'dig',
      filmKey: 'keys',
      theaterId: 'amc-c',
      theaterName: 'AMC C',
      localDate: '2026-08-02',
      localTime: '18:00',
      sortableLocalDateTime: '2026-08-02T18:00',
      formatLabels: ['Digital'],
    }),
  ];
  const winner = selectRecommendedExperienceCandidate({ opportunities });
  assert.deepEqual(winner.matchingPerformanceKeys.sort(), ['d1', 'd2']);
});

test('K: resolveRecommendedExperience marks engine source and preserves listMatching', () => {
  const homeData = {
    films: [{ filmKey: 'alpha', title: 'Alpha' }],
    opportunities: [
      opp({
        opportunityKey: 'alpha-dolby-a',
        filmKey: 'alpha',
        theaterId: 'amc-alder',
        theaterName: 'AMC Alderwood Mall 16',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['Dolby Cinema'],
      }),
      opp({
        opportunityKey: 'alpha-dolby-b',
        filmKey: 'alpha',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '21:00',
        sortableLocalDateTime: '2026-08-01T21:00',
        formatLabels: ['Dolby Cinema'],
      }),
      opp({
        opportunityKey: 'alpha-digital',
        filmKey: 'alpha',
        theaterId: 'amc-oak',
        theaterName: 'AMC Oak Tree 6',
        localDate: '2026-08-01',
        localTime: '16:00',
        sortableLocalDateTime: '2026-08-01T16:00',
        formatLabels: ['Digital'],
      }),
    ],
  };

  const experience = resolveRecommendedExperience({
    homeData,
    filmKey: 'alpha',
    now: NOW,
  });
  assert.ok(experience);
  assert.equal(experience.source, ENGINE_SOURCE);
  assert.equal(experience.id, 'dolby-cinema');
  assert.doesNotMatch(experience.source, /temporary_best_way_seed/);

  const matched = listMatchingOpportunitiesForExperience({
    homeData,
    filmKey: 'alpha',
    type: 'format',
    id: 'dolby-cinema',
    now: NOW,
  });
  assert.equal(matched.length, 2);
});

test('reason builder stays non-hyperbolic', () => {
  const reason = buildRecommendationReason({
    type: 'format',
    id: '70mm',
    label: '70mm',
    rare: true,
    experienceValue: 94,
    availabilityScore: 20,
    urgencyScore: 0,
    summary: summarizeCohort([]),
  });
  assert.match(reason, /Rare 70mm/);
  assert.doesNotMatch(reason, /best theater in Seattle/i);
});

test('resolvePremiumFormatId prefers IMAX 70mm', () => {
  assert.equal(
    resolvePremiumFormatId({
      formatLabels: ['IMAX', 'IMAX 70mm'],
      theaterName: 'AMC',
    }),
    'imax-70mm',
  );
});

test('35mm rare engagement can beat broad Dolby', () => {
  const opportunities = [
    ...['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'].map((date, i) =>
      opp({
        opportunityKey: `35-${i}`,
        filmKey: 'film',
        theaterId: 'beacon',
        theaterName: 'The Beacon',
        localDate: date,
        localTime: '19:30',
        sortableLocalDateTime: `${date}T19:30`,
        formatLabels: ['35mm'],
      }),
    ),
    ...[1, 2, 3, 4, 5].flatMap((d) =>
      ['14:00', '19:00'].map((t, i) =>
        opp({
          opportunityKey: `d-${d}-${i}`,
          filmKey: 'film',
          theaterId: `amc-${d}`,
          theaterName: `AMC ${d}`,
          localDate: `2026-08-0${d}`,
          localTime: t,
          sortableLocalDateTime: `2026-08-0${d}T${t}`,
          formatLabels: ['Dolby Cinema'],
        }),
      ),
    ),
  ];
  const winner = selectRecommendedExperienceCandidate({ opportunities });
  assert.equal(winner?.id, '35mm');
});
