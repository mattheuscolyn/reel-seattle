import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllOpportunityFeatureVectors,
  buildOpportunityFeatureContext,
  buildOpportunityFeatureVector,
  buildPresentationIdentityKey,
  calendarDaysBetween,
  classifyPresentationFormats,
  isCountableScarcityOpportunity,
  RECENT_SCREENING_FIRST_SEEN_DAYS,
  TOO_IMMINENT_MINUTES,
} from '../../v2/topOpportunities/opportunityFeatureVector.js';
import { selectTopOpportunities } from '../../v2/adapters/selectTopOpportunities.js';
import { pacificSortableDateTime } from '../../v2/showtimes/showtimeEligibility.js';

/**
 * Fixed Pacific wall instant via UTC offset that formats as America/Los_Angeles
 * on typical CI (use pacificSortableDateTime which reads TZ from the Date).
 * 2026-09-05 15:00 PDT ≈ 2026-09-05T22:00:00Z
 */
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
    localDate: '2026-09-06',
    localTime: '19:00',
    sortableLocalDateTime: '2026-09-06T19:00',
    formatLabels: [],
    status: 'active',
    screeningVariantType: 'none',
    isSpecialScreening: false,
    firstSeenAt: '2026-08-20',
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
        showtimeCount: 0,
        theaterCount: 0,
        screeningVariantType: opp.screeningVariantType ?? 'none',
        isSpecialScreening: opp.isSpecialScreening === true,
      });
    }
  }
  for (const opp of opportunities) {
    const film = filmsByKey.get(opp.filmKey);
    film.showtimeCount += 1;
  }
  const theaters = new Set(opportunities.map((o) => o.theaterId));
  for (const film of filmsByKey.values()) {
    film.theaterCount = new Set(
      opportunities
        .filter((o) => o.filmKey === film.filmKey)
        .map((o) => o.theaterId),
    ).size;
  }

  /** @type {Record<string, object>} */
  const theatersById = {};
  for (const id of theaters) {
    theatersById[id] = {
      id,
      name: opportunities.find((o) => o.theaterId === id)?.theaterName ?? id,
      type: 'chain',
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

test('presentation scarcity distinguishes 70mm from ordinary digital', () => {
  const ordinary = Array.from({ length: 30 }, (_, i) =>
    baseOpp({
      opportunityKey: `ord-${i}`,
      localDate: '2026-09-07',
      localTime: `${String(10 + (i % 8)).padStart(2, '0')}:00`,
      sortableLocalDateTime: `2026-09-07T${String(10 + (i % 8)).padStart(2, '0')}:00`,
      formatLabels: ['closed-caption', 'audio-description'],
      theaterId: `theater-${(i % 3) + 1}`,
      theaterName: `Theater ${(i % 3) + 1}`,
    }),
  );
  const seventy = baseOpp({
    opportunityKey: 'seventy-1',
    localDate: '2026-09-08',
    localTime: '20:00',
    sortableLocalDateTime: '2026-09-08T20:00',
    formatLabels: ['70mm'],
    theaterId: 'theater-rep',
    theaterName: 'Rep House',
  });
  const home = homeFromOpps([...ordinary, seventy], {
    theatersById: {
      'theater-1': { id: 'theater-1', name: 'Theater 1', type: 'chain', enabled: true },
      'theater-2': { id: 'theater-2', name: 'Theater 2', type: 'chain', enabled: true },
      'theater-3': { id: 'theater-3', name: 'Theater 3', type: 'chain', enabled: true },
      'theater-rep': { id: 'theater-rep', name: 'Rep House', type: 'rep', enabled: true },
    },
  });
  const ctx = buildOpportunityFeatureContext(home, { now: FIXED_NOW });
  const vector = buildOpportunityFeatureVector(seventy, ctx);

  assert.equal(vector.filmWindow.filmWindowShowtimeCount, 31);
  assert.equal(vector.presentation.presentationShowtimeCount, 1);
  assert.equal(vector.presentation.isUniquePresentation, true);
  assert.equal(vector.presentation.hasRareFormat, true);
  assert.deepEqual(vector.presentation.rareFormats, ['70mm']);
  assert.equal(vector.presentation.hasPremiumFormat, false);
  assert.match(vector.identifiers.presentationKey, /fmt:70mm/);
  assert.equal(vector.reasonAtoms.presentationShowtimeCount, 1);
  assert.equal(vector.reasonAtoms.filmWindowShowtimeCount, 31);

  const ordinaryVector = buildOpportunityFeatureVector(ordinary[0], ctx);
  assert.equal(ordinaryVector.filmWindow.filmWindowShowtimeCount, 31);
  assert.equal(ordinaryVector.presentation.presentationShowtimeCount, 30);
  assert.equal(ordinaryVector.presentation.hasRareFormat, false);
  assert.equal(ordinaryVector.presentation.hasPremiumFormat, false);
  assert.match(ordinaryVector.identifiers.presentationKey, /\|std$/);
});

test('accessibility tags do not create rare or premium presentation identity', () => {
  const classified = classifyPresentationFormats([
    'closed-caption',
    'audio-description',
    'open-caption',
  ]);
  assert.equal(classified.hasRareFormat, false);
  assert.equal(classified.hasPremiumFormat, false);
  assert.equal(classified.hasClosedCaption, true);
  assert.equal(classified.hasOpenCaption, true);
  assert.equal(classified.hasAudioDescription, true);
  assert.deepEqual(classified.rareFormats, []);
  assert.deepEqual(classified.premiumFormats, []);

  const key = buildPresentationIdentityKey({
    filmKey: 'x',
    rareFormats: [],
    premiumFormats: [],
    rareExperiences: [],
    screeningVariantType: 'none',
    isSpecialScreening: false,
  });
  assert.equal(key, 'x|std');
});

test('canonical rare and premium format classification', () => {
  assert.deepEqual(classifyPresentationFormats(['imax-70mm']).rareFormats, [
    'imax-70mm',
  ]);
  assert.equal(classifyPresentationFormats(['70mm']).hasRareFormat, true);
  assert.equal(classifyPresentationFormats(['35mm']).hasRareFormat, true);
  assert.equal(classifyPresentationFormats(['live-score']).hasRareFormat, true);
  assert.deepEqual(
    classifyPresentationFormats(['live-score']).rareExperiences,
    ['live-score'],
  );

  assert.equal(classifyPresentationFormats(['imax-at-amc']).hasPremiumFormat, true);
  assert.deepEqual(classifyPresentationFormats(['imax-at-amc']).premiumFormats, [
    'imax',
  ]);
  assert.deepEqual(
    classifyPresentationFormats(['dolby-cinema-at-amc']).premiumFormats,
    ['dolby-cinema'],
  );
  assert.deepEqual(
    classifyPresentationFormats(['xl-at-amc'], { exhibitorHint: 'AMC Pacific Place' })
      .premiumFormats,
    ['xl-amc'],
  );
  assert.deepEqual(classifyPresentationFormats(['reald-3d']).premiumFormats, [
    'reald-3d',
  ]);

  // Accessibility never flips rare/premium.
  const mixed = classifyPresentationFormats([
    'closed-caption',
    'audio-description',
    'imax-at-amc',
  ]);
  assert.equal(mixed.hasPremiumFormat, true);
  assert.equal(mixed.hasRareFormat, false);
  assert.equal(mixed.hasClosedCaption, true);
  assert.equal(mixed.hasAudioDescription, true);
});

test('structured event variant flags', () => {
  const home = homeFromOpps([
    baseOpp({
      opportunityKey: 'ann',
      screeningVariantType: 'anniversary',
      isSpecialScreening: true,
    }),
  ]);
  const vector = buildOpportunityFeatureVector(
    home.opportunities[0],
    buildOpportunityFeatureContext(home, { now: FIXED_NOW }),
  );
  assert.equal(vector.event.isAnniversary, true);
  assert.equal(vector.event.isEventVariant, true);
  assert.equal(vector.event.isSpecialScreening, true);
  assert.deepEqual(vector.reasonAtoms.eventTypes, ['anniversary']);
});

test('novelty distinguishes film×theater announce from screening first-seen', () => {
  const oldOrdinary = baseOpp({
    opportunityKey: 'old',
    formatLabels: [],
    firstSeenAt: '2026-07-01',
    localDate: '2026-09-10',
    sortableLocalDateTime: '2026-09-10T19:00',
  });
  const newSeventy = baseOpp({
    opportunityKey: 'new-70',
    formatLabels: ['70mm'],
    firstSeenAt: '2026-09-04',
    localDate: '2026-09-09',
    localTime: '20:00',
    sortableLocalDateTime: '2026-09-09T20:00',
    theaterId: 'theater-2',
    theaterName: 'Theater Two',
  });
  const home = homeFromOpps([oldOrdinary, newSeventy], {
    newlyAddedPairs: [
      {
        filmKey: 'film-a',
        theaterId: 'theater-2',
        firstAnnouncedDate: '2026-09-03',
        lastSeenDate: '2026-09-05',
      },
    ],
    theatersById: {
      'theater-1': { id: 'theater-1', name: 'Theater One', type: 'chain', enabled: true },
      'theater-2': { id: 'theater-2', name: 'Theater Two', type: 'indie', enabled: true },
    },
  });
  const ctx = buildOpportunityFeatureContext(home, { now: FIXED_NOW });
  const oldV = buildOpportunityFeatureVector(oldOrdinary, ctx);
  const newV = buildOpportunityFeatureVector(newSeventy, ctx);

  assert.equal(oldV.novelty.isNewlyAddedAtTheater, false);
  assert.equal(oldV.novelty.isRecentlyObservedScreening, false);
  assert.equal(oldV.novelty.daysSinceScreeningFirstSeen > RECENT_SCREENING_FIRST_SEEN_DAYS, true);

  assert.equal(newV.novelty.isNewlyAddedAtTheater, true);
  assert.equal(newV.novelty.firstAnnouncedDate, '2026-09-03');
  assert.equal(newV.novelty.daysSinceFilmTheaterAnnouncement, 2);
  assert.equal(newV.novelty.isRecentlyObservedScreening, true);
  assert.equal(newV.novelty.daysSinceScreeningFirstSeen, 1);
  assert.equal(newV.presentation.hasRareFormat, true);
});

test('leaving-soon buckets and missing model record', () => {
  const opp = baseOpp({ filmKey: 'leaving-film', opportunityKey: 'l1' });
  const withModel = homeFromOpps([opp], {
    leavingSoon: {
      status: 'ready',
      reason: null,
      entries: [
        {
          filmKey: 'leaving-film',
          bucket: 'last_chance',
          riskLevel: 'high',
          maxShowDate: '2026-09-08',
        },
      ],
    },
  });
  const v1 = buildOpportunityFeatureVector(
    opp,
    buildOpportunityFeatureContext(withModel, { now: FIXED_NOW }),
  );
  assert.equal(v1.leavingSoon.hasLeavingSoonModelSignal, true);
  assert.equal(v1.leavingSoon.leavingSoonBucket, 'last_chance');
  assert.equal(v1.reasonAtoms.isLastChanceBucket, true);
  assert.equal(v1.leavingSoon.daysUntilLeavingSoonMaxShowDate, 3);

  const elevated = homeFromOpps([opp], {
    leavingSoon: {
      status: 'ready',
      entries: [
        {
          filmKey: 'leaving-film',
          bucket: 'leaving_soon',
          riskLevel: 'elevated',
          maxShowDate: '2026-09-15',
        },
      ],
    },
  });
  const v2 = buildOpportunityFeatureVector(
    opp,
    buildOpportunityFeatureContext(elevated, { now: FIXED_NOW }),
  );
  assert.equal(v2.leavingSoon.leavingSoonBucket, 'leaving_soon');
  assert.equal(v2.reasonAtoms.isLeavingSoon, true);

  const none = homeFromOpps([opp]);
  const v3 = buildOpportunityFeatureVector(
    opp,
    buildOpportunityFeatureContext(none, { now: FIXED_NOW }),
  );
  assert.equal(v3.leavingSoon.hasLeavingSoonModelSignal, false);
  assert.equal(v3.leavingSoon.leavingSoonBucket, null);
  assert.equal(v3.leavingSoon.leavingSoonModelAvailable, false);
});

test('temporal features with injected Pacific now', () => {
  // FIXED_NOW → Pacific 2026-09-05 afternoon.
  const tonight = baseOpp({
    opportunityKey: 'tonight',
    localDate: '2026-09-05',
    localTime: '20:00',
    sortableLocalDateTime: '2026-09-05T20:00',
  });
  const tomorrow = baseOpp({
    opportunityKey: 'tmr',
    localDate: '2026-09-06',
    localTime: '14:00',
    sortableLocalDateTime: '2026-09-06T14:00',
  });
  const weekend = baseOpp({
    opportunityKey: 'wk',
    localDate: '2026-09-06', // Sunday
    localTime: '18:00',
    sortableLocalDateTime: '2026-09-06T18:00',
  });
  const past = baseOpp({
    opportunityKey: 'past',
    localDate: '2026-09-05',
    localTime: '10:00',
    sortableLocalDateTime: '2026-09-05T10:00',
  });
  const imminent = baseOpp({
    opportunityKey: 'soon',
    localDate: '2026-09-05',
    localTime: '15:30',
    sortableLocalDateTime: '2026-09-05T15:30',
  });

  const home = homeFromOpps([tonight, tomorrow, weekend, past, imminent]);
  const ctx = buildOpportunityFeatureContext(home, { now: FIXED_NOW });

  const t = buildOpportunityFeatureVector(tonight, ctx);
  assert.equal(t.temporal.isToday, true);
  assert.equal(t.temporal.isTonight, true);
  assert.equal(t.temporal.isEvening, true);
  assert.equal(t.temporal.isPast, false);

  const tm = buildOpportunityFeatureVector(tomorrow, ctx);
  assert.equal(tm.temporal.isTomorrow, true);
  assert.equal(tm.temporal.daysUntil, 1);

  const w = buildOpportunityFeatureVector(weekend, ctx);
  assert.equal(w.temporal.isWeekend, true);
  assert.equal(w.temporal.isCurrentWeekend, true);

  const p = buildOpportunityFeatureVector(past, ctx);
  assert.equal(p.temporal.isPast, true);
  assert.ok(p.temporal.hoursUntil < 0);

  const im = buildOpportunityFeatureVector(imminent, ctx);
  assert.equal(im.temporal.isTooImminent, true);
  assert.ok(im.temporal.minutesUntil < TOO_IMMINENT_MINUTES);
  assert.ok(im.temporal.minutesUntil >= 0);
});

test('opening / repertory evidence atoms stay independent', () => {
  const opp = baseOpp({
    filmKey: 'classic',
    filmId: 'tmdb:42',
    theaterId: 'rep-1',
    theaterName: 'SIFF Uptown',
  });
  const home = homeFromOpps([opp], {
    theatersById: {
      'rep-1': { id: 'rep-1', name: 'SIFF Uptown', type: 'rep', enabled: true },
    },
    openingThisWeek: {
      week: { start_date: '2026-08-31', end_date: '2026-09-06' },
      entries: [
        {
          showtimeFilmKey: 'classic',
          parentFilmKey: 'classic',
          openingType: 'repertory',
          openingDate: '2026-09-05',
          engagementDays: 2,
          historicalScreeningCount: 1,
        },
      ],
    },
  });
  const enrichmentIndex = {
    byFilmId: new Map([
      [
        'tmdb:42',
        {
          film_id: 'tmdb:42',
          release_year: 1975,
          release_date: '1975-06-20',
        },
      ],
    ]),
  };
  const vector = buildOpportunityFeatureVector(
    opp,
    buildOpportunityFeatureContext(home, { now: FIXED_NOW, enrichmentIndex }),
  );
  assert.equal(vector.opening.openingType, 'repertory');
  assert.equal(vector.opening.isOpeningThisWeek, true);
  assert.equal(vector.opening.releaseYear, 1975);
  assert.equal(vector.opening.filmAgeYears, 51);
  assert.equal(vector.opening.isOlderFilm, true);
  assert.equal(vector.theater.isRep, true);
  assert.equal(vector.reasonAtoms.openingType, 'repertory');
  assert.equal(vector.reasonAtoms.isOlderFilm, true);
  assert.equal(vector.reasonAtoms.isRepVenue, true);
});

test('missing metadata yields safe nulls/false without NaN', () => {
  const sparse = {
    opportunityKey: 'sparse',
    filmKey: 'sparse-film',
    theaterId: 't1',
    theaterName: 'T1',
    localDate: '2026-09-10',
    localTime: '19:00',
    sortableLocalDateTime: '2026-09-10T19:00',
    formatLabels: null,
    status: 'active',
  };
  const home = {
    films: [],
    opportunities: [sparse],
    theatersById: {},
    newlyAdded: [],
    newlyAddedPairs: [],
    leavingSoon: { status: 'unavailable', entries: [], reason: 'missing' },
    openingThisWeek: { entries: [] },
  };
  const vector = buildOpportunityFeatureVector(
    sparse,
    buildOpportunityFeatureContext(home, { now: FIXED_NOW }),
  );
  const json = JSON.stringify(vector);
  assert.equal(json.includes('NaN'), false);
  assert.equal(json.includes('Infinity'), false);
  assert.equal(vector.presentation.hasRareFormat, false);
  assert.equal(vector.leavingSoon.hasLeavingSoonModelSignal, false);
  assert.equal(vector.novelty.firstAnnouncedDate, null);
  assert.equal(vector.opening.releaseYear, null);
  assert.equal(vector.eligibilityInputs.hasSortableLocalDateTime, true);
});

test('feature vectors are deterministic for identical inputs', () => {
  const opps = [
    baseOpp({
      opportunityKey: 'a',
      formatLabels: ['imax-at-amc', 'closed-caption', '70mm'],
    }),
    baseOpp({
      opportunityKey: 'b',
      filmKey: 'film-b',
      title: 'Film B',
      formatLabels: ['dolby-cinema-at-amc', 'audio-description'],
      sortableLocalDateTime: '2026-09-07T19:00',
      localDate: '2026-09-07',
    }),
  ];
  const home = homeFromOpps(opps);
  const a = buildAllOpportunityFeatureVectors(home, { now: FIXED_NOW });
  const b = buildAllOpportunityFeatureVectors(home, { now: FIXED_NOW });
  assert.deepEqual(a, b);
  assert.deepEqual(a[0].presentation.rareFormats, ['70mm']);
  assert.deepEqual(a[0].presentation.premiumFormats, ['imax']);
});

test('selectTopOpportunities behavior is unchanged by feature-vector plumbing', () => {
  const candidates = [
    {
      opportunityKey: 'n1',
      filmKey: 'new',
      title: 'New',
      theaterId: 't1',
      theaterName: 'T1',
      sortableLocalDateTime: '2026-09-10T19:00',
      formatLabels: [],
      isNewlyAdded: true,
      filmShowtimeCount: 5,
      filmTheaterCount: 1,
      chronologicalKey: '2026-09-10T19:00|t1|new|n1',
    },
    {
      opportunityKey: 'f1',
      filmKey: 'fmt',
      title: 'Fmt',
      theaterId: 't2',
      theaterName: 'T2',
      sortableLocalDateTime: '2026-09-09T19:00',
      formatLabels: ['IMAX'],
      isNewlyAdded: false,
      filmShowtimeCount: 4,
      filmTheaterCount: 1,
      chronologicalKey: '2026-09-09T19:00|t2|fmt|f1',
    },
    {
      opportunityKey: 'l1',
      filmKey: 'lim',
      title: 'Lim',
      theaterId: 't3',
      theaterName: 'T3',
      sortableLocalDateTime: '2026-09-08T19:00',
      formatLabels: [],
      isNewlyAdded: false,
      filmShowtimeCount: 1,
      filmTheaterCount: 1,
      chronologicalKey: '2026-09-08T19:00|t3|lim|l1',
    },
  ];
  const home = {
    films: candidates.map((c) => ({
      filmKey: c.filmKey,
      title: c.title,
      posterUrl: null,
      runtimeMin: 100,
      showtimeCount: c.filmShowtimeCount,
      theaterCount: c.filmTheaterCount,
    })),
    opportunities: candidates.map((c) => ({
      opportunityKey: c.opportunityKey,
      filmKey: c.filmKey,
      theaterId: c.theaterId,
      theaterName: c.theaterName,
      sortableLocalDateTime: c.sortableLocalDateTime,
      localDate: c.sortableLocalDateTime.slice(0, 10),
      localTime: c.sortableLocalDateTime.slice(11, 16),
      timeDisplay: '7:00 PM',
      formatLabels: c.formatLabels,
      ticketUrl: null,
    })),
    opportunityCandidates: candidates,
  };
  const selected = selectTopOpportunities(home);
  assert.deepEqual(
    selected.map((s) => s.film.filmKey),
    ['new', 'fmt', 'lim'],
  );
});

test('calendarDaysBetween is stable', () => {
  assert.equal(calendarDaysBetween('2026-09-05', '2026-09-08'), 3);
  assert.equal(calendarDaysBetween('2026-09-05', '2026-09-05'), 0);
  assert.equal(calendarDaysBetween('bad', '2026-09-05'), null);
});

test('scarcity aggregates exclude past, canceled, sold_out, and unknown theater', () => {
  const nowSortable = pacificSortableDateTime(FIXED_NOW);
  const remaining = baseOpp({
    opportunityKey: 'remain',
    localDate: '2026-09-06',
    localTime: '19:00',
    sortableLocalDateTime: '2026-09-06T19:00',
    formatLabels: ['70mm'],
  });
  const past = baseOpp({
    opportunityKey: 'past',
    localDate: '2026-09-05',
    localTime: '10:00',
    sortableLocalDateTime: '2026-09-05T10:00',
    formatLabels: ['70mm'],
  });
  const canceled = baseOpp({
    opportunityKey: 'canceled',
    localDate: '2026-09-07',
    sortableLocalDateTime: '2026-09-07T19:00',
    status: 'canceled',
    formatLabels: ['70mm'],
  });
  const soldOut = baseOpp({
    opportunityKey: 'sold',
    localDate: '2026-09-07',
    sortableLocalDateTime: '2026-09-07T20:00',
    status: 'sold_out',
    formatLabels: ['70mm'],
  });
  const unknownTheater = baseOpp({
    opportunityKey: 'unk',
    localDate: '2026-09-08',
    sortableLocalDateTime: '2026-09-08T19:00',
    theaterId: 'ghost',
    theaterName: 'Unknown theater',
    formatLabels: ['70mm'],
  });
  const digitalRemaining = baseOpp({
    opportunityKey: 'dig',
    localDate: '2026-09-09',
    sortableLocalDateTime: '2026-09-09T19:00',
    formatLabels: ['closed-caption'],
  });

  assert.equal(isCountableScarcityOpportunity(remaining, nowSortable), true);
  assert.equal(isCountableScarcityOpportunity(past, nowSortable), false);
  assert.equal(isCountableScarcityOpportunity(canceled, nowSortable), false);
  assert.equal(isCountableScarcityOpportunity(soldOut, nowSortable), false);
  assert.equal(
    isCountableScarcityOpportunity(unknownTheater, nowSortable),
    false,
  );

  const home = homeFromOpps([
    remaining,
    past,
    canceled,
    soldOut,
    unknownTheater,
    digitalRemaining,
  ]);
  const ctx = buildOpportunityFeatureContext(home, { now: FIXED_NOW });
  const seventy = buildOpportunityFeatureVector(remaining, ctx);
  const digital = buildOpportunityFeatureVector(digitalRemaining, ctx);
  const pastVector = buildOpportunityFeatureVector(past, ctx);

  assert.equal(seventy.filmWindow.filmWindowShowtimeCount, 2);
  assert.equal(seventy.presentation.presentationShowtimeCount, 1);
  assert.equal(digital.presentation.presentationShowtimeCount, 1);
  assert.equal(pastVector.temporal.isPast, true);
  // Past rows still vectorize, but scarcity reflects remaining universe only.
  assert.equal(pastVector.filmWindow.filmWindowShowtimeCount, 2);
  assert.equal(pastVector.eligibilityInputs.isSoldOut, false);
  assert.equal(
    buildOpportunityFeatureVector(soldOut, ctx).eligibilityInputs.isSoldOut,
    true,
  );
});

test('presentation identity is stable across raw tag order', () => {
  const a = classifyPresentationFormats([
    'closed-caption',
    '70mm',
    'imax-at-amc',
  ]);
  const b = classifyPresentationFormats([
    'imax-at-amc',
    '70mm',
    'closed-caption',
  ]);
  assert.deepEqual(a.rareFormats, b.rareFormats);
  assert.deepEqual(a.premiumFormats, b.premiumFormats);
  assert.equal(
    buildPresentationIdentityKey({
      filmKey: 'film-a',
      rareFormats: a.rareFormats,
      premiumFormats: a.premiumFormats,
      rareExperiences: a.rareExperiences,
    }),
    buildPresentationIdentityKey({
      filmKey: 'film-a',
      rareFormats: b.rareFormats,
      premiumFormats: b.premiumFormats,
      rareExperiences: b.rareExperiences,
    }),
  );
});

test('malformed novelty timestamps do not mark screening as recent', () => {
  const opp = baseOpp({
    firstSeenAt: 'not-a-date',
    opportunityKey: 'bad-seen',
  });
  const home = homeFromOpps([opp], {
    newlyAddedPairs: [
      {
        filmKey: 'film-a',
        theaterId: 'theater-1',
        firstAnnouncedDate: 'garbage',
        lastSeenDate: null,
      },
    ],
  });
  const vector = buildOpportunityFeatureVector(
    opp,
    buildOpportunityFeatureContext(home, { now: FIXED_NOW }),
  );
  assert.equal(vector.novelty.isNewlyAddedAtTheater, true);
  assert.equal(vector.novelty.daysSinceFilmTheaterAnnouncement, null);
  assert.equal(vector.novelty.daysSinceScreeningFirstSeen, null);
  assert.equal(vector.novelty.isRecentlyObservedScreening, false);
  const json = JSON.stringify(vector);
  assert.equal(json.includes('NaN'), false);
});
