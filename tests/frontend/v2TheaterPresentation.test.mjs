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
