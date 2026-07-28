import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { selectTopOpportunities } from '../../v2/adapters/selectTopOpportunities.js';
import {
  buildBestWayCard,
  buildTodaysShowtimes,
} from '../../v2/filmDetail/filmDetailModel.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { buildInlineQuickDetail } from '../../v2/home/shelfData.js';
import {
  EXTERNAL_TICKET_LINK_RELS,
  EXTERNAL_TICKET_LINK_TARGET,
  externalTicketLinkProps,
  normalizeExternalTicketUrl,
} from '../../v2/ticket/externalTicketUrl.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function baseInput(overrides = {}) {
  return {
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
    ...overrides,
  };
}

test('normalizeExternalTicketUrl keeps absolute http(s) and query strings', () => {
  assert.equal(
    normalizeExternalTicketUrl(
      'https://www.amctheatres.com/showtimes/all/1?utm=x#seat',
    ),
    'https://www.amctheatres.com/showtimes/all/1?utm=x#seat',
  );
  assert.equal(
    normalizeExternalTicketUrl('  http://example.com/t  '),
    'http://example.com/t',
  );
  assert.equal(normalizeExternalTicketUrl('/checkout/showing/1'), null);
  assert.equal(normalizeExternalTicketUrl('javascript:alert(1)'), null);
  assert.equal(normalizeExternalTicketUrl(''), null);
  assert.equal(normalizeExternalTicketUrl(null), null);
});

test('externalTicketLinkProps suppresses null and sets accessibility attrs', () => {
  assert.equal(externalTicketLinkProps(null), null);
  assert.equal(externalTicketLinkProps('/relative'), null);
  assert.deepEqual(
    externalTicketLinkProps('https://www.central-cinema.com/checkout/showing/a/1'),
    {
      href: 'https://www.central-cinema.com/checkout/showing/a/1',
      target: EXTERNAL_TICKET_LINK_TARGET,
      rel: EXTERNAL_TICKET_LINK_RELS,
    },
  );
});

test('public ticket_url becomes opportunity.ticketUrl; null stays null', () => {
  const home = buildHomeData(baseInput());
  const withUrl = home.opportunities.find(
    (o) => o.sourceShowtimeId === 'amc-perf-1',
  );
  const withoutUrl = home.opportunities.find(
    (o) => o.sourceShowtimeId === 'amc-perf-2',
  );
  assert.ok(withUrl);
  assert.ok(withoutUrl);
  assert.equal(withUrl.ticketUrl, 'https://example.com/tickets/1');
  assert.equal(withoutUrl.ticketUrl, null);
});

test('mixed showtimes keep distinct ticket URLs and do not copy across rows', () => {
  const artifact = structuredClone(loadFixture('v2_showtimes_home_mini.json'));
  artifact.showtimes.push({
    id: 'st-sinners-late-unique',
    date: '2026-06-28',
    time: '21:45',
    time_display: '9:45 PM',
    theater_id: 'amc-pacific-place-11',
    showtime_film_key: 'sinners',
    film_title: 'Sinners',
    runtime_min: 137,
    poster_url: 'https://example.com/sinners.jpg',
    status: 'active',
    format_tags: ['IMAX'],
    ticket_url:
      'https://www.amctheatres.com/showtimes/all/2026-06-28/pacificplace/all/999?ref=rs',
    source: 'amc',
    source_film_id: 'amc-sinners',
    source_showtime_id: 'amc-perf-late-unique',
    attributes: {},
  });
  const home = buildHomeData(baseInput({ showtimesCurrent: artifact }));
  const urls = home.opportunities
    .filter((o) => o.filmKey === 'sinners' && o.theaterId === 'amc-pacific-place-11')
    .map((o) => o.ticketUrl);
  assert.ok(urls.includes('https://example.com/tickets/1'));
  assert.ok(urls.includes(null));
  assert.ok(
    urls.includes(
      'https://www.amctheatres.com/showtimes/all/2026-06-28/pacificplace/all/999?ref=rs',
    ),
  );
  assert.equal(new Set(urls.filter(Boolean)).size, 2);
});

test('ticketUrl is not derived from source_showtime_id or public id', () => {
  const artifact = structuredClone(loadFixture('v2_showtimes_home_mini.json'));
  const row = artifact.showtimes.find((s) => s.id === 'st-sinners-evening');
  row.ticket_url = null;
  row.source_showtime_id = 'https://evil.example/should-not-become-ticket';
  row.id = 'https://evil.example/public-id';
  const home = buildHomeData(baseInput({ showtimesCurrent: artifact }));
  const opp = home.opportunities.find(
    (o) => o.sourceShowtimeId === row.source_showtime_id,
  );
  assert.ok(opp);
  assert.equal(opp.ticketUrl, null);
});

test('relative ticket_url is rejected in production HomeData', () => {
  const artifact = structuredClone(loadFixture('v2_showtimes_home_mini.json'));
  artifact.showtimes[0].ticket_url = '/tickets/relative';
  const home = buildHomeData(baseInput({ showtimesCurrent: artifact }));
  const opp = home.opportunities.find(
    (o) => o.sourceShowtimeId === 'amc-perf-1',
  );
  assert.equal(opp.ticketUrl, null);
});

test('source-specific coverage: AMC/Central/NWFF URLs retained; SIFF/Beacon stay null', () => {
  const artifact = structuredClone(loadFixture('v2_showtimes_home_mini.json'));
  const base = artifact.showtimes[0];
  artifact.showtimes = [
    {
      ...base,
      id: 'amc-1',
      source: 'amc',
      source_showtime_id: 'amc-1',
      ticket_url: 'https://www.amctheatres.com/showtimes/all/1',
    },
    {
      ...base,
      id: 'central-1',
      theater_id: 'amc-pacific-place-11',
      source: 'central_cinema',
      source_showtime_id: '3387540',
      ticket_url:
        'https://www.central-cinema.com/checkout/showing/film/3387540',
    },
    {
      ...base,
      id: 'nwff-1',
      source: 'nwff',
      source_showtime_id: null,
      ticket_url: 'https://nwfilmforum.eventive.org/films/abc',
    },
    {
      ...base,
      id: 'siff-1',
      theater_id: 'siff-cinema-uptown',
      showtime_film_key: 'indie-film',
      film_title: 'Indie Film',
      source: 'siff',
      source_showtime_id: 'siff-1',
      ticket_url: null,
    },
    {
      ...base,
      id: 'beacon-1',
      theater_id: 'siff-cinema-uptown',
      showtime_film_key: 'indie-film',
      film_title: 'Indie Film',
      source: 'beacon',
      source_showtime_id: 'beacon-1',
      ticket_url: null,
    },
  ];
  const home = buildHomeData(baseInput({ showtimesCurrent: artifact }));
  const bySource = Object.fromEntries(
    home.opportunities.map((o) => [o.source, o.ticketUrl]),
  );
  assert.equal(bySource.amc, 'https://www.amctheatres.com/showtimes/all/1');
  assert.equal(
    bySource.central_cinema,
    'https://www.central-cinema.com/checkout/showing/film/3387540',
  );
  assert.equal(bySource.nwff, 'https://nwfilmforum.eventive.org/films/abc');
  assert.equal(bySource.siff, null);
  assert.equal(bySource.beacon, null);
});

test('Top Opportunity selection preserves representative ticketUrl', () => {
  const home = buildHomeData(baseInput());
  const selections = selectTopOpportunities(home);
  assert.ok(selections.length > 0);
  for (const selection of selections) {
    const key = selection.representativeOpportunity.opportunityKey;
    const sourceOpp = home.opportunities.find((o) => o.opportunityKey === key);
    assert.ok(sourceOpp);
    assert.equal(
      selection.representativeOpportunity.ticketUrl,
      sourceOpp.ticketUrl,
    );
  }
});

test('Film Detail bestWay and today times keep per-performance ticketUrl', () => {
  const home = buildHomeData(baseInput());
  const best = buildBestWayCard(
    home.opportunities.find((o) => o.sourceShowtimeId === 'amc-perf-1'),
    home.films.find((f) => f.filmKey === 'sinners'),
    home,
  );
  assert.equal(best.ticketUrl, 'https://example.com/tickets/1');

  // Force "today" by rewriting localDate on sinners opps.
  const todayHome = structuredClone(home);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  for (const opp of todayHome.opportunities) {
    if (opp.filmKey === 'sinners') opp.localDate = today;
  }
  const todayRows = buildTodaysShowtimes(todayHome, 'sinners');
  const times = todayRows.rows.flatMap((row) => row.times);
  assert.ok(times.length >= 2);
  const urls = times.map((t) => t.ticketUrl);
  assert.ok(urls.includes('https://example.com/tickets/1'));
  assert.ok(urls.includes(null));
});

test('inline quick detail carries ticketUrl without requiring a ticket control', () => {
  const home = buildHomeData(baseInput());
  const film = home.films.find((f) => f.filmKey === 'sinners');
  const detail = buildInlineQuickDetail(home, {
    filmKey: film.filmKey,
    title: film.title,
    posterUrl: film.posterUrl,
    runtimeMin: film.runtimeMin,
    theaterCount: film.theaterCount,
    nextOpportunityKey: home.opportunities.find(
      (o) => o.sourceShowtimeId === 'amc-perf-1',
    ).opportunityKey,
  });
  assert.equal(detail.ticketUrl, 'https://example.com/tickets/1');
  assert.ok(detail.showingLine);
});

test('real Film Detail presentation does not inject fixture ticket URLs', () => {
  const home = buildHomeData(baseInput());
  const presentation = composeFilmDetailPresentation(home, 'indie-film');
  assert.equal(presentation.mode, 'real');
  assert.equal(presentation.source, 'home-data');
  if (presentation.bestWay) {
    assert.equal(presentation.bestWay.ticketUrl, null);
  }
  for (const row of presentation.today.rows) {
    for (const time of row.times) {
      assert.equal(time.ticketUrl, null);
    }
  }
});

test('OpportunityDetailSurface does not fall back to sourceUrl', () => {
  const src = readFileSync(
    join(ROOT, 'v2/surfaces/OpportunityDetailSurface.jsx'),
    'utf8',
  );
  assert.equal(src.includes('opportunity?.sourceUrl'), false);
  assert.equal(src.includes('|| opportunity?.sourceUrl'), false);
  assert.ok(src.includes('externalTicketLinkProps'));
  assert.ok(src.includes('Theater ticket page'));
  assert.ok(src.includes('No ticket link in the current data'));
});

test('TopOpportunityFeature (live Home) does not invent a new Tickets CTA', () => {
  const src = readFileSync(
    join(ROOT, 'v2/home/TopOpportunityFeature.jsx'),
    'utf8',
  );
  assert.equal(/Tickets/.test(src), false);
  assert.equal(src.includes('ticketUrl'), false);
});

test('source_showtime_id still propagates (T-EMIT-01 regression)', () => {
  const home = buildHomeData(baseInput());
  const opp = home.opportunities.find((o) => o.sourceShowtimeId === 'amc-perf-1');
  assert.equal(opp.sourceShowtimeId, 'amc-perf-1');
  assert.equal(opp.ticketUrl, 'https://example.com/tickets/1');
  // Presentation attributes remain empty at HomeData grain (T-ATTR not started).
  assert.equal(opp.auditorium, null);
});
