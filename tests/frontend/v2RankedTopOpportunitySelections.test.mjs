import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTopOpportunities } from '../../v2/adapters/selectTopOpportunities.js';
import {
  adaptRankedOpportunityForHome,
  buildRankedTopOpportunitySelections,
} from '../../v2/topOpportunities/buildRankedTopOpportunitySelections.js';
import { buildRankedTopOpportunityCandidates } from '../../v2/topOpportunities/opportunityRanking.js';
import {
  presentRankedOpportunityReason,
  presentSupportingRankedReasons,
  rankedReasonLabel,
} from '../../v2/topOpportunities/rankedOpportunityReasonLabels.js';

const FIXED_NOW = new Date('2026-09-05T22:00:00.000Z');

function opp(overrides = {}) {
  return {
    opportunityKey: 'opp-70',
    filmKey: 'film-70',
    parentFilmKey: 'film-70',
    filmId: 'film-70-id',
    title: 'Rare Print',
    theaterId: 'theater-rep',
    theaterName: 'Rep House',
    localDate: '2026-09-08',
    localTime: '20:00',
    timeDisplay: '8:00 PM',
    sortableLocalDateTime: '2026-09-08T20:00',
    formatLabels: ['70mm'],
    status: 'active',
    screeningVariantType: 'none',
    isSpecialScreening: false,
    firstSeenAt: '2026-07-01',
    ticketUrl: 'https://example.com/tickets/70',
    source: 'siiff',
    ...overrides,
  };
}

function homeFrom(opportunities, extras = {}) {
  const filmsByKey = new Map();
  for (const item of opportunities) {
    if (!filmsByKey.has(item.filmKey)) {
      filmsByKey.set(item.filmKey, {
        filmKey: item.filmKey,
        parentFilmKey: item.parentFilmKey ?? item.filmKey,
        title: item.title ?? item.filmKey,
        filmId: item.filmId ?? null,
        posterUrl: extras.posterUrl ?? 'https://example.com/poster.jpg',
        runtimeMin: extras.runtimeMin ?? 118,
        contentClassification: item.contentClassification ?? null,
        showtimeCount: opportunities.filter((o) => o.filmKey === item.filmKey)
          .length,
        theaterCount: new Set(
          opportunities
            .filter((o) => o.filmKey === item.filmKey)
            .map((o) => o.theaterId),
        ).size,
      });
    }
  }
  const theatersById = {};
  for (const item of opportunities) {
    theatersById[item.theaterId] = {
      id: item.theaterId,
      name: item.theaterName,
      type: extras.theaterTypes?.[item.theaterId] ?? 'rep',
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
    leavingSoon: extras.leavingSoon ?? { status: 'empty', entries: [], reason: null },
    openingThisWeek: { entries: [], week: null },
    opportunityCandidates: opportunities.map((item) => ({
      opportunityKey: item.opportunityKey,
      filmKey: item.filmKey,
      title: item.title,
      theaterId: item.theaterId,
      theaterName: item.theaterName,
      sortableLocalDateTime: item.sortableLocalDateTime,
      formatLabels: item.formatLabels ?? [],
      isNewlyAdded: false,
      filmShowtimeCount: filmsByKey.get(item.filmKey)?.showtimeCount ?? 1,
      filmTheaterCount: filmsByKey.get(item.filmKey)?.theaterCount ?? 1,
      chronologicalKey: `${item.sortableLocalDateTime}|${item.theaterId}|${item.filmKey}|${item.opportunityKey}`,
    })),
    ...extras,
  };
}

function vectorFromOpp(item, extras = {}) {
  return {
    identifiers: {
      opportunityKey: item.opportunityKey,
      filmKey: item.filmKey,
      parentFilmKey: item.parentFilmKey,
      filmId: item.filmId,
      title: item.title,
      theaterId: item.theaterId,
      theaterName: item.theaterName,
      localDate: item.localDate,
      localTime: item.localTime,
      sortableLocalDateTime: item.sortableLocalDateTime,
    },
    presentation: {
      canonicalFormatLabels: item.formatLabels ?? [],
      rareFormats: extras.rareFormats ?? [],
      rareExperiences: extras.rareExperiences ?? [],
      presentationShowtimeCount: extras.presentationShowtimeCount ?? 1,
    },
    filmWindow: {
      filmWindowShowtimeCount: extras.filmWindowShowtimeCount ?? 1,
      filmWindowTheaterCount: 1,
    },
    event: {
      screeningVariantType: item.screeningVariantType ?? 'none',
    },
    leavingSoon: {
      leavingSoonBucket: extras.leavingSoonBucket ?? null,
    },
  };
}

function scoredStub(item, reason, extras = {}) {
  const vector = vectorFromOpp(item, extras);
  return {
    vector,
    totalScore: extras.totalScore ?? 40,
    selectionScore: extras.selectionScore ?? 40,
    diversificationPenalty: 0,
    noveltyClass: extras.noveltyClass ?? 'stale',
    components: {
      presentationRarity: { score: extras.rarityScore ?? 12 },
      novelty: { noveltyClass: extras.noveltyClass ?? 'stale', score: 0 },
    },
    dominantReason: {
      category: reason.category,
      labelKey: reason.labelKey,
      score: 12,
      salience: 18,
      evidence: reason.evidence ?? {},
      supportingReasons: reason.supportingReasons ?? [],
    },
  };
}

function adaptedLabel(reason, extras = {}) {
  const item = opp(extras.opp ?? {});
  return adaptRankedOpportunityForHome(
    scoredStub(item, reason, extras),
    homeFrom([item]),
    { rawRank: 1, selectedRank: 1 },
  );
}

test('ranked screening maps to exact theater, time, and format', () => {
  const ordinary = opp({
    opportunityKey: 'opp-std',
    formatLabels: [],
    localDate: '2026-09-07',
    localTime: '14:00',
    timeDisplay: '2:00 PM',
    sortableLocalDateTime: '2026-09-07T14:00',
    theaterId: 'theater-chain',
    theaterName: 'Chainplex',
  });
  const rare = opp();
  const home = homeFrom([ordinary, rare], {
    theaterTypes: { 'theater-chain': 'chain', 'theater-rep': 'rep' },
  });
  const { selections } = buildRankedTopOpportunitySelections(home, {
    now: FIXED_NOW,
    topN: 1,
  });
  assert.equal(selections.length, 1);
  const selection = selections[0];
  assert.equal(selection.representativeOpportunity.opportunityKey, 'opp-70');
  assert.equal(selection.representativeOpportunity.theaterId, 'theater-rep');
  assert.equal(selection.representativeOpportunity.theaterName, 'Rep House');
  assert.equal(selection.representativeOpportunity.sortableLocalDateTime, '2026-09-08T20:00');
  assert.equal(selection.representativeOpportunity.localDate, '2026-09-08');
  assert.equal(selection.representativeOpportunity.localTime, '20:00');
  assert.deepEqual(selection.representativeOpportunity.formatLabels, ['70mm']);
  assert.equal(selection.representativeOpportunity.ticketUrl, 'https://example.com/tickets/70');
});

test('rank metadata and reason metadata are preserved', () => {
  const home = homeFrom([opp()]);
  const { selections } = buildRankedTopOpportunitySelections(home, {
    now: FIXED_NOW,
    topN: 1,
  });
  const selection = selections[0];
  assert.equal(selection.selectionReasonCode, 'rare_presentation');
  assert.equal(selection.selectionReasonLabelKey, 'rare_70mm');
  assert.equal(selection.selectionReasonLabel, 'Rare 70mm presentation');
  assert.ok(Array.isArray(selection.supportingReasonCodes));
  assert.ok(Array.isArray(selection.supportingReasons));
  assert.equal(selection.ranking.selectedRank, 1);
  assert.equal(selection.ranking.rawRank, 1);
  assert.ok(selection.ranking.rawScore > 0);
  assert.equal(selection.ranking.diversificationPenalty, 0);
  assert.equal(selection.ranking.dominantReason.category, 'rare_presentation');
  assert.ok(Array.isArray(selection.ranking.supportingReasons));
  assert.equal(typeof selection.ranking.components.presentationRarity, 'number');
});

test('missing enrichment is safe', () => {
  const bare = opp({
    filmId: null,
    ticketUrl: null,
  });
  const home = homeFrom([bare], { posterUrl: null, runtimeMin: null });
  home.films = home.films.map((film) => ({
    ...film,
    posterUrl: null,
    runtimeMin: null,
    filmId: null,
  }));
  const { selections } = buildRankedTopOpportunitySelections(home, {
    now: FIXED_NOW,
    topN: 1,
  });
  const selection = selections[0];
  assert.equal(selection.film.posterUrl, null);
  assert.equal(selection.film.runtimeMin, null);
  assert.equal(selection.film.backdropUrl, null);
  assert.equal(selection.representativeOpportunity.ticketUrl, null);
  assert.equal(selection.film.title, 'Rare Print');
});

test('adapter does not depend on live selector output', () => {
  const source = homeFrom([
    opp(),
    opp({
      opportunityKey: 'opp-new',
      filmKey: 'film-new',
      title: 'New Ordinary',
      formatLabels: [],
      firstSeenAt: '2026-09-04',
      theaterId: 'theater-2',
      theaterName: 'Theater Two',
      localDate: '2026-09-07',
      sortableLocalDateTime: '2026-09-07T19:00',
    }),
  ]);
  const live = selectTopOpportunities(source);
  const ranked = buildRankedTopOpportunitySelections(source, {
    now: FIXED_NOW,
    topN: 3,
  });
  assert.ok(Array.isArray(live));
  assert.ok(ranked.selections.length >= 1);
  assert.equal(typeof ranked.selections[0].ranking.rawScore, 'number');
  assert.equal(live[0]?.ranking, undefined);
  assert.ok(
    ranked.selections[0].selectionReasonCode === 'rare_presentation' ||
      ranked.selections[0].representativeOpportunity.formatLabels.includes('70mm'),
  );
});

test('adaptRankedOpportunityForHome is deterministic', () => {
  const home = homeFrom([opp()]);
  const ranked = buildRankedTopOpportunityCandidates(home, {
    now: FIXED_NOW,
    topN: 1,
  });
  const a = adaptRankedOpportunityForHome(ranked.selected[0], home, {
    rawRank: 1,
    selectedRank: 1,
  });
  const b = adaptRankedOpportunityForHome(ranked.selected[0], home, {
    rawRank: 1,
    selectedRank: 1,
  });
  assert.deepEqual(a, b);
});

test('empty home yields empty selections without throwing', () => {
  const empty = buildRankedTopOpportunitySelections(
    {
      films: [],
      opportunities: [],
      theatersById: {},
      newlyAdded: [],
      newlyAddedPairs: [],
      leavingSoon: { status: 'empty', entries: [], reason: null },
      openingThisWeek: { entries: [], week: null },
    },
    { now: FIXED_NOW, topN: 3 },
  );
  assert.deepEqual(empty.selections, []);
  assert.equal(empty.counts.selected, 0);
});

test('last_chance maps to Last chance; leaving_soon stays Leaving soon', () => {
  const last = adaptedLabel({
    category: 'leaving_soon',
    labelKey: 'last_chance_bucket',
    evidence: { bucket: 'last_chance' },
  });
  assert.equal(last.selectionReasonCode, 'leaving_soon');
  assert.equal(last.selectionReasonLabelKey, 'last_chance');
  assert.equal(last.selectionReasonLabel, 'Last chance');

  const soon = adaptedLabel({
    category: 'leaving_soon',
    labelKey: 'leaving_soon_bucket',
    evidence: { bucket: 'leaving_soon' },
  });
  assert.equal(soon.selectionReasonLabel, 'Leaving soon');
});

test('rare presentation labels use structured format evidence', () => {
  const seventy = adaptedLabel(
    {
      category: 'rare_presentation',
      labelKey: 'rare_70mm',
      evidence: { rareFormats: ['70mm'] },
    },
    { rareFormats: ['70mm'] },
  );
  assert.equal(seventy.selectionReasonCode, 'rare_presentation');
  assert.equal(seventy.selectionReasonLabel, 'Rare 70mm presentation');

  const thirtyFive = adaptedLabel(
    {
      category: 'rare_presentation',
      labelKey: 'rare_35mm',
      evidence: { rareFormats: ['35mm'] },
    },
    { rareFormats: ['35mm'], opp: { formatLabels: ['35mm'] } },
  );
  assert.equal(thirtyFive.selectionReasonLabel, 'Rare 35mm presentation');

  const imax70 = adaptedLabel(
    {
      category: 'rare_presentation',
      labelKey: 'rare_imax-70mm',
      evidence: { rareFormats: ['imax-70mm'] },
    },
    { rareFormats: ['imax-70mm'], opp: { formatLabels: ['IMAX 70mm'] } },
  );
  assert.equal(imax70.selectionReasonLabel, 'Rare IMAX 70mm presentation');

  const liveScore = adaptedLabel(
    {
      category: 'rare_presentation',
      labelKey: 'rare_live-score',
      evidence: { rareFormats: [], rareExperiences: ['live-score'] },
    },
    { rareExperiences: ['live-score'], opp: { formatLabels: ['Live Score'] } },
  );
  assert.equal(liveScore.selectionReasonLabel, 'Live score presentation');

  assert.equal(
    rankedReasonLabel({
      category: 'rare_presentation',
      evidence: { rareFormats: ['dolby-cinema'] },
    }),
    'Rare presentation',
  );
});

test('special event labels use structured event variants with fallback', () => {
  const cases = [
    ['early_access', 'Early access'],
    ['anniversary', 'Anniversary screening'],
    ['double_feature', 'Double feature'],
    ['live_encore', 'Live encore'],
    ['fan_event', 'Fan event'],
    ['special_event', 'Special event'],
  ];
  for (const [variant, label] of cases) {
    const selection = adaptedLabel({
      category: 'special_event',
      labelKey: variant,
      evidence: { screeningVariantType: variant },
    });
    assert.equal(selection.selectionReasonCode, 'special_event');
    assert.equal(selection.selectionReasonLabel, label, variant);
  }
});

test('newly announced, repertory, and showing soon labels are stable', () => {
  assert.equal(
    adaptedLabel({
      category: 'newly_announced',
      labelKey: 'recent_screening',
      evidence: { noveltyClass: 'distinctive_new_screening' },
    }).selectionReasonLabel,
    'Newly announced',
  );
  assert.equal(
    adaptedLabel({
      category: 'repertory_event',
      labelKey: 'repertory_evidence',
      evidence: { isRep: true },
    }).selectionReasonLabel,
    'Repertory screening',
  );
  assert.equal(
    adaptedLabel({
      category: 'showing_soon',
      labelKey: 'temporal_actionability',
      evidence: { hoursUntil: 40 },
    }).selectionReasonLabel,
    'Showing soon',
  );
});

test('limited presentation and limited run distinguish one screening', () => {
  const onePresentation = adaptedLabel(
    {
      category: 'limited_presentation',
      labelKey: 'limited_presentation',
      evidence: { presentationShowtimeCount: 1 },
    },
    { presentationShowtimeCount: 1 },
  );
  assert.equal(onePresentation.selectionReasonLabel, 'One screening');

  const limitedPresentations = adaptedLabel(
    {
      category: 'limited_presentation',
      labelKey: 'limited_presentation',
      evidence: { presentationShowtimeCount: 2 },
    },
    { presentationShowtimeCount: 2 },
  );
  assert.equal(limitedPresentations.selectionReasonLabel, 'Limited presentations');

  const oneRun = adaptedLabel(
    {
      category: 'limited_run',
      labelKey: 'limited_run_window',
      evidence: { filmWindowShowtimeCount: 1 },
    },
    { filmWindowShowtimeCount: 1 },
  );
  assert.equal(oneRun.selectionReasonLabel, 'One screening');

  const limitedRun = adaptedLabel(
    {
      category: 'limited_run',
      labelKey: 'limited_run_window',
      evidence: { filmWindowShowtimeCount: 2 },
    },
    { filmWindowShowtimeCount: 2 },
  );
  assert.equal(limitedRun.selectionReasonLabel, 'Limited run');
});

test('supporting labels remain ordered and omit the dominant reason', () => {
  const presented = presentSupportingRankedReasons({
    category: 'rare_presentation',
    supportingReasons: [
      {
        category: 'newly_announced',
        labelKey: 'recent_screening',
        evidence: {},
      },
      {
        category: 'limited_run',
        labelKey: 'limited_run_window',
        evidence: { filmWindowShowtimeCount: 2 },
      },
      {
        category: 'rare_presentation',
        labelKey: 'rare_70mm',
        evidence: { rareFormats: ['70mm'] },
      },
      {
        category: 'newly_announced',
        labelKey: 'newly_added_at_theater',
        evidence: {},
      },
    ],
  });
  assert.deepEqual(
    presented.map((item) => item.code),
    ['newly_announced', 'limited_run'],
  );
  assert.deepEqual(
    presented.map((item) => item.label),
    ['Newly announced', 'Limited run'],
  );

  const selection = adaptedLabel({
    category: 'rare_presentation',
    labelKey: 'rare_70mm',
    evidence: { rareFormats: ['70mm'] },
    supportingReasons: [
      {
        category: 'newly_announced',
        labelKey: 'recent_screening',
        evidence: {},
      },
      {
        category: 'limited_run',
        labelKey: 'limited_run_window',
        evidence: { filmWindowShowtimeCount: 2 },
      },
    ],
  });
  assert.deepEqual(selection.supportingReasonCodes, [
    'newly_announced',
    'limited_run',
  ]);
  assert.deepEqual(selection.supportingReasons, [
    {
      code: 'newly_announced',
      labelKey: 'newly_announced',
      label: 'Newly announced',
    },
    {
      code: 'limited_run',
      labelKey: 'limited_run',
      label: 'Limited run',
    },
  ]);
});

test('adapter retains exact selected screening while attaching labels', () => {
  const item = opp({
    formatLabels: ['70mm', 'closed-caption'],
  });
  const selection = adaptRankedOpportunityForHome(
    scoredStub(
      item,
      {
        category: 'rare_presentation',
        labelKey: 'rare_70mm',
        evidence: { rareFormats: ['70mm'] },
      },
      { rareFormats: ['70mm'] },
    ),
    homeFrom([item]),
    { rawRank: 2, selectedRank: 1 },
  );
  assert.equal(selection.representativeOpportunity.opportunityKey, 'opp-70');
  assert.equal(selection.representativeOpportunity.theaterName, 'Rep House');
  assert.equal(selection.representativeOpportunity.localDate, '2026-09-08');
  assert.equal(selection.representativeOpportunity.localTime, '20:00');
  assert.deepEqual(selection.representativeOpportunity.formatLabels, [
    '70mm',
    'closed-caption',
  ]);
  assert.equal(selection.selectionReasonLabel, 'Rare 70mm presentation');
  assert.equal(selection.selectionReasonCode, 'rare_presentation');
});

test('reason labels never use accessibility as specialness copy', () => {
  const presented = presentRankedOpportunityReason({
    category: 'rare_presentation',
    evidence: { rareFormats: [] },
  });
  assert.equal(presented.label, 'Rare presentation');
  assert.equal(presented.label.includes('caption'), false);
  assert.equal(presented.label.includes('audio'), false);
});
