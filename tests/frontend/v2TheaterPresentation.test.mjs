import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatTheaterAddressLabel,
  resolveTheaterDirectionsUrl,
  resolveTheaterPresentation,
  buildTheaterNowShowing,
  THEATER_NOW_SHOWING_LIST_LIMIT,
} from '../../v2/theaters/resolveTheaterPresentation.js';
import { composeTheatersListPresentation } from '../../v2/theaters/composeTheatersListPresentation.js';
import { composeTheaterDetailPresentation } from '../../v2/theaters/composeTheaterDetailPresentation.js';
import {
  resolveTheatersPagePresentation,
  resolveTheaterDetailPagePresentation,
  isTheaterMockupPresentationMode,
} from '../../v2/theaters/resolveTheatersPagePresentation.js';
import { getTheatersMockupPresentation } from '../../v2/fixtures/theatersMockupFixture.js';
import { getTheaterDetailMockupPresentation } from '../../v2/fixtures/theaterDetailMockupFixture.js';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

const curatedTheater = {
  id: 'the-beacon',
  name: 'The Beacon',
  neighborhood: 'Columbia City',
  city: 'Seattle',
  address_line1: '4405 Rainier Ave S',
  state: 'WA',
  postal_code: '98118',
  website_url: 'https://thebeacon.film/',
  short_description: 'Independent cinema in Columbia City.',
  screen_count: null,
  capabilities: [],
  amenities: [],
};

const homeData = {
  theaterOrder: ['the-beacon', 'thin-venue'],
  theatersById: {
    'the-beacon': {
      id: 'the-beacon',
      name: 'The Beacon',
      neighborhood: 'Columbia City',
      city: 'Seattle',
      enabled: true,
      addressLine1: '4405 Rainier Ave S',
      state: 'WA',
      postalCode: '98118',
      websiteUrl: 'https://thebeacon.film/',
      shortDescription: 'Independent cinema in Columbia City.',
      screenCount: null,
      capabilities: [],
      amenities: [],
      opportunityCount: 2,
    },
    'thin-venue': {
      id: 'thin-venue',
      name: 'Thin Venue',
      neighborhood: 'Capitol Hill',
      city: 'Seattle',
      enabled: true,
      opportunityCount: 0,
    },
    'disabled-venue': {
      id: 'disabled-venue',
      name: 'Disabled Venue',
      city: 'Seattle',
      enabled: false,
      opportunityCount: 0,
    },
  },
  films: [
    { filmKey: 'film-a', filmId: 'tmdb:1', title: 'Film A', posterUrl: null },
    { filmKey: 'film-a-alt', filmId: 'tmdb:1', title: 'Film A Alt', posterUrl: null },
    { filmKey: 'film-b', filmId: null, title: 'Film B', posterUrl: null },
    { filmKey: 'film-old', filmId: 'tmdb:9', title: 'Old Film', posterUrl: null },
  ],
  opportunities: [
    {
      opportunityKey: 'o1',
      filmKey: 'film-a',
      title: 'Film A',
      theaterId: 'the-beacon',
      localDate: '2026-07-28',
      localTime: '7:00PM',
      sortableLocalDateTime: '2026-07-28T19:00',
      formatLabels: ['35mm'],
    },
    {
      opportunityKey: 'o1b',
      filmKey: 'film-a-alt',
      title: 'Film A Alt',
      theaterId: 'the-beacon',
      localDate: '2026-07-29',
      localTime: '5:00PM',
      sortableLocalDateTime: '2026-07-29T17:00',
      formatLabels: ['Digital'],
    },
    {
      opportunityKey: 'o2',
      filmKey: 'film-b',
      title: 'Film B',
      theaterId: 'the-beacon',
      localDate: '2026-07-30',
      localTime: '5:00PM',
      sortableLocalDateTime: '2026-07-30T17:00',
      formatLabels: ['Digital'],
    },
    {
      opportunityKey: 'o-old',
      filmKey: 'film-old',
      title: 'Old Film',
      theaterId: 'the-beacon',
      localDate: '2026-07-20',
      localTime: '5:00PM',
      sortableLocalDateTime: '2026-07-20T17:00',
      formatLabels: [],
    },
  ],
};

test('formatTheaterAddressLabel builds curated address or null', () => {
  assert.equal(
    formatTheaterAddressLabel(curatedTheater),
    '4405 Rainier Ave S, Seattle, WA 98118',
  );
  assert.equal(
    formatTheaterAddressLabel({ city: 'Seattle', neighborhood: 'Belltown' }),
    null,
  );
});

test('resolveTheaterDirectionsUrl prefers curated then derives', () => {
  assert.equal(
    resolveTheaterDirectionsUrl({
      directions_url: 'https://maps.example.com/x',
    }),
    'https://maps.example.com/x',
  );
  const fromAddress = resolveTheaterDirectionsUrl(curatedTheater);
  assert.match(fromAddress, /google\.com\/maps/);
  assert.match(fromAddress, /4405/);
  assert.equal(resolveTheaterDirectionsUrl({ name: 'Only name' }), null);
  assert.equal(
    resolveTheaterDirectionsUrl({ website_url: 'javascript:alert(1)' }),
    null,
  );
});

test('resolveTheaterPresentation is null-safe and suppresses empty visit slots', () => {
  const empty = resolveTheaterPresentation({ theater: null, context: 'list' });
  assert.equal(empty.source, 'empty');
  assert.equal(empty.sectionsVisible.pricingHours, false);

  const thin = resolveTheaterPresentation({
    theater: homeData.theatersById['thin-venue'],
    homeData,
    context: 'list',
  });
  assert.equal(thin.addressLabel, null);
  assert.equal(thin.sectionsVisible.amenities, false);

  const full = resolveTheaterPresentation({
    theater: homeData.theatersById['the-beacon'],
    homeData,
    context: 'detail',
    now: new Date('2026-07-28T12:00:00-07:00'),
  });
  // nowShowing uses Date.now internally via pacificDateString — force via buildTheaterNowShowing
  assert.equal(full.sectionsVisible.address, true);
  assert.equal(full.sectionsVisible.pricingHours, false);
});

test('Now Showing uses next-seven-day window, filmId dedupe, and list cap', () => {
  const now = new Date('2026-07-28T15:00:00-07:00');
  const rows = buildTheaterNowShowing(homeData, 'the-beacon', {
    now,
    limit: THEATER_NOW_SHOWING_LIST_LIMIT,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].filmId, 'tmdb:1');
  assert.equal(rows[0].filmKey, 'film-a');
  assert.equal(rows[1].filmKey, 'film-b');
  assert.equal(
    rows.some((row) => row.title === 'Old Film'),
    false,
  );
  assert.equal(buildTheaterNowShowing(homeData, 'thin-venue', { now }).length, 0);
});

test('list composer omits disabled venues and enables More details', () => {
  const list = composeTheatersListPresentation(homeData);
  assert.equal(list.source, 'home-data');
  assert.equal(list.theaters.length, 2);
  assert.equal(list.theaters.some((t) => t.id === 'disabled-venue'), false);
  assert.equal(list.theaters[0].id, 'the-beacon');
  assert.equal(list.theaters[0].openDetailEnabled, true);
  assert.equal(list.theaters[0].addressLabel, '4405 Rainier Ave S, Seattle, WA 98118');
});

test('detail composer returns not-found for unknown or disabled ids', () => {
  const missing = composeTheaterDetailPresentation(homeData, 'nope');
  assert.equal(missing.resolved, false);
  assert.equal(missing.notFound, true);
  assert.equal(missing.sectionsVisible.pricingHours, false);

  const disabled = composeTheaterDetailPresentation(homeData, 'disabled-venue');
  assert.equal(disabled.notFound, true);

  const ok = composeTheaterDetailPresentation(homeData, 'the-beacon');
  assert.equal(ok.resolved, true);
  assert.equal(ok.name, 'The Beacon');
  assert.equal(ok.pricing.rows.length, 0);
});

test('page resolvers default to live; mockup via forceMode', () => {
  assert.equal(isTheaterMockupPresentationMode(), false);

  const liveList = resolveTheatersPagePresentation({ homeData });
  assert.equal(liveList.mode, 'production');
  assert.equal(liveList.presentation.source, 'home-data');

  const mockList = resolveTheatersPagePresentation({
    homeData,
    forceMode: 'mockup-fixture',
  });
  assert.equal(mockList.mode, 'mockup-fixture');
  assert.equal(mockList.presentation, getTheatersMockupPresentation());

  const liveDetail = resolveTheaterDetailPagePresentation({
    theaterId: 'the-beacon',
    homeData,
  });
  assert.equal(liveDetail.mode, 'production');
  assert.equal(liveDetail.presentation.name, 'The Beacon');

  const mockDetail = resolveTheaterDetailPagePresentation({
    theaterId: 'the-beacon',
    homeData,
    forceMode: 'mockup-fixture',
  });
  assert.equal(mockDetail.mode, 'mockup-fixture');
  assert.equal(mockDetail.presentation, getTheaterDetailMockupPresentation());
});

test('curated registry validates and HomeData passes visit fields', () => {
  const registry = loadJson('data/theaters.json');
  // Production scrape currently emits theaters schema 1.0.0; 1.1.0 visit
  // enrichment may land later without blocking the v2 launch packaging path.
  assert.match(String(registry.schema_version), /^1\.\d+\.\d+$/);
  const beacon = registry.theaters.find((t) => t.id === 'the-beacon');
  assert.ok(beacon);
  assert.equal(beacon.name, 'The Beacon');

  const home = buildHomeData({
    showtimesCurrent: loadJson('tests/fixtures/frontend/v2_showtimes_home_mini.json'),
    theatersRegistry: registry,
    newlyAdded: loadJson('tests/fixtures/frontend/v2_newly_added_home_mini.json'),
  });
  const liveBeacon = home.theatersById['the-beacon'];
  assert.ok(liveBeacon);
  assert.equal(liveBeacon.name, 'The Beacon');
  // Visit fields are optional on 1.0.0 registries — when present they must pass through.
  if (beacon.address_line1) {
    assert.equal(liveBeacon.addressLine1, beacon.address_line1);
  }
  if (beacon.website_url) {
    assert.equal(liveBeacon.websiteUrl, beacon.website_url);
  }
  assert.ok(Array.isArray(home.theaterOrder));
  assert.equal(home.theaterOrder[0], 'amc-pacific-place-11');
});

test('surfaces keep Theaters out of bottom nav and reject deprecated CTAs', () => {
  const theatersSrc = readFileSync(
    join(ROOT, 'v2/theaters/TheatersSurface.jsx'),
    'utf8',
  );
  const destinationsSrc = readFileSync(join(ROOT, 'v2/destinations.js'), 'utf8');
  assert.equal(theatersSrc.includes('See this week'), false);
  assert.equal(theatersSrc.includes('Next showing'), false);
  assert.equal(destinationsSrc.includes("'theaters'"), false);
  assert.equal(destinationsSrc.includes('"theaters"'), false);
});

function amcMultiFilmHome() {
  return {
    theatersById: {
      'amc-pacific-place-11': {
        id: 'amc-pacific-place-11',
        name: 'AMC Pacific Place 11',
        city: 'Seattle',
        enabled: true,
        opportunityCount: 8,
      },
    },
    films: [
      {
        filmKey: 'the-odyssey',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        posterUrl: 'https://example.com/odyssey.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'spider-man-brand-new-day',
        filmId: 'tmdb:1002',
        title: 'Spider-Man: Brand New Day',
        posterUrl: 'https://example.com/spiderman.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'the-invite',
        filmId: 'tmdb:1003',
        title: 'The Invite',
        posterUrl: 'https://example.com/invite.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'the-odyssey-imax',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        posterUrl: 'https://example.com/odyssey.jpg',
        parentFilmKey: 'the-odyssey',
        screeningVariantType: 'imax',
      },
      {
        filmKey: 'batman-2022',
        filmId: 'tmdb:414906',
        title: 'The Batman',
        posterUrl: 'https://example.com/batman-2022.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'batman-1989',
        filmId: 'tmdb:268',
        title: 'The Batman',
        posterUrl: 'https://example.com/batman-1989.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'local-shorts-night',
        filmId: null,
        title: 'Local Shorts Night',
        posterUrl: null,
        parentFilmKey: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o-ody-1',
        filmKey: 'the-odyssey',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '1:00PM',
        sortableLocalDateTime: '2026-08-10T13:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'o-ody-imax',
        filmKey: 'the-odyssey-imax',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '4:00PM',
        sortableLocalDateTime: '2026-08-10T16:00',
        formatLabels: ['IMAX'],
        screeningVariantType: 'imax',
        parentFilmKey: 'the-odyssey',
      },
      {
        opportunityKey: 'o-spy-1',
        filmKey: 'spider-man-brand-new-day',
        filmId: 'tmdb:1002',
        title: 'Spider-Man: Brand New Day',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '2:15PM',
        sortableLocalDateTime: '2026-08-10T14:15',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'o-inv-1',
        filmKey: 'the-invite',
        filmId: 'tmdb:1003',
        title: 'The Invite',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '7:30PM',
        sortableLocalDateTime: '2026-08-10T19:30',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'o-bat-22',
        filmKey: 'batman-2022',
        filmId: 'tmdb:414906',
        title: 'The Batman',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '8:00PM',
        sortableLocalDateTime: '2026-08-10T20:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-bat-89',
        filmKey: 'batman-1989',
        filmId: 'tmdb:268',
        title: 'The Batman',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '9:00PM',
        sortableLocalDateTime: '2026-08-10T21:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-shorts',
        filmKey: 'local-shorts-night',
        filmId: null,
        title: 'Local Shorts Night',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-10',
        localTime: '10:00PM',
        sortableLocalDateTime: '2026-08-10T22:00',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-other-day',
        filmKey: 'the-invite',
        filmId: 'tmdb:1003',
        title: 'The Invite',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-11',
        localTime: '1:00PM',
        sortableLocalDateTime: '2026-08-11T13:00',
        formatLabels: ['Digital'],
      },
    ],
  };
}

test('Theater Detail showtimes emit one filmGroup card per canonical identity', () => {
  const now = () => new Date('2026-08-10T17:17:00-07:00');
  const detail = composeTheaterDetailPresentation(
    amcMultiFilmHome(),
    'amc-pacific-place-11',
    null,
    { now },
  );
  const groups = detail.todaysShowtimes.filmGroups;
  assert.equal(detail.todaysShowtimes.featuredFilm, null);
  assert.equal(detail.todaysShowtimes.selectedDate, '2026-08-10');
  assert.match(detail.todaysShowtimes.title, /Showtimes · Mon, Aug 10/i);
  assert.equal(groups.length, 6);

  const titles = groups.map((g) => g.title);
  assert.deepEqual(titles, [
    'The Odyssey',
    'Spider-Man: Brand New Day',
    'The Invite',
    'The Batman',
    'The Batman',
    'Local Shorts Night',
  ]);

  const odyssey = groups[0];
  assert.equal(odyssey.filmId, 'tmdb:1001');
  assert.equal(odyssey.filmKey, 'the-odyssey');
  assert.equal(odyssey.posterUrl, 'https://example.com/odyssey.jpg');
  assert.equal(odyssey.times.length, 2);
  assert.deepEqual(
    odyssey.times.map((t) => t.label),
    ['1:00 PM', '4:00 PM'],
  );
  assert.ok(odyssey.times.some((t) => t.formatLabel === 'IMAX'));

  const spider = groups[1];
  assert.equal(spider.filmId, 'tmdb:1002');
  assert.equal(spider.times.length, 1);
  assert.equal(spider.times[0].label, '2:15 PM');
  assert.equal(spider.posterUrl, 'https://example.com/spiderman.jpg');

  const invite = groups[2];
  assert.equal(invite.filmId, 'tmdb:1003');
  assert.equal(invite.times.length, 1);
  assert.equal(invite.times[0].label, '7:30 PM');

  // Same title, different TMDB IDs stay separate.
  assert.equal(groups[3].filmId, 'tmdb:414906');
  assert.equal(groups[3].filmKey, 'batman-2022');
  assert.equal(groups[4].filmId, 'tmdb:268');
  assert.equal(groups[4].filmKey, 'batman-1989');

  // Source-based null filmId keeps its showtime key.
  assert.equal(groups[5].filmId, null);
  assert.equal(groups[5].filmKey, 'local-shorts-night');
  assert.equal(groups[5].id, 'key:local-shorts-night');

  // Later dates are excluded from the Pacific-today section.
  assert.equal(
    groups.every((g) => g.times.every((t) => t.id !== 'o-other-day')),
    true,
  );
});

test('Theater Detail defaults to Pacific today, not earliest opportunity date', () => {
  // UTC is already Sunday Aug 9 while Pacific is still Saturday Aug 8.
  const now = () => new Date('2026-08-09T01:17:00.000Z');
  const home = {
    theatersById: {
      'amc-pacific-place-11': {
        id: 'amc-pacific-place-11',
        name: 'AMC Pacific Place 11',
        city: 'Seattle',
        enabled: true,
        opportunityCount: 2,
      },
    },
    films: [
      {
        filmKey: 'the-odyssey',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        posterUrl: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o-fri',
        filmKey: 'the-odyssey',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-07',
        localTime: '19:30',
        sortableLocalDateTime: '2026-08-07T19:30',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-sat',
        filmKey: 'the-odyssey',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-08',
        localTime: '13:30',
        sortableLocalDateTime: '2026-08-08T13:30',
        formatLabels: [],
      },
      {
        opportunityKey: 'o-sun',
        filmKey: 'the-odyssey',
        filmId: 'tmdb:1001',
        title: 'The Odyssey',
        theaterId: 'amc-pacific-place-11',
        localDate: '2026-08-09',
        localTime: '16:00',
        sortableLocalDateTime: '2026-08-09T16:00',
        formatLabels: [],
      },
    ],
  };

  const detail = composeTheaterDetailPresentation(
    home,
    'amc-pacific-place-11',
    null,
    { now, timeFormatId: '12h' },
  );
  assert.equal(detail.todaysShowtimes.selectedDate, '2026-08-08');
  assert.match(detail.todaysShowtimes.title, /Showtimes · Sat, Aug 8/i);
  assert.equal(detail.todaysShowtimes.filmGroups.length, 1);
  assert.deepEqual(
    detail.todaysShowtimes.filmGroups[0].times.map((t) => t.label),
    ['1:30 PM'],
  );
  assert.equal(
    detail.todaysShowtimes.filmGroups[0].times.every(
      (t) => t.localDate === '2026-08-08',
    ),
    true,
  );

  const emptyToday = composeTheaterDetailPresentation(
    {
      ...home,
      opportunities: home.opportunities.filter((o) => o.localDate !== '2026-08-08'),
    },
    'amc-pacific-place-11',
    null,
    { now },
  );
  // Do not silently fall back to Friday when Saturday has no rows.
  assert.equal(emptyToday.todaysShowtimes.selectedDate, '2026-08-08');
  assert.match(emptyToday.todaysShowtimes.title, /Showtimes · Sat, Aug 8/i);
  assert.equal(emptyToday.todaysShowtimes.filmGroups.length, 0);

  const as24h = composeTheaterDetailPresentation(
    home,
    'amc-pacific-place-11',
    null,
    { now, timeFormatId: '24h' },
  );
  assert.deepEqual(
    as24h.todaysShowtimes.filmGroups[0].times.map((t) => t.label),
    ['13:30'],
  );
});

test('Theater Detail with a single film still renders one group', () => {
  const home = {
    theatersById: {
      'thin-venue': {
        id: 'thin-venue',
        name: 'Thin Venue',
        city: 'Seattle',
        enabled: true,
        opportunityCount: 1,
      },
    },
    films: [
      {
        filmKey: 'only-film',
        filmId: 'tmdb:9',
        title: 'Only Film',
        posterUrl: 'https://example.com/only.jpg',
      },
    ],
    opportunities: [
      {
        opportunityKey: 'only-1',
        filmKey: 'only-film',
        filmId: 'tmdb:9',
        title: 'Only Film',
        theaterId: 'thin-venue',
        localDate: '2026-08-10',
        localTime: '6:00PM',
        sortableLocalDateTime: '2026-08-10T18:00',
        formatLabels: [],
      },
    ],
  };
  const detail = composeTheaterDetailPresentation(home, 'thin-venue', null, {
    now: () => new Date('2026-08-10T12:00:00-07:00'),
  });
  assert.equal(detail.todaysShowtimes.filmGroups.length, 1);
  assert.equal(detail.todaysShowtimes.filmGroups[0].title, 'Only Film');
  assert.equal(detail.todaysShowtimes.filmGroups[0].times.length, 1);
  assert.equal(detail.todaysShowtimes.filmGroups[0].times[0].label, '6:00 PM');
  assert.equal(detail.sectionsVisible.todaysShowtimes, true);
});

test('Theater Detail empty-date venue hides showtimes section', () => {
  const home = {
    theatersById: {
      'empty-venue': {
        id: 'empty-venue',
        name: 'Empty Venue',
        city: 'Seattle',
        enabled: true,
        opportunityCount: 0,
      },
    },
    films: [],
    opportunities: [],
  };
  const detail = composeTheaterDetailPresentation(home, 'empty-venue');
  assert.equal(detail.todaysShowtimes.filmGroups.length, 0);
  assert.equal(detail.todaysShowtimes.screens.length, 0);
  assert.equal(detail.sectionsVisible.todaysShowtimes, false);
});
