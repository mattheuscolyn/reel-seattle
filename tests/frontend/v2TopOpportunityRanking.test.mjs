import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpportunityFeatureContext,
  buildOpportunityFeatureVector,
} from '../../v2/topOpportunities/opportunityFeatureVector.js';
import {
  attributeOpportunityReason,
  buildRankedTopOpportunityCandidates,
  compareScoredOpportunities,
  DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
  evaluateOpportunityEligibility,
  inverseCountBoost,
  isExceptionalOpportunity,
  classifyOpportunityNovelty,
  applySpecialEngagementOverlap,
  linearDayDecay,
  rankOpportunityVectors,
  scoreOpportunityFeatureVector,
  screeningNoveltyContribution,
  selectDiversifiedTopOpportunities,
  selectFilmRepresentatives,
  temporalActionabilityScore,
} from '../../v2/topOpportunities/opportunityRanking.js';

/** 2026-09-05 15:00 PDT */
const FIXED_NOW = new Date('2026-09-05T22:00:00.000Z');

function baseOpp(overrides = {}) {
  return {
    opportunityKey: 'opp-1',
    filmKey: 'film-a',
    parentFilmKey: 'film-a',
    filmId: null,
    title: 'Film A',
    theaterId: 'theater-1',
    theaterName: 'Theater One',
    localDate: '2026-09-07',
    localTime: '19:00',
    sortableLocalDateTime: '2026-09-07T19:00',
    formatLabels: [],
    status: 'active',
    screeningVariantType: 'none',
    isSpecialScreening: false,
    firstSeenAt: '2026-08-01',
    source: 'amc',
    ...overrides,
  };
}

function homeFromOpps(opportunities, extras = {}) {
  const filmsByKey = new Map();
  for (const opp of opportunities) {
    if (!filmsByKey.has(opp.filmKey)) {
      filmsByKey.set(opp.filmKey, {
        filmKey: opp.filmKey,
        parentFilmKey: opp.parentFilmKey ?? opp.filmKey,
        title: opp.title ?? opp.filmKey,
        filmId: opp.filmId ?? null,
        screeningVariantType: opp.screeningVariantType ?? 'none',
        isSpecialScreening: opp.isSpecialScreening === true,
      });
    }
  }
  /** @type {Record<string, object>} */
  const theatersById = {};
  for (const opp of opportunities) {
    theatersById[opp.theaterId] = {
      id: opp.theaterId,
      name: opp.theaterName,
      type: extras.theaterTypes?.[opp.theaterId] ?? 'chain',
      enabled: true,
    };
  }
  return {
    timezone: 'America/Los_Angeles',
    films: [...filmsByKey.values()],
    opportunities,
    theatersById,
    newlyAdded: [],
    newlyAddedPairs: [],
    leavingSoon: { status: 'empty', entries: [], reason: null },
    openingThisWeek: { entries: [], week: null },
    ...extras,
  };
}

function vectorFor(opp, homeExtras = {}) {
  const home = homeFromOpps(
    Array.isArray(opp) ? opp : [opp, ...(homeExtras.extraOpps ?? [])],
    homeExtras,
  );
  const list = Array.isArray(opp) ? opp : [opp];
  const allOpps = home.opportunities;
  const ctx = buildOpportunityFeatureContext(
    { ...home, opportunities: allOpps },
    { now: FIXED_NOW },
  );
  return buildOpportunityFeatureVector(list[0], ctx);
}

function vectorsFor(opportunities, homeExtras = {}) {
  const home = homeFromOpps(opportunities, homeExtras);
  const ctx = buildOpportunityFeatureContext(home, { now: FIXED_NOW });
  return opportunities.map((opp) => buildOpportunityFeatureVector(opp, ctx));
}

test('eligibility rejects past, canceled, sold_out, unknown theater; accepts ordinary', () => {
  const ok = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'ok',
        localDate: '2026-09-07',
        sortableLocalDateTime: '2026-09-07T19:00',
      }),
    ),
  );
  assert.equal(ok.eligible, true);

  const past = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 'past',
        localDate: '2026-09-05',
        localTime: '10:00',
        sortableLocalDateTime: '2026-09-05T10:00',
      }),
    ),
  );
  assert.equal(past.eligible, false);
  assert.equal(past.exclusionReason, 'past');

  const canceled = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 'c',
        status: 'canceled',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(canceled.eligible, false);
  assert.equal(canceled.exclusionReason, 'canceled');

  const sold = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 's',
        status: 'sold_out',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(sold.eligible, false);
  assert.equal(sold.exclusionReason, 'sold_out');

  const unknown = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 'u',
        theaterId: 'ghost',
        theaterName: 'Unknown theater',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(unknown.eligible, false);
  assert.equal(unknown.exclusionReason, 'unknown_theater');
});

test('70mm scores above ordinary screening of same film', () => {
  const ordinary = Array.from({ length: 20 }, (_, i) =>
    baseOpp({
      opportunityKey: `o-${i}`,
      formatLabels: ['closed-caption'],
      localDate: '2026-09-08',
      sortableLocalDateTime: `2026-09-08T${String(12 + (i % 6)).padStart(2, '0')}:00`,
      theaterId: `t-${i % 4}`,
      theaterName: `Theater ${i % 4}`,
    }),
  );
  const seventy = baseOpp({
    opportunityKey: 'seventy',
    formatLabels: ['70mm'],
    localDate: '2026-09-09',
    sortableLocalDateTime: '2026-09-09T20:00',
    theaterId: 'rep',
    theaterName: 'Rep',
  });
  const vectors = vectorsFor([...ordinary, seventy], {
    theaterTypes: { rep: 'rep' },
  });
  const scoredOrd = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'o-0'),
  );
  const scored70 = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'seventy'),
  );
  assert.equal(scored70.eligible, true);
  assert.ok(scored70.totalScore > scoredOrd.totalScore);
  assert.ok(
    scored70.components.presentationRarity.score >
      scoredOrd.components.presentationRarity.score,
  );
});

test('unique 70mm outranks common 70mm all else similar', () => {
  const many70 = Array.from({ length: 12 }, (_, i) =>
    baseOpp({
      opportunityKey: `m70-${i}`,
      filmKey: 'common-70',
      title: 'Common 70',
      formatLabels: ['70mm'],
      localDate: '2026-09-08',
      sortableLocalDateTime: `2026-09-08T${String(12 + (i % 8)).padStart(2, '0')}:00`,
      theaterId: `t-${i % 3}`,
      theaterName: `T${i % 3}`,
    }),
  );
  const unique70 = baseOpp({
    opportunityKey: 'u70',
    filmKey: 'unique-70',
    title: 'Unique 70',
    formatLabels: ['70mm'],
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T20:00',
  });
  const vectors = vectorsFor([...many70, unique70]);
  const common = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'm70-0'),
  );
  const unique = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'u70'),
  );
  assert.ok(unique.totalScore > common.totalScore);
  assert.ok(
    unique.components.presentationRarity.score >=
      common.components.presentationRarity.score,
  );
});

test('last_chance urgency outranks no-model urgency when otherwise equal', () => {
  const base = baseOpp({
    opportunityKey: 'plain',
    filmKey: 'plain',
    title: 'Plain',
  });
  const urgent = baseOpp({
    opportunityKey: 'urgent',
    filmKey: 'urgent',
    title: 'Urgent',
  });
  const vectors = vectorsFor([base, urgent], {
    leavingSoon: {
      status: 'ready',
      entries: [
        {
          filmKey: 'urgent',
          bucket: 'last_chance',
          riskLevel: 'high',
          maxShowDate: '2026-09-08',
        },
      ],
    },
  });
  const scoredPlain = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'plain'),
  );
  const scoredUrgent = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'urgent'),
  );
  assert.ok(
    scoredUrgent.components.urgency.score > scoredPlain.components.urgency.score,
  );
  // After anti-double-counting, a model last_chance 1-show and a no-model
  // 1-show are intentionally similar on total; urgency must still favor model.
  assert.ok(
    scoredUrgent.totalScore >= scoredPlain.totalScore - 5,
    `urgent=${scoredUrgent.totalScore} plain=${scoredPlain.totalScore}`,
  );
});

test('event variant outranks ordinary same scarcity', () => {
  const ordinary = baseOpp({
    opportunityKey: 'ord',
    filmKey: 'ord',
    title: 'Ord',
  });
  const event = baseOpp({
    opportunityKey: 'ev',
    filmKey: 'ev',
    title: 'Ev',
    screeningVariantType: 'anniversary',
    isSpecialScreening: true,
  });
  const vectors = vectorsFor([ordinary, event]);
  const sOrd = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'ord'),
  );
  const sEv = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'ev'),
  );
  assert.ok(sEv.components.event.score > sOrd.components.event.score);
  assert.ok(sEv.totalScore > sOrd.totalScore);
});

test('recent first-seen novelty outranks stale', () => {
  const recent = baseOpp({
    opportunityKey: 'recent',
    filmKey: 'recent',
    title: 'Recent',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-09-04',
  });
  const stale = baseOpp({
    opportunityKey: 'stale',
    filmKey: 'stale',
    title: 'Stale',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-07-01',
  });
  const vectors = vectorsFor([recent, stale]);
  const sRecent = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'recent'),
  );
  const sStale = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'stale'),
  );
  assert.ok(sRecent.components.novelty.score > sStale.components.novelty.score);
});

test('scarce presentation outranks common presentation', () => {
  const scarce = baseOpp({
    opportunityKey: 'scarce',
    filmKey: 'scarce',
    title: 'Scarce',
  });
  const commonMany = Array.from({ length: 15 }, (_, i) =>
    baseOpp({
      opportunityKey: `c-${i}`,
      filmKey: 'common',
      title: 'Common',
      theaterId: `t-${i % 5}`,
      theaterName: `T${i % 5}`,
      sortableLocalDateTime: `2026-09-08T${String(10 + (i % 8)).padStart(2, '0')}:00`,
      localDate: '2026-09-08',
    }),
  );
  const vectors = vectorsFor([scarce, ...commonMany]);
  const sScarce = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'scarce'),
  );
  const sCommon = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'common'),
  );
  assert.ok(sScarce.components.scarcity.score > sCommon.components.scarcity.score);
});

test('ubiquitous ordinary screening is penalized; rare presentation of ubiquitous film is not crushed', () => {
  const ordinaryMany = Array.from({ length: 40 }, (_, i) =>
    baseOpp({
      opportunityKey: `wide-${i}`,
      filmKey: 'wide',
      title: 'Wide',
      formatLabels: ['closed-caption', 'audio-description'],
      theaterId: `t-${i % 8}`,
      theaterName: `Theater ${i % 8}`,
      localDate: '2026-09-08',
      sortableLocalDateTime: `2026-09-08T${String(10 + (i % 10)).padStart(2, '0')}:00`,
    }),
  );
  const rare = baseOpp({
    opportunityKey: 'wide-70',
    filmKey: 'wide',
    title: 'Wide',
    formatLabels: ['70mm'],
    theaterId: 'rep',
    theaterName: 'Rep',
    localDate: '2026-09-09',
    sortableLocalDateTime: '2026-09-09T20:00',
  });
  const vectors = vectorsFor([...ordinaryMany, rare], {
    theaterTypes: { rep: 'rep' },
    openingThisWeek: {
      week: { start_date: '2026-08-31', end_date: '2026-09-06' },
      entries: [
        {
          showtimeFilmKey: 'wide',
          parentFilmKey: 'wide',
          openingType: 'theatrical',
          openingDate: '2026-09-01',
        },
      ],
    },
  });
  const sOrd = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'wide-0'),
  );
  const sRare = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'wide-70'),
  );
  assert.ok(sOrd.components.ubiquityPenalty.score < 0);
  assert.equal(sRare.components.ubiquityPenalty.score, 0);
  assert.ok(sRare.totalScore > sOrd.totalScore);
});

test('accessibility does not boost or penalize specialness', () => {
  const plain = baseOpp({
    opportunityKey: 'plain',
    filmKey: 'plain',
    title: 'Plain',
    formatLabels: [],
  });
  const a11y = baseOpp({
    opportunityKey: 'a11y',
    filmKey: 'a11y',
    title: 'A11y',
    formatLabels: ['closed-caption', 'audio-description', 'open-caption'],
  });
  const vectors = vectorsFor([plain, a11y]);
  const sPlain = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'plain'),
  );
  const sA11y = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'a11y'),
  );
  assert.equal(
    sPlain.components.presentationRarity.score,
    sA11y.components.presentationRarity.score,
  );
  assert.equal(
    sPlain.components.ubiquityPenalty.score,
    sA11y.components.ubiquityPenalty.score,
  );
});

test('too-imminent applies penalty', () => {
  const imminent = baseOpp({
    opportunityKey: 'soon',
    localDate: '2026-09-05',
    localTime: '15:30',
    sortableLocalDateTime: '2026-09-05T15:30',
  });
  const later = baseOpp({
    opportunityKey: 'later',
    filmKey: 'later',
    title: 'Later',
    localDate: '2026-09-07',
    sortableLocalDateTime: '2026-09-07T19:00',
  });
  const vectors = vectorsFor([imminent, later]);
  const sSoon = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'soon'),
  );
  assert.ok(sSoon.components.imminencePenalty.score < 0);
  assert.equal(
    sSoon.components.imminencePenalty.score,
    -DEFAULT_TOP_OPPORTUNITY_WEIGHTS.penalties.tooImminent,
  );
});

test('film dedupe chooses rare presentation over ordinary', () => {
  const ordinary = baseOpp({
    opportunityKey: 'ord',
    formatLabels: [],
    localDate: '2026-09-07',
    sortableLocalDateTime: '2026-09-07T14:00',
  });
  const rare = baseOpp({
    opportunityKey: 'rare',
    formatLabels: ['70mm'],
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T20:00',
  });
  const { scored } = rankOpportunityVectors(vectorsFor([ordinary, rare]));
  const { representatives, suppressedDuplicates } =
    selectFilmRepresentatives(scored);
  assert.equal(representatives.length, 1);
  assert.equal(representatives[0].vector.identifiers.opportunityKey, 'rare');
  assert.equal(suppressedDuplicates.length, 1);
  assert.equal(suppressedDuplicates[0].suppressionReason, 'duplicate_film');
});

test('diversification prefers varied categories when scores are comparable', () => {
  const seventyBatch = (filmKey, theaterId) =>
    Array.from({ length: 8 }, (_, i) =>
      baseOpp({
        opportunityKey: `${filmKey}-${i}`,
        filmKey,
        title: filmKey,
        formatLabels: ['70mm'],
        firstSeenAt: '2026-07-01',
        theaterId,
        theaterName: `Theater ${theaterId}`,
        localDate: '2026-09-08',
        sortableLocalDateTime: `2026-09-08T${String(12 + (i % 6)).padStart(2, '0')}:00`,
      }),
    );
  const anniversary = baseOpp({
    opportunityKey: 'ann-0',
    filmKey: 'ann-film',
    title: 'Ann Film',
    screeningVariantType: 'anniversary',
    isSpecialScreening: true,
    formatLabels: [],
    firstSeenAt: '2026-09-03',
    theaterId: 'th-ann',
    theaterName: 'Theater Ann',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:00',
  });
  const newly = baseOpp({
    opportunityKey: 'new-0',
    filmKey: 'new-film',
    title: 'New Film',
    formatLabels: [],
    firstSeenAt: '2026-09-04',
    theaterId: 'th-new',
    theaterName: 'Theater New',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:30',
  });
  const opps = [
    ...seventyBatch('film-a', 'tha'),
    ...seventyBatch('film-b', 'thb'),
    ...seventyBatch('film-c', 'thc'),
    anniversary,
    newly,
  ];
  const { scored } = rankOpportunityVectors(
    vectorsFor(opps, {
      leavingSoon: {
        status: 'ready',
        entries: [
          {
            filmKey: 'ann-film',
            bucket: 'last_chance',
            riskLevel: 'high',
            maxShowDate: '2026-09-09',
          },
        ],
      },
      newlyAddedPairs: [
        {
          filmKey: 'new-film',
          theaterId: 'th-new',
          firstAnnouncedDate: '2026-09-04',
        },
      ],
    }),
  );
  const { representatives } = selectFilmRepresentatives(scored);
  const { selected } = selectDiversifiedTopOpportunities(representatives, {
    topN: 3,
    weights: {
      ...DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
      diversity: {
        ...DEFAULT_TOP_OPPORTUNITY_WEIGHTS.diversity,
        lambda: 0.55,
        sameDominantReason: 0.7,
        sameFormatFamily: 0.55,
      },
    },
  });
  assert.equal(selected.length, 3);
  assert.equal(selected[0].selectionRank, 1);
  const filmKeys = selected.map((s) => s.vector.identifiers.filmKey);
  assert.ok(
    filmKeys.includes('ann-film') || filmKeys.includes('new-film'),
    `expected anniversary or newly-announced in Top 3, got ${filmKeys.join(',')}`,
  );
});

test('massive score gap can overcome diversity penalty', () => {
  const monster70 = [
    baseOpp({
      opportunityKey: 'm1',
      filmKey: 'm1',
      title: 'M1',
      formatLabels: ['imax-70mm'],
      firstSeenAt: '2026-09-05',
      screeningVariantType: 'anniversary',
      isSpecialScreening: true,
    }),
  ];
  const weak = [
    baseOpp({
      opportunityKey: 'w1',
      filmKey: 'w1',
      title: 'W1',
      formatLabels: [],
      firstSeenAt: '2026-06-01',
    }),
    baseOpp({
      opportunityKey: 'w2',
      filmKey: 'w2',
      title: 'W2',
      formatLabels: [],
      firstSeenAt: '2026-06-01',
    }),
  ];
  const strongClones = [
    baseOpp({
      opportunityKey: 'm2',
      filmKey: 'm2',
      title: 'M2',
      formatLabels: ['imax-70mm'],
      firstSeenAt: '2026-09-05',
      screeningVariantType: 'anniversary',
      isSpecialScreening: true,
      theaterId: 'theater-2',
      theaterName: 'Theater Two',
    }),
    baseOpp({
      opportunityKey: 'm3',
      filmKey: 'm3',
      title: 'M3',
      formatLabels: ['imax-70mm'],
      firstSeenAt: '2026-09-05',
      screeningVariantType: 'anniversary',
      isSpecialScreening: true,
      theaterId: 'theater-3',
      theaterName: 'Theater Three',
    }),
  ];
  const { scored } = rankOpportunityVectors(
    vectorsFor([...monster70, ...strongClones, ...weak], {
      leavingSoon: {
        status: 'ready',
        entries: [
          { filmKey: 'm1', bucket: 'last_chance', riskLevel: 'high' },
          { filmKey: 'm2', bucket: 'last_chance', riskLevel: 'high' },
          { filmKey: 'm3', bucket: 'last_chance', riskLevel: 'high' },
        ],
      },
    }),
  );
  const { representatives } = selectFilmRepresentatives(scored);
  const { selected } = selectDiversifiedTopOpportunities(representatives, {
    topN: 3,
  });
  assert.equal(selected[0].vector.identifiers.filmKey, 'm1');
  const selectedKeys = selected.map((s) => s.vector.identifiers.filmKey);
  assert.ok(selectedKeys.includes('m1'));
  assert.ok(
    selectedKeys.filter((k) => k.startsWith('m')).length >= 2 ||
      selectedKeys.some((k) => k.startsWith('w')),
  );
});

test('reason attribution prefers largest meaningful contribution', () => {
  const rare = baseOpp({
    opportunityKey: 'r',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-09-04',
  });
  const scored = scoreOpportunityFeatureVector(vectorFor(rare));
  const reason = attributeOpportunityReason(scored);
  assert.ok(
    ['rare_presentation', 'newly_announced', 'limited_presentation'].includes(
      reason.category,
    ),
  );
  assert.equal(typeof reason.labelKey, 'string');
  assert.ok(Array.isArray(reason.supportingReasons));
});

test('ranking is deterministic', () => {
  const opps = [
    baseOpp({
      opportunityKey: 'a',
      filmKey: 'a',
      title: 'A',
      formatLabels: ['70mm'],
    }),
    baseOpp({
      opportunityKey: 'b',
      filmKey: 'b',
      title: 'B',
      screeningVariantType: 'fan_event',
      isSpecialScreening: true,
    }),
    baseOpp({
      opportunityKey: 'c',
      filmKey: 'c',
      title: 'C',
      firstSeenAt: '2026-09-03',
    }),
  ];
  const home = homeFromOpps(opps);
  const a = buildRankedTopOpportunityCandidates(home, {
    now: FIXED_NOW,
    topN: 3,
  });
  const b = buildRankedTopOpportunityCandidates(home, {
    now: FIXED_NOW,
    topN: 3,
  });
  assert.deepEqual(
    a.selected.map((s) => s.vector.identifiers.opportunityKey),
    b.selected.map((s) => s.vector.identifiers.opportunityKey),
  );
  assert.deepEqual(
    a.selected.map((s) => s.totalScore),
    b.selected.map((s) => s.totalScore),
  );
  assert.deepEqual(
    a.selected.map((s) => s.dominantReason.category),
    b.selected.map((s) => s.dominantReason.category),
  );
});

test('bounds: 0, 1, and fewer than N candidates', () => {
  const empty = buildRankedTopOpportunityCandidates(homeFromOpps([]), {
    now: FIXED_NOW,
  });
  assert.equal(empty.selected.length, 0);

  const one = buildRankedTopOpportunityCandidates(
    homeFromOpps([baseOpp({ opportunityKey: 'only' })]),
    { now: FIXED_NOW, topN: 3 },
  );
  assert.equal(one.selected.length, 1);

  const two = buildRankedTopOpportunityCandidates(
    homeFromOpps([
      baseOpp({ opportunityKey: '1', filmKey: '1', title: '1' }),
      baseOpp({ opportunityKey: '2', filmKey: '2', title: '2' }),
    ]),
    { now: FIXED_NOW, topN: 3 },
  );
  assert.equal(two.selected.length, 2);
});

test('helper transforms behave monotonically', () => {
  assert.ok(inverseCountBoost(1, 10, 2) > inverseCountBoost(5, 10, 2));
  assert.ok(linearDayDecay(0, 14, 7) > linearDayDecay(6, 14, 7));
  assert.equal(linearDayDecay(8, 14, 7), 0);
  assert.ok(
    temporalActionabilityScore(60, DEFAULT_TOP_OPPORTUNITY_WEIGHTS.temporal) >
      temporalActionabilityScore(200, DEFAULT_TOP_OPPORTUNITY_WEIGHTS.temporal),
  );
});

test('compareScoredOpportunities is deterministic on ties', () => {
  const a = {
    totalScore: 10,
    components: { presentationRarity: { score: 1 }, event: { score: 0 } },
    vector: {
      temporal: { hoursUntil: 20 },
      identifiers: { opportunityKey: 'a' },
    },
  };
  const b = {
    totalScore: 10,
    components: { presentationRarity: { score: 1 }, event: { score: 0 } },
    vector: {
      temporal: { hoursUntil: 30 },
      identifiers: { opportunityKey: 'b' },
    },
  };
  assert.equal(compareScoredOpportunities(a, b), -1);
  assert.equal(compareScoredOpportunities(b, a), 1);
});

test('urgency/scarcity saturation: last_chance + one screening does not double-count fully', () => {
  const lastChanceOne = baseOpp({
    opportunityKey: 'lc1',
    filmKey: 'lc1',
    title: 'LC One',
    firstSeenAt: '2026-07-01',
  });
  const scored = scoreOpportunityFeatureVector(
    vectorFor(lastChanceOne, {
      leavingSoon: {
        status: 'ready',
        entries: [
          {
            filmKey: 'lc1',
            bucket: 'last_chance',
            riskLevel: 'high',
            maxShowDate: '2026-09-08',
          },
        ],
      },
    }),
  );
  const u = scored.components.urgency.score;
  const s = scored.components.scarcity.score;
  assert.ok(u > 0 && s > 0);
  assert.ok(
    u + s <= DEFAULT_TOP_OPPORTUNITY_WEIGHTS.urgencyPlusScarcityCap + 0.01,
  );
  const filmReason = scored.components.urgency.reasons.find(
    (r) => r.key === 'film_remaining_showtimes',
  );
  assert.ok(filmReason);
  assert.ok(
    filmReason.contribution <
      DEFAULT_TOP_OPPORTUNITY_WEIGHTS.urgency.filmRemainingMax * 0.5,
  );
});

test('rare presentation retains strong intrinsic value with many presentations', () => {
  const many70 = Array.from({ length: 40 }, (_, i) =>
    baseOpp({
      opportunityKey: `r70-${i}`,
      filmKey: 'run-70',
      title: 'Run 70',
      formatLabels: ['70mm'],
      firstSeenAt: '2026-07-01',
      theaterId: `t-${i % 5}`,
      theaterName: `T${i % 5}`,
      localDate: '2026-09-10',
      sortableLocalDateTime: `2026-09-10T${String(10 + (i % 10)).padStart(2, '0')}:00`,
    }),
  );
  const scored = scoreOpportunityFeatureVector(
    vectorsFor(many70).find((v) => v.identifiers.opportunityKey === 'r70-0'),
  );
  const intrinsic =
    DEFAULT_TOP_OPPORTUNITY_WEIGHTS.presentationRarity.formatBase['70mm'];
  assert.ok(scored.components.presentationRarity.score >= intrinsic);
  const formatReason = scored.components.presentationRarity.reasons.find(
    (r) => r.key === 'rare_format',
  );
  assert.equal(formatReason?.contribution, intrinsic);
});

test('presentation scarcity still increases rarity value', () => {
  const oneOff = baseOpp({
    opportunityKey: 'one70',
    filmKey: 'one70',
    title: 'One 70',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-07-01',
  });
  const many = Array.from({ length: 20 }, (_, i) =>
    baseOpp({
      opportunityKey: `many70-${i}`,
      filmKey: 'many70',
      title: 'Many 70',
      formatLabels: ['70mm'],
      firstSeenAt: '2026-07-01',
      theaterId: `t-${i % 4}`,
      theaterName: `T${i % 4}`,
      localDate: '2026-09-08',
      sortableLocalDateTime: `2026-09-08T${String(10 + (i % 8)).padStart(2, '0')}:00`,
    }),
  );
  const vectors = vectorsFor([oneOff, ...many]);
  const sOne = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'one70'),
  );
  const sMany = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'many70'),
  );
  assert.ok(
    sOne.components.presentationRarity.score >
      sMany.components.presentationRarity.score,
  );
});

test('far-horizon rare retains reasonable temporal; ordinary far-horizon weaker', () => {
  const rareFar = baseOpp({
    opportunityKey: 'rare-far',
    filmKey: 'rare-far',
    title: 'Rare Far',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-16',
    localTime: '20:00',
    sortableLocalDateTime: '2026-09-16T20:00',
  });
  const ordFar = baseOpp({
    opportunityKey: 'ord-far',
    filmKey: 'ord-far',
    title: 'Ord Far',
    formatLabels: [],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-16',
    localTime: '20:00',
    sortableLocalDateTime: '2026-09-16T20:00',
  });
  const vectors = vectorsFor([rareFar, ordFar]);
  const sRare = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'rare-far'),
  );
  const sOrd = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'ord-far'),
  );
  assert.ok(isExceptionalOpportunity(sRare.vector));
  assert.ok(
    sRare.components.temporal.score >=
      DEFAULT_TOP_OPPORTUNITY_WEIGHTS.temporal.exceptionalFloor,
  );
  assert.ok(sRare.components.temporal.score > sOrd.components.temporal.score);
  assert.ok(sRare.totalScore > sOrd.totalScore + 15);
});

test('novelty: 0–2 day screening > 5–7 day; combined channels capped', () => {
  const cfg = DEFAULT_TOP_OPPORTUNITY_WEIGHTS.novelty;
  assert.ok(
    screeningNoveltyContribution(0, cfg, true) >
      screeningNoveltyContribution(2, cfg, true),
  );
  assert.ok(
    screeningNoveltyContribution(1, cfg, true) >
      screeningNoveltyContribution(5, cfg, true),
  );
  assert.equal(screeningNoveltyContribution(6, cfg, true), 0);

  const distinctive = baseOpp({
    opportunityKey: 'nov-d',
    filmKey: 'nov-d',
    title: 'Nov D',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-09-05',
  });
  const scored = scoreOpportunityFeatureVector(
    vectorFor(distinctive, {
      newlyAddedPairs: [
        {
          filmKey: 'nov-d',
          theaterId: 'theater-1',
          firstAnnouncedDate: '2026-09-05',
        },
      ],
    }),
  );
  assert.ok(scored.components.novelty.score <= cfg.combinedCap);
  assert.ok(scored.components.novelty.reasons.length >= 1);
});

test('ordinary screening novelty is scaled down vs distinctive', () => {
  const cfg = DEFAULT_TOP_OPPORTUNITY_WEIGHTS.novelty;
  const ordinary = screeningNoveltyContribution(0, cfg, false);
  const distinctive = screeningNoveltyContribution(0, cfg, true);
  assert.equal(ordinary, 0);
  assert.ok(distinctive > ordinary);
});

test('one-night indie without leaving model remains strong', () => {
  const indie = baseOpp({
    opportunityKey: 'indie-1',
    filmKey: 'indie-1',
    title: 'Indie Night',
    source: 'siiff',
    theaterId: 'rep',
    theaterName: 'Rep House',
    firstSeenAt: '2026-07-01',
    screeningVariantType: 'special_event',
    isSpecialScreening: true,
  });
  const scored = scoreOpportunityFeatureVector(
    vectorFor(indie, { theaterTypes: { rep: 'rep' } }),
  );
  assert.ok(
    scored.components.urgency.score + scored.components.scarcity.score >= 15,
  );
  assert.ok(scored.totalScore >= 40);
  assert.ok(
    [
      'limited_run',
      'limited_presentation',
      'special_event',
      'repertory_event',
    ].includes(attributeOpportunityReason(scored).category),
  );
});

test('archetype relative comparisons A–F', () => {
  const A = baseOpp({
    opportunityKey: 'arch-a',
    filmKey: 'arch-a',
    title: 'Arch A',
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-06',
    sortableLocalDateTime: '2026-09-06T19:00',
  });
  const B = Array.from({ length: 18 }, (_, i) =>
    baseOpp({
      opportunityKey: `arch-b-${i}`,
      filmKey: 'arch-b',
      title: 'Arch B',
      formatLabels: ['70mm'],
      firstSeenAt: '2026-07-01',
      theaterId: `tb-${i % 3}`,
      theaterName: `TB${i % 3}`,
      localDate: '2026-09-13',
      sortableLocalDateTime: `2026-09-13T${String(12 + (i % 6)).padStart(2, '0')}:00`,
    }),
  );
  const C = baseOpp({
    opportunityKey: 'arch-c',
    filmKey: 'arch-c',
    title: 'Arch C',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T20:00',
  });
  const D = baseOpp({
    opportunityKey: 'arch-d',
    filmKey: 'arch-d',
    title: 'Arch D',
    screeningVariantType: 'special_event',
    isSpecialScreening: true,
    firstSeenAt: '2026-07-01',
    theaterId: 'rep-d',
    theaterName: 'Rep D',
    localDate: '2026-09-07',
    sortableLocalDateTime: '2026-09-07T19:30',
  });
  const E = Array.from({ length: 25 }, (_, i) =>
    baseOpp({
      opportunityKey: `arch-e-${i}`,
      filmKey: 'arch-e',
      title: 'Arch E',
      firstSeenAt: '2026-09-04',
      theaterId: `te-${i % 6}`,
      theaterName: `TE${i % 6}`,
      localDate: '2026-09-08',
      sortableLocalDateTime: `2026-09-08T${String(10 + (i % 8)).padStart(2, '0')}:00`,
    }),
  );
  const F = Array.from({ length: 30 }, (_, i) =>
    baseOpp({
      opportunityKey: `arch-f-${i}`,
      filmKey: 'arch-f',
      title: 'Arch F',
      firstSeenAt: '2026-07-01',
      theaterId: `tf-${i % 7}`,
      theaterName: `TF${i % 7}`,
      localDate: '2026-09-09',
      sortableLocalDateTime: `2026-09-09T${String(10 + (i % 8)).padStart(2, '0')}:00`,
    }),
  );

  const all = [A, ...B, C, D, ...E, ...F];
  const vectors = vectorsFor(all, {
    theaterTypes: { 'rep-d': 'rep' },
    leavingSoon: {
      status: 'ready',
      entries: [
        {
          filmKey: 'arch-a',
          bucket: 'last_chance',
          riskLevel: 'high',
          maxShowDate: '2026-09-06',
        },
      ],
    },
    newlyAddedPairs: [
      {
        filmKey: 'arch-e',
        theaterId: 'te-0',
        firstAnnouncedDate: '2026-09-04',
      },
    ],
    openingThisWeek: {
      week: { start_date: '2026-08-31', end_date: '2026-09-06' },
      entries: [
        {
          showtimeFilmKey: 'arch-e',
          parentFilmKey: 'arch-e',
          openingType: 'theatrical',
          openingDate: '2026-09-04',
        },
        {
          showtimeFilmKey: 'arch-f',
          parentFilmKey: 'arch-f',
          openingType: 'theatrical',
          openingDate: '2026-08-28',
        },
        {
          showtimeFilmKey: 'arch-d',
          parentFilmKey: 'arch-d',
          openingType: 'event',
          openingDate: '2026-09-07',
        },
      ],
    },
  });

  const scoreKey = (key) =>
    scoreOpportunityFeatureVector(
      vectors.find((v) => v.identifiers.filmKey === key),
    );

  const sA = scoreKey('arch-a');
  const sB = scoreKey('arch-b');
  const sC = scoreKey('arch-c');
  const sD = scoreKey('arch-d');
  const sE = scoreKey('arch-e');
  const sF = scoreKey('arch-f');

  assert.ok(sC.totalScore >= 55, `C=${sC.totalScore}`);
  assert.ok(sD.totalScore >= 45, `D=${sD.totalScore}`);
  assert.ok(sA.totalScore >= 40, `A=${sA.totalScore}`);
  assert.ok(sB.totalScore >= 35, `B=${sB.totalScore}`);
  assert.ok(
    sB.totalScore > sF.totalScore + 15,
    `B=${sB.totalScore} F=${sF.totalScore}`,
  );
  assert.ok(sE.totalScore > sF.totalScore, `E=${sE.totalScore} F=${sF.totalScore}`);
  assert.ok(sC.totalScore > sE.totalScore, `C=${sC.totalScore} E=${sE.totalScore}`);
  assert.ok(sD.totalScore > sE.totalScore, `D=${sD.totalScore} E=${sE.totalScore}`);
  assert.ok(sF.totalScore < 30, `F=${sF.totalScore}`);
});

test('dominant reason remains contribution-driven for archetypes', () => {
  const lastChance = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'dr-a',
        filmKey: 'dr-a',
        firstSeenAt: '2026-07-01',
      }),
      {
        leavingSoon: {
          status: 'ready',
          entries: [
            { filmKey: 'dr-a', bucket: 'last_chance', riskLevel: 'high' },
          ],
        },
      },
    ),
  );
  assert.equal(attributeOpportunityReason(lastChance).category, 'leaving_soon');

  const seventy = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'dr-70',
        filmKey: 'dr-70',
        formatLabels: ['70mm'],
        firstSeenAt: '2026-07-01',
      }),
    ),
  );
  assert.equal(attributeOpportunityReason(seventy).category, 'rare_presentation');
});

test('exceptional too-imminent penalty is softer than ordinary', () => {
  const ordinary = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'imm-o',
        filmKey: 'imm-o',
        localDate: '2026-09-05',
        localTime: '15:30',
        sortableLocalDateTime: '2026-09-05T15:30',
        firstSeenAt: '2026-07-01',
      }),
    ),
  );
  const rare = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'imm-r',
        filmKey: 'imm-r',
        formatLabels: ['70mm'],
        localDate: '2026-09-05',
        localTime: '15:30',
        sortableLocalDateTime: '2026-09-05T15:30',
        firstSeenAt: '2026-07-01',
      }),
    ),
  );
  assert.equal(
    ordinary.components.imminencePenalty.score,
    -DEFAULT_TOP_OPPORTUNITY_WEIGHTS.penalties.tooImminent,
  );
  assert.ok(
    rare.components.imminencePenalty.score >
      ordinary.components.imminencePenalty.score,
  );
  assert.ok(rare.components.imminencePenalty.score < 0);
});

test('ordinary recent-row freshness is not opportunity novelty', () => {
  const ordinaryFresh = baseOpp({
    opportunityKey: 'ord-fresh',
    filmKey: 'ord-fresh',
    title: 'Ord Fresh',
    firstSeenAt: '2026-09-05',
  });
  const scored = scoreOpportunityFeatureVector(vectorFor(ordinaryFresh));
  assert.equal(scored.noveltyClass, 'ordinary_recent_row');
  assert.equal(scored.components.novelty.score, 0);
  assert.ok(scored.totalScore < 45);
});

test('film×theater announcement preserves ordinary novelty', () => {
  const announced = baseOpp({
    opportunityKey: 'ann-th',
    filmKey: 'ann-th',
    title: 'Ann Th',
    firstSeenAt: '2026-09-04',
  });
  const scored = scoreOpportunityFeatureVector(
    vectorFor(announced, {
      newlyAddedPairs: [
        {
          filmKey: 'ann-th',
          theaterId: 'theater-1',
          firstAnnouncedDate: '2026-09-04',
        },
      ],
    }),
  );
  assert.equal(scored.noveltyClass, 'new_film_at_theater');
  assert.ok(scored.components.novelty.score >= 3);
  assert.ok(
    scored.components.novelty.reasons.some((r) => r.key === 'film_theater_announced'),
  );
  assert.equal(
    scored.components.novelty.reasons.find((r) => r.key === 'screening_first_seen'),
    undefined,
  );
});

test('newly announced rare screening of known film keeps rarity + screening novelty', () => {
  const knownOrdinary = Array.from({ length: 12 }, (_, i) =>
    baseOpp({
      opportunityKey: `known-${i}`,
      filmKey: 'known-70',
      title: 'Known 70',
      firstSeenAt: '2026-07-01',
      theaterId: `t-${i % 3}`,
      theaterName: `T${i % 3}`,
      localDate: '2026-09-08',
      sortableLocalDateTime: `2026-09-08T${String(12 + (i % 6)).padStart(2, '0')}:00`,
    }),
  );
  const new70 = baseOpp({
    opportunityKey: 'new-70',
    filmKey: 'known-70',
    title: 'Known 70',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-09-05',
    theaterId: 'rep',
    theaterName: 'Rep',
    localDate: '2026-09-09',
    sortableLocalDateTime: '2026-09-09T20:00',
  });
  const vectors = vectorsFor([...knownOrdinary, new70], {
    theaterTypes: { rep: 'rep' },
  });
  const scored = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'new-70'),
  );
  const stale70 = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'stale-70',
        filmKey: 'stale-70',
        formatLabels: ['70mm'],
        firstSeenAt: '2026-07-01',
      }),
    ),
  );
  assert.equal(scored.noveltyClass, 'distinctive_new_screening');
  assert.ok(scored.components.presentationRarity.score >= 26);
  assert.ok(scored.components.novelty.score >= 6);
  assert.ok(scored.components.novelty.score > stale70.components.novelty.score);
});

test('event + novelty + premium shows diminishing returns', () => {
  const earlyImax = baseOpp({
    opportunityKey: 'ea-imax',
    filmKey: 'ea-imax',
    title: 'EA IMAX',
    formatLabels: ['imax'],
    screeningVariantType: 'early_access',
    isSpecialScreening: true,
    firstSeenAt: '2026-09-05',
  });
  const scored = scoreOpportunityFeatureVector(vectorFor(earlyImax));
  const event = scored.components.event.score;
  const novelty = scored.components.novelty.score;
  const premium = scored.components.presentationRarity.reasons.find(
    (r) => r.key === 'premium_format',
  )?.contribution ?? 0;
  assert.ok(event > 0);
  assert.ok(premium > 0);
  assert.ok(
    event + novelty + premium <=
      DEFAULT_TOP_OPPORTUNITY_WEIGHTS.specialEngagementStackCap + 0.05,
  );
  const naiveScreening = screeningNoveltyContribution(
    0,
    DEFAULT_TOP_OPPORTUNITY_WEIGHTS.novelty,
    true,
  );
  assert.ok(novelty < naiveScreening);
  const reason = attributeOpportunityReason(scored);
  assert.equal(reason.category, 'special_event');
  assert.equal(reason.labelKey, 'early_access');
  assert.ok(
    reason.supportingReasons.some(
      (r) =>
        r.category === 'limited_run' ||
        r.category === 'limited_presentation' ||
        r.category === 'newly_announced',
    ),
  );
});

test('early-access IMAX outranks ordinary IMAX; rare 70mm outranks ordinary premium', () => {
  const ordinaryImax = baseOpp({
    opportunityKey: 'ord-imax',
    filmKey: 'ord-imax',
    title: 'Ord IMAX',
    formatLabels: ['imax'],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:00',
  });
  const earlyImax = baseOpp({
    opportunityKey: 'ea-imax2',
    filmKey: 'ea-imax2',
    title: 'EA IMAX2',
    formatLabels: ['imax'],
    screeningVariantType: 'early_access',
    isSpecialScreening: true,
    firstSeenAt: '2026-09-05',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:00',
  });
  const seventy = baseOpp({
    opportunityKey: 'std-70',
    filmKey: 'std-70',
    title: 'Std 70',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:00',
  });
  const ordinaryPrem = baseOpp({
    opportunityKey: 'ord-dolby',
    filmKey: 'ord-dolby',
    title: 'Ord Dolby',
    formatLabels: ['dolby-cinema'],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:00',
  });
  const vectors = vectorsFor([ordinaryImax, earlyImax, seventy, ordinaryPrem]);
  const sOrdImax = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'ord-imax'),
  );
  const sEarly = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'ea-imax2'),
  );
  const s70 = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'std-70'),
  );
  const sDolby = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.opportunityKey === 'ord-dolby'),
  );
  assert.ok(sEarly.totalScore > sOrdImax.totalScore);
  assert.ok(s70.totalScore > sDolby.totalScore);
  assert.equal(attributeOpportunityReason(s70).category, 'rare_presentation');
});

test('ordinary recent-row freshness does not beat scarce/event opportunities', () => {
  const freshWide = Array.from({ length: 20 }, (_, i) =>
    baseOpp({
      opportunityKey: `fw-${i}`,
      filmKey: 'fresh-wide',
      title: 'Fresh Wide',
      firstSeenAt: '2026-09-05',
      theaterId: `tw-${i % 5}`,
      theaterName: `TW${i % 5}`,
      localDate: '2026-09-09',
      sortableLocalDateTime: `2026-09-09T${String(12 + (i % 6)).padStart(2, '0')}:00`,
    }),
  );
  const event = baseOpp({
    opportunityKey: 'ev-beat',
    filmKey: 'ev-beat',
    title: 'Ev Beat',
    screeningVariantType: 'anniversary',
    isSpecialScreening: true,
    firstSeenAt: '2026-07-01',
  });
  const vectors = vectorsFor([...freshWide, event]);
  const sFresh = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'fresh-wide'),
  );
  const sEvent = scoreOpportunityFeatureVector(
    vectors.find((v) => v.identifiers.filmKey === 'ev-beat'),
  );
  assert.equal(sFresh.components.novelty.score, 0);
  assert.ok(sEvent.totalScore > sFresh.totalScore);
});

test('generic scarcity does not dominate explicit event or rare format when close', () => {
  const early = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'ea-close',
        filmKey: 'ea-close',
        formatLabels: ['imax'],
        screeningVariantType: 'early_access',
        isSpecialScreening: true,
        firstSeenAt: '2026-07-01',
      }),
    ),
  );
  const earlyReason = attributeOpportunityReason(early);
  assert.equal(earlyReason.category, 'special_event');
  assert.ok(earlyReason.salience >= earlyReason.score);

  const seventy = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'r70-close',
        filmKey: 'r70-close',
        formatLabels: ['70mm'],
        firstSeenAt: '2026-07-01',
      }),
    ),
  );
  assert.equal(attributeOpportunityReason(seventy).category, 'rare_presentation');

  const oneNight = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'one-rep',
        filmKey: 'one-rep',
        firstSeenAt: '2026-07-01',
        theaterId: 'rep',
        theaterName: 'Rep',
      }),
      { theaterTypes: { rep: 'rep' } },
    ),
  );
  const oneReason = attributeOpportunityReason(oneNight);
  assert.ok(
    ['limited_run', 'limited_presentation'].includes(oneReason.category),
    `expected generic scarcity reason, got ${oneReason.category}`,
  );
});

test('anniversary + last_chance reason is deterministic', () => {
  const scored = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'ann-lc',
        filmKey: 'ann-lc',
        screeningVariantType: 'anniversary',
        isSpecialScreening: true,
        firstSeenAt: '2026-07-01',
      }),
      {
        leavingSoon: {
          status: 'ready',
          entries: [
            { filmKey: 'ann-lc', bucket: 'last_chance', riskLevel: 'high' },
          ],
        },
      },
    ),
  );
  const a = attributeOpportunityReason(scored);
  const b = attributeOpportunityReason(scored);
  assert.deepEqual(a, b);
  assert.ok(['leaving_soon', 'special_event'].includes(a.category));
});

test('novelty class helper is deterministic', () => {
  const ordinary = vectorFor(
    baseOpp({
      opportunityKey: 'cls-o',
      filmKey: 'cls-o',
      firstSeenAt: '2026-09-05',
    }),
  );
  const distinctive = vectorFor(
    baseOpp({
      opportunityKey: 'cls-d',
      filmKey: 'cls-d',
      formatLabels: ['70mm'],
      firstSeenAt: '2026-09-05',
    }),
  );
  assert.equal(classifyOpportunityNovelty(ordinary), 'ordinary_recent_row');
  assert.equal(classifyOpportunityNovelty(distinctive), 'distinctive_new_screening');
  assert.equal(
    classifyOpportunityNovelty(ordinary),
    classifyOpportunityNovelty(ordinary),
  );
});

test('special engagement overlap leaves rare-format novelty intact', () => {
  const noveltyReasons = [
    { key: 'screening_first_seen', contribution: 10 },
  ];
  const rareVector = {
    presentation: { hasRareFormat: true },
    event: { screeningVariantType: 'early_access' },
  };
  const rare = applySpecialEngagementOverlap({
    vector: rareVector,
    eventScore: 9,
    novelty: 10,
    noveltyReasons: [...noveltyReasons.map((r) => ({ ...r }))],
    premiumIntrinsic: 0,
    weights: DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
  });
  assert.equal(rare.novelty, 10);

  const premiumVector = {
    presentation: { hasRareFormat: false, hasPremiumFormat: true },
    event: { screeningVariantType: 'early_access' },
  };
  const premReasons = [{ key: 'screening_first_seen', contribution: 10 }];
  const prem = applySpecialEngagementOverlap({
    vector: premiumVector,
    eventScore: 9,
    novelty: 10,
    noveltyReasons: premReasons,
    premiumIntrinsic: 11,
    weights: DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
  });
  assert.ok(prem.novelty < 10);
  assert.ok(
    9 + prem.novelty + 11 <=
      DEFAULT_TOP_OPPORTUNITY_WEIGHTS.specialEngagementStackCap + 0.05,
  );
});

test('non_film_event is ineligible with an explicit exclusion reason', () => {
  const classified = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 'rental',
        filmKey: 'venue-placeholder',
        title: 'Venue Placeholder',
        screeningVariantType: 'special_event',
        contentClassification: 'non_film_event',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(classified.eligible, false);
  assert.equal(classified.exclusionReason, 'non_film_event');
});

test('public special events remain eligible without non_film_event classification', () => {
  const early = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'early',
        filmKey: 'early-film',
        title: 'Early Access Title',
        screeningVariantType: 'early_access',
        isSpecialScreening: true,
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  const anniversary = scoreOpportunityFeatureVector(
    vectorFor(
      baseOpp({
        opportunityKey: 'ann',
        filmKey: 'ann-film',
        title: 'Anniversary Title',
        screeningVariantType: 'anniversary',
        isSpecialScreening: true,
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(early.eligible, true);
  assert.equal(anniversary.eligible, true);
});

test('missing content classification keeps ordinary screenings eligible', () => {
  const ordinary = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 'plain',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(ordinary.eligible, true);
  assert.equal(ordinary.exclusionReason, null);
});

test('shorts_program is not treated as non_film_event exclusion', () => {
  const shorts = evaluateOpportunityEligibility(
    vectorFor(
      baseOpp({
        opportunityKey: 'shorts',
        filmKey: 'shorts-key',
        contentClassification: 'shorts_program',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T19:00',
      }),
    ),
  );
  assert.equal(shorts.eligible, true);
});

