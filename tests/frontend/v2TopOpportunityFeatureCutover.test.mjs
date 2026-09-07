import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { clampSelectionIndex } from '../../v2/topOpportunities/topOpportunityFormat.js';
import { buildRankedTopOpportunitySelections } from '../../v2/topOpportunities/buildRankedTopOpportunitySelections.js';
import { createInitialNavState, navigateBack, openFilmDetail } from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXED_NOW = new Date('2026-09-05T22:00:00.000Z');
const FEATURE_SRC = readFileSync(
  join(ROOT, 'v2/home/TopOpportunityFeature.jsx'),
  'utf8',
);

function opp(overrides = {}) {
  return {
    opportunityKey: overrides.opportunityKey ?? 'opp-1',
    filmKey: overrides.filmKey ?? 'film-a',
    parentFilmKey: overrides.parentFilmKey ?? overrides.filmKey ?? 'film-a',
    filmId: overrides.filmId ?? null,
    title: overrides.title ?? 'Film A',
    theaterId: overrides.theaterId ?? 'theater-1',
    theaterName: overrides.theaterName ?? 'Theater One',
    localDate: overrides.localDate ?? '2026-09-08',
    localTime: overrides.localTime ?? '20:00',
    timeDisplay: overrides.timeDisplay ?? '8:00 PM',
    sortableLocalDateTime:
      overrides.sortableLocalDateTime ??
      `${overrides.localDate ?? '2026-09-08'}T${(overrides.localTime ?? '20:00').slice(0, 5)}`,
    formatLabels: overrides.formatLabels ?? [],
    status: overrides.status ?? 'active',
    screeningVariantType: overrides.screeningVariantType ?? 'none',
    isSpecialScreening: overrides.isSpecialScreening === true,
    contentClassification: overrides.contentClassification ?? null,
    firstSeenAt: overrides.firstSeenAt ?? '2026-08-01',
    ticketUrl: overrides.ticketUrl ?? null,
    source: overrides.source ?? 'amc',
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
        screeningVariantType: item.screeningVariantType ?? 'none',
        isSpecialScreening: item.isSpecialScreening === true,
        showtimeCount: 0,
        theaterCount: 0,
      });
    }
  }
  for (const item of opportunities) {
    filmsByKey.get(item.filmKey).showtimeCount += 1;
  }
  for (const film of filmsByKey.values()) {
    film.theaterCount = new Set(
      opportunities.filter((o) => o.filmKey === film.filmKey).map((o) => o.theaterId),
    ).size;
  }
  /** @type {Record<string, object>} */
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
    newlyAdded: extras.newlyAdded ?? [],
    newlyAddedPairs: extras.newlyAddedPairs ?? [],
    leavingSoon: extras.leavingSoon ?? { status: 'empty', entries: [], reason: null },
    openingThisWeek: extras.openingThisWeek ?? { entries: [], week: null },
    ...extras,
  };
}

function ranked(home, topN = 3) {
  return buildRankedTopOpportunitySelections(home, { now: FIXED_NOW, topN });
}

test('live TopOpportunityFeature uses ranked selections, not the legacy selector', () => {
  assert.match(FEATURE_SRC, /buildRankedTopOpportunitySelections/);
  assert.equal(FEATURE_SRC.includes('selectTopOpportunities('), false);
  assert.equal(FEATURE_SRC.includes("from '../adapters/selectTopOpportunities.js'"), false);
  assert.match(FEATURE_SRC, /data-source=/);
  assert.match(FEATURE_SRC, /rankedTopOpportunities/);
  assert.match(FEATURE_SRC, /selectionReasonLabel/);
  assert.match(FEATURE_SRC, /representativeOpportunity\?\.opportunityKey/);
  assert.match(FEATURE_SRC, /Featured/);
  assert.equal(FEATURE_SRC.includes('ranking.rawScore'), false);
  assert.equal(FEATURE_SRC.includes('eligibilityInputs'), false);
});

test('rare presentation keeps the ranked theater, time, and format, not the earliest row', () => {
  const home = homeFrom([
    opp({
      opportunityKey: 'opp-early',
      filmKey: 'print-film',
      title: 'Print Film',
      theaterId: 'theater-chain',
      theaterName: 'Chainplex',
      localDate: '2026-09-07',
      localTime: '10:00',
      timeDisplay: '10:00 AM',
      sortableLocalDateTime: '2026-09-07T10:00',
      formatLabels: [],
    }),
    opp({
      opportunityKey: 'opp-70',
      filmKey: 'print-film',
      title: 'Print Film',
      theaterId: 'theater-rep',
      theaterName: 'Rep House',
      localDate: '2026-09-08',
      localTime: '20:00',
      timeDisplay: '8:00 PM',
      sortableLocalDateTime: '2026-09-08T20:00',
      formatLabels: ['70mm'],
    }),
  ], { theaterTypes: { 'theater-chain': 'chain', 'theater-rep': 'rep' } });
  const { selections } = ranked(home, 1);
  assert.equal(selections.length, 1);
  const selected = selections[0];
  assert.equal(selected.representativeOpportunity.opportunityKey, 'opp-70');
  assert.equal(selected.representativeOpportunity.theaterName, 'Rep House');
  assert.equal(selected.representativeOpportunity.localDate, '2026-09-08');
  assert.equal(selected.representativeOpportunity.localTime, '20:00');
  assert.deepEqual(selected.representativeOpportunity.formatLabels, ['70mm']);
  assert.equal(selected.selectionReasonCode, 'rare_presentation');
  assert.equal(selected.selectionReasonLabel, 'Rare 70mm presentation');
});

test('ranked reason labels used by the live path', () => {
  const lastChance = ranked(
    homeFrom(
      [
        opp({
          opportunityKey: 'opp-last',
          filmKey: 'leaving-film',
          title: 'Leaving Film',
        }),
      ],
      {
        leavingSoon: {
          status: 'ready',
          entries: [
            {
              filmKey: 'leaving-film',
              bucket: 'last_chance',
              riskLevel: 'high',
              maxShowDate: '2026-09-08',
            },
          ],
        },
      },
    ),
    1,
  ).selections[0];
  assert.equal(lastChance.selectionReasonLabel, 'Last chance');

  const early = ranked(
    homeFrom([
      opp({
        opportunityKey: 'opp-early-access',
        filmKey: 'early-film',
        title: 'Early Film',
        screeningVariantType: 'early_access',
        isSpecialScreening: true,
      }),
    ]),
    1,
  ).selections[0];
  assert.equal(early.selectionReasonCode, 'special_event');
  assert.equal(early.selectionReasonLabel, 'Early access');

  const seventy = ranked(
    homeFrom([
      opp({
        opportunityKey: 'opp-70',
        formatLabels: ['70mm'],
      }),
    ]),
    1,
  ).selections[0];
  assert.equal(seventy.selectionReasonLabel, 'Rare 70mm presentation');
});

test('past and non_film_event screenings are not selected; public specials remain', () => {
  const mixed = ranked(
    homeFrom([
      opp({
        opportunityKey: 'opp-past',
        filmKey: 'past-film',
        title: 'Past Film',
        localDate: '2026-09-05',
        localTime: '10:00',
        sortableLocalDateTime: '2026-09-05T10:00',
        formatLabels: ['70mm'],
      }),
      opp({
        opportunityKey: 'opp-rental',
        filmKey: 'venue-placeholder',
        title: 'Venue Placeholder',
        screeningVariantType: 'special_event',
        contentClassification: 'non_film_event',
        localDate: '2026-09-09',
        sortableLocalDateTime: '2026-09-09T19:00',
      }),
      opp({
        opportunityKey: 'opp-early',
        filmKey: 'early-public',
        title: 'Public Early Access',
        screeningVariantType: 'early_access',
        isSpecialScreening: true,
        localDate: '2026-09-09',
        sortableLocalDateTime: '2026-09-09T19:00',
      }),
      opp({
        opportunityKey: 'opp-shorts',
        filmKey: 'shorts-key',
        title: 'Shorts Block',
        contentClassification: 'shorts_program',
        localDate: '2026-09-10',
        sortableLocalDateTime: '2026-09-10T19:00',
      }),
    ]),
    3,
  );
  const keys = mixed.selections.map((item) => item.representativeOpportunity.opportunityKey);
  assert.equal(keys.includes('opp-past'), false);
  assert.equal(keys.includes('opp-rental'), false);
  assert.ok(keys.includes('opp-early'));
  assert.equal(
    mixed.selections.find((item) => item.film.filmKey === 'early-public')
      ?.selectionReasonLabel,
    'Early access',
  );
});

test('closed-caption and audio-description do not become the ranked reason', () => {
  const { selections } = ranked(
    homeFrom([
      opp({
        opportunityKey: 'opp-a11y',
        filmKey: 'a11y-film',
        title: 'Captioned Wide Release',
        formatLabels: ['closed-caption', 'audio-description'],
        localDate: '2026-09-07',
        sortableLocalDateTime: '2026-09-07T19:00',
      }),
      opp({
        opportunityKey: 'opp-70',
        filmKey: 'print-film',
        title: 'Print Film',
        formatLabels: ['70mm'],
      }),
    ]),
    3,
  );
  assert.ok(selections.length >= 1);
  for (const selection of selections) {
    assert.equal(selection.selectionReasonCode === 'special_format', false);
    assert.equal(/caption|audio description/i.test(selection.selectionReasonLabel), false);
  }
  const print = selections.find((item) => item.film.filmKey === 'print-film');
  assert.ok(print);
  assert.equal(print.selectionReasonLabel, 'Rare 70mm presentation');
  assert.deepEqual(print.representativeOpportunity.formatLabels, ['70mm']);
});

test('carousel helpers still clamp restored topOppIndex when the list shrinks', () => {
  assert.equal(clampSelectionIndex(4, 3), 2);
  assert.equal(clampSelectionIndex(0, 0), 0);
  assert.equal(clampSelectionIndex(1, 1), 0);
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'print-film',
    opportunityKey: 'opp-70',
    originPrimary: 'home',
    homeRestore: {
      scrollY: 120,
      expandedShelfId: null,
      expandedFilmKey: null,
      topOppIndex: 2,
    },
  });
  const back = navigateBack(nav);
  assert.equal(back._restoredHome.topOppIndex, 2);
  assert.equal(clampSelectionIndex(back._restoredHome.topOppIndex, 2), 1);
});

test('TopOpportunityFeature HTML reflects ranked screening, labels, and carousel states', async () => {
  const configFile = join(ROOT, 'vite.v2.config.js');
  const server = await createServer({ configFile, logLevel: 'error' });
  try {
    const mod = await server.ssrLoadModule('/home/TopOpportunityFeature.jsx');
    const Feature = mod.default;

    const emptyHtml = renderToString(
      React.createElement(Feature, {
        status: 'ready',
        homeData: homeFrom([]),
        now: FIXED_NOW,
        onOpenFilmDetail: () => {},
      }),
    );
    assert.match(emptyHtml, /No featured opportunities/);
    assert.equal(emptyHtml.includes('v2-feature-arrow'), false);
    assert.equal(emptyHtml.includes('v2-feature-dot'), false);

    const oneHome = homeFrom([
      opp({
        opportunityKey: 'opp-70',
        formatLabels: ['70mm'],
        theaterName: 'Rep House',
      }),
    ]);
    const oneHtml = renderToString(
      React.createElement(Feature, {
        status: 'ready',
        homeData: oneHome,
        now: FIXED_NOW,
        onOpenFilmDetail: () => {},
      }),
    );
    assert.match(oneHtml, /data-source="rankedTopOpportunities"/);
    assert.match(oneHtml, /Rare 70mm presentation/);
    assert.match(oneHtml, /Rep House/);
    assert.match(oneHtml, /Featured/);
    assert.equal(oneHtml.includes('v2-feature-arrow'), false);
    assert.equal(oneHtml.includes('v2-feature-dot'), false);
    assert.equal(oneHtml.includes('rare_presentation'), false);
    assert.equal(oneHtml.includes('rawScore'), false);

    const manyHome = homeFrom([
      opp({
        opportunityKey: 'opp-70',
        filmKey: 'print-film',
        title: 'Print Film',
        formatLabels: ['70mm'],
        theaterName: 'Rep House',
      }),
      opp({
        opportunityKey: 'opp-early',
        filmKey: 'early-film',
        title: 'Early Film',
        screeningVariantType: 'early_access',
        isSpecialScreening: true,
        theaterId: 'theater-2',
        theaterName: 'Alderwood',
        localDate: '2026-09-09',
        sortableLocalDateTime: '2026-09-09T19:15',
      }),
      opp({
        opportunityKey: 'opp-last',
        filmKey: 'leaving-film',
        title: 'Leaving Film',
        theaterId: 'theater-3',
        theaterName: 'Southcenter',
        localDate: '2026-09-09',
        sortableLocalDateTime: '2026-09-09T19:25',
      }),
    ], {
      leavingSoon: {
        status: 'ready',
        entries: [
          {
            filmKey: 'leaving-film',
            bucket: 'last_chance',
            riskLevel: 'high',
            maxShowDate: '2026-09-09',
          },
        ],
      },
    });
    const manyHtml = renderToString(
      React.createElement(Feature, {
        status: 'ready',
        homeData: manyHome,
        now: FIXED_NOW,
        initialIndex: 8,
        onOpenFilmDetail: () => {},
      }),
    );
    assert.match(manyHtml, /v2-feature-arrow-prev/);
    assert.match(manyHtml, /v2-feature-arrow-next/);
    assert.match(manyHtml, /v2-feature-dot/);
    assert.match(manyHtml, /1 of 3|2 of 3|3 of 3/);
    assert.match(manyHtml, /Last chance|Early access|Rare 70mm presentation/);
    assert.equal(manyHtml.includes('Newly added'), false);
    assert.equal(manyHtml.includes('Special format'), false);
    assert.equal(manyHtml.includes('Limited current listings'), false);
  } finally {
    await server.close();
  }
});
