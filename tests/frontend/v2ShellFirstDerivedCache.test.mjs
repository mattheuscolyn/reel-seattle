import test from 'node:test';
import assert from 'node:assert/strict';
import { readHomeShelfModels } from '../../v2/home/homeShelfModelCache.js';
import { readAllMoviesPresentation } from '../../v2/allMovies/allMoviesPresentationCache.js';
import { buildRankedTopOpportunitySelections } from '../../v2/topOpportunities/buildRankedTopOpportunitySelections.js';

test('home shelf cache reuses one model until an input changes', () => {
  let builds = 0;
  const key = {
    homeData: { films: [] },
    enrichmentIndex: null,
    shortsIndex: null,
    revision: 0,
    hideNotInterested: false,
    hideSeen: false,
    nowMinute: '2026-09-29T11:16',
  };
  const build = () => {
    builds += 1;
    return { builds };
  };
  const first = readHomeShelfModels(key, build);
  const second = readHomeShelfModels({ ...key, homeData: key.homeData }, build);
  assert.equal(second, first);
  assert.equal(builds, 1);

  const nextRevision = readHomeShelfModels({ ...key, revision: 1 }, build);
  assert.notEqual(nextRevision, first);
  assert.equal(builds, 2);

  const nextMinute = readHomeShelfModels(
    { ...key, nowMinute: '2026-09-29T11:17' },
    build,
  );
  assert.notEqual(nextMinute, nextRevision);
  assert.equal(builds, 3);

  const hidden = readHomeShelfModels({ ...key, hideSeen: true }, build);
  assert.notEqual(hidden, nextMinute);
  assert.equal(builds, 4);
});

test('all movies presentation cache follows data, filters, and visibility', () => {
  let builds = 0;
  const key = {
    homeData: { films: [] },
    enrichmentIndex: null,
    loadStatus: 'ready',
    query: '',
    availability: 'all',
    sort: 'soonest',
    genreKeySig: '',
    timeFormatId: '12h',
    revision: 0,
    hideNotInterested: false,
    hideSeen: false,
    nowMinute: '2026-09-29T11:16',
  };
  const build = () => {
    builds += 1;
    return { builds };
  };
  const first = readAllMoviesPresentation(key, build);
  assert.equal(readAllMoviesPresentation(key, build), first);
  assert.equal(builds, 1);
  assert.notEqual(
    readAllMoviesPresentation({ ...key, query: 'parasite' }, build),
    first,
  );
  assert.notEqual(
    readAllMoviesPresentation({ ...key, homeData: { films: [{}] } }, build),
    first,
  );
  assert.equal(builds, 3);
});

test('ranked home selections stay cached until visibility or the instant changes', () => {
  const now = new Date('2026-09-05T22:00:00.000Z');
  const home = {
    films: [
      {
        filmKey: 'film-a',
        parentFilmKey: 'film-a',
        title: 'Film A',
        filmId: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-1',
        filmKey: 'film-a',
        parentFilmKey: 'film-a',
        title: 'Film A',
        theaterId: 'theater-1',
        theaterName: 'Theater One',
        localDate: '2026-09-06',
        localTime: '19:00',
        sortableLocalDateTime: '2026-09-06T19:00',
        formatLabels: [],
        status: 'active',
      },
    ],
    theatersById: {
      'theater-1': { id: 'theater-1', name: 'Theater One', type: 'indie' },
    },
  };
  const options = {
    now,
    cacheToken: '0:0:0',
    isCandidateVisible: () => true,
  };
  const first = buildRankedTopOpportunitySelections(home, options);
  const second = buildRankedTopOpportunitySelections(home, {
    ...options,
    isCandidateVisible: () => false,
  });
  assert.equal(second, first);

  const visibleAgain = buildRankedTopOpportunitySelections(home, {
    ...options,
    cacheToken: '1:0:0',
  });
  assert.notEqual(visibleAgain, first);

  const later = buildRankedTopOpportunitySelections(home, {
    ...options,
    now: new Date('2026-09-05T22:01:00.000Z'),
  });
  assert.notEqual(later, first);
});
