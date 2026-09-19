import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  resolveActivePrimaryId,
  resolveHeaderBackLabel,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  openSpecialEventsDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { resolveFilmDetailBackLabel } from '../../v2/filmDetail/filmDetailModel.js';
import {
  composeSpecialEventsDetail,
  composeSpecialEventsPage,
  formatSpecialEventDescription,
  groupSpecialEventEngagements,
  isQualifyingSpecialEventOpportunity,
  resolveSpecialEventSectionId,
  secondaryFormatLabels,
  specialEventEngagementKey,
} from '../../v2/specialEvents/specialEventsModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const PAGE_SRC = readFileSync(
  join(ROOT, 'v2/specialEvents/SpecialEventsSurface.jsx'),
  'utf8',
);
const DETAIL_SRC = readFileSync(
  join(ROOT, 'v2/specialEvents/SpecialEventsDetailSurface.jsx'),
  'utf8',
);
const CATALOG_SRC = readFileSync(
  join(ROOT, 'v2/explore/exploreCatalog.js'),
  'utf8',
);

const NOW = new Date('2026-09-16T20:00:00.000Z'); // ~1pm PDT

function showtime(partial) {
  return {
    status: 'active',
    runtime_min: 120,
    poster_url: 'https://example.com/poster.jpg',
    ticket_url: 'https://example.com/tickets/exact',
    attributes: {},
    parent_film_key: null,
    parent_display_title: null,
    source_showtime_id: null,
    special_event: {
      is_special_event: false,
      types: [],
      labels: [],
      confidence: null,
      evidence: [],
    },
    ...partial,
  };
}

function se(types, labels, confidence = 'high') {
  return {
    is_special_event: true,
    types,
    labels,
    confidence,
    evidence: [{ kind: 'test', type: types[0], confidence }],
  };
}

function homeFromShowtimes(showtimes, films = []) {
  const theaterIds = [
    ...new Set(showtimes.map((s) => s.theater_id).filter(Boolean)),
  ];
  const filmKeys = [
    ...new Set(showtimes.map((s) => s.showtime_film_key).filter(Boolean)),
  ];
  const defaultFilms = filmKeys.map((key) => {
    const known = {
      weight: 'The Weight',
      ordinary: 'Ordinary Film',
      'forgotten-island': 'Forgotten Island',
      amc: 'AMC',
    };
    return {
      showtime_film_key: key,
      title: known[key] || key,
      film_id: null,
    };
  });
  return buildHomeData({
    showtimesCurrent: {
      schema_version: '1.0.0',
      generated_at: '2026-09-16T00:00:00Z',
      timezone: 'America/Los_Angeles',
      showtimes,
      films: films.length ? films : defaultFilms,
      theaters: theaterIds.map((id) => ({
        id,
        name: id === 'siff-uptown' ? 'SIFF Uptown' : `Theater ${id}`,
        source: 'test',
        enabled: true,
      })),
    },
    theaters: {
      theaters: theaterIds.map((id) => ({
        id,
        name: id === 'siff-uptown' ? 'SIFF Uptown' : `Theater ${id}`,
        enabled: true,
      })),
    },
    newlyAdded: { generated_at: '2026-09-16T00:00:00Z', entries: [] },
  });
}

test('HomeData normalizes specialEvent to camelCase product contract', () => {
  const home = homeFromShowtimes([
    showtime({
      id: '1',
      film_title: 'The Weight Early Access',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-pacific-place',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      format_tags: ['dolby-cinema-at-amc'],
      special_event: se(['early_access'], ['Early Access']),
    }),
  ]);
  const opp = home.opportunities[0];
  assert.equal(opp.specialEvent.isSpecialEvent, true);
  assert.equal(opp.specialEvent.confidence, 'high');
  assert.deepEqual(opp.specialEvent.types, ['early_access']);
  assert.equal(opp.specialEvent.is_special_event, undefined);
});

test('ordinary / plain format screenings are excluded', () => {
  const home = homeFromShowtimes([
    showtime({
      id: 'ord',
      film_title: 'Ordinary Film',
      showtime_film_key: 'ordinary',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      format_tags: ['35mm'],
    }),
    showtime({
      id: 'imax',
      film_title: 'Ordinary Film IMAX',
      showtime_film_key: 'ordinary',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '20:00',
      time_display: '8:00 PM',
      format_tags: ['imax'],
    }),
    showtime({
      id: 'dolby',
      film_title: 'Ordinary Film Dolby',
      showtime_film_key: 'ordinary',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '21:00',
      time_display: '9:00 PM',
      format_tags: ['dolby-cinema-at-amc'],
    }),
  ]);
  assert.equal(home.opportunities.every((o) => !isQualifyingSpecialEventOpportunity(o)), true);
  const page = composeSpecialEventsPage(home, { now: NOW });
  assert.equal(page.visibleCount, 0);
  assert.equal(page.emptyMessage, 'No special events are scheduled right now.');
});

test('Q&A, early access, opening night, mystery included; event+format kept', () => {
  const home = homeFromShowtimes([
    showtime({
      id: 'qa',
      film_title: 'Film Q&A',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'siff-uptown',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['q_and_a'], ['Director Q&A']),
    }),
    showtime({
      id: 'ea',
      film_title: 'The Weight Early Access',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-1',
      date: '2026-09-18',
      time: '19:00',
      time_display: '7:00 PM',
      format_tags: ['dolby-cinema-at-amc', 'closed-caption'],
      special_event: se(['early_access'], ['Early Access']),
    }),
    showtime({
      id: 'open',
      film_title: 'Opening Night',
      showtime_film_key: 'forgotten-island',
      parent_film_key: 'forgotten-island',
      parent_display_title: 'Forgotten Island',
      theater_id: 'amc-2',
      date: '2026-09-24',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['opening_night'], ['Opening Night Event']),
    }),
    showtime({
      id: 'mystery',
      film_title: 'AMC Screen Unseen',
      showtime_film_key: 'amc',
      parent_film_key: 'amc',
      parent_display_title: 'AMC',
      theater_id: 'amc-3',
      date: '2026-09-21',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['mystery_screening'], ['Screen Unseen: September 21']),
    }),
  ]);
  const page = composeSpecialEventsPage(home, { now: NOW });
  assert.equal(page.visibleCount, 4);
  const types = page.engagements.flatMap((e) => e.types);
  assert.ok(types.includes('q_and_a'));
  assert.ok(types.includes('early_access'));
  assert.ok(types.includes('opening_night'));
  assert.ok(types.includes('mystery_screening'));
  const ea = page.engagements.find((e) => e.types.includes('early_access'));
  assert.deepEqual(ea.formatLabels, ['Dolby Cinema']);
});

test('film with ordinary + event showtimes includes only event showtimes', () => {
  const home = homeFromShowtimes([
    showtime({
      id: 'ord',
      film_title: 'The Weight',
      showtime_film_key: 'weight',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '14:00',
      time_display: '2:00 PM',
    }),
    showtime({
      id: 'evt',
      film_title: 'The Weight Early Access',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      ticket_url: 'https://example.com/tickets/event-only',
      special_event: se(['early_access'], ['Early Access']),
    }),
  ]);
  const page = composeSpecialEventsPage(home, { now: NOW });
  assert.equal(page.visibleCount, 1);
  assert.equal(page.engagements[0].opportunities.length, 1);
  assert.equal(
    page.engagements[0].nextOpportunityKey,
    home.opportunities.find((o) => o.specialEvent?.isSpecialEvent)
      .opportunityKey,
  );
  const detail = composeSpecialEventsDetail(
    home,
    page.engagements[0].engagementId,
    { now: NOW },
  );
  assert.equal(detail.showtimes.length, 1);
  assert.equal(detail.showtimes[0].ticketUrl, 'https://example.com/tickets/event-only');
});

test('identical event performances group; distinct variants stay separate', () => {
  const home = homeFromShowtimes([
    showtime({
      id: 'ea1',
      film_title: 'The Weight Early Access',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['early_access'], ['Early Access']),
    }),
    showtime({
      id: 'ea2',
      film_title: 'The Weight Early Access',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-2',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['early_access'], ['Early Access']),
    }),
    showtime({
      id: 'qa',
      film_title: 'Forgotten Island Early Access with Cast Q&A',
      showtime_film_key: 'forgotten-island',
      parent_film_key: 'forgotten-island',
      parent_display_title: 'Forgotten Island',
      theater_id: 'amc-1',
      date: '2026-09-20',
      time: '15:30',
      time_display: '3:30 PM',
      special_event: se(
        ['q_and_a', 'early_access'],
        ['Early Access Screening with Cast Member Q&A'],
      ),
    }),
    showtime({
      id: 'ea-only',
      film_title: 'Forgotten Island Early Access',
      showtime_film_key: 'forgotten-island',
      parent_film_key: 'forgotten-island',
      parent_display_title: 'Forgotten Island',
      theater_id: 'amc-2',
      date: '2026-09-20',
      time: '15:30',
      time_display: '3:30 PM',
      special_event: se(['early_access'], ['Early Access Screening']),
    }),
    showtime({
      id: 'm1',
      film_title: 'Screen Unseen A',
      showtime_film_key: 'amc',
      parent_film_key: 'amc',
      parent_display_title: 'AMC',
      theater_id: 'amc-1',
      date: '2026-09-21',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['mystery_screening'], ['Screen Unseen: September 21']),
    }),
    showtime({
      id: 'm2',
      film_title: 'Screen Unseen B',
      showtime_film_key: 'amc',
      parent_film_key: 'amc',
      parent_display_title: 'AMC',
      theater_id: 'amc-2',
      date: '2026-09-28',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['mystery_screening'], ['Screen Unseen: September 28']),
    }),
  ]);
  const engagements = groupSpecialEventEngagements(home.opportunities, {
    now: NOW,
    homeData: home,
  });
  assert.equal(engagements.length, 5);
  const weight = engagements.find((e) => e.filmTitle === 'The Weight');
  assert.equal(weight.opportunities.length, 2);
  assert.equal(weight.moreCount, 1);
  const forgotten = engagements.filter((e) => e.filmTitle === 'Forgotten Island');
  assert.equal(forgotten.length, 2);
  assert.ok(
    forgotten.some((e) => e.eventDescription.includes('Cast Member Q&A')),
  );
  assert.ok(
    forgotten.some((e) => e.eventDescription === 'Early Access Screening'),
  );
  const mysteries = engagements.filter((e) =>
    e.types.includes('mystery_screening'),
  );
  assert.equal(mysteries.length, 2);
  assert.notEqual(
    specialEventEngagementKey(mysteries[0].opportunities[0]),
    specialEventEngagementKey(mysteries[1].opportunities[0]),
  );
});

test('chronology and Today / Tomorrow / This Week / Later sections', () => {
  const today = '2026-09-16'; // Wed
  assert.equal(resolveSpecialEventSectionId(today, today), 'today');
  assert.equal(resolveSpecialEventSectionId('2026-09-17', today), 'tomorrow');
  assert.equal(resolveSpecialEventSectionId('2026-09-18', today), 'this-week');
  assert.equal(resolveSpecialEventSectionId('2026-09-20', today), 'this-week');
  assert.equal(resolveSpecialEventSectionId('2026-09-21', today), 'later');
  assert.equal(resolveSpecialEventSectionId('2026-09-15', today), null);

  const home = homeFromShowtimes([
    showtime({
      id: 't',
      film_title: 'Today Event',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-1',
      date: '2026-09-16',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['early_access'], ['Early Access']),
    }),
    showtime({
      id: 'tm',
      film_title: 'Tomorrow Event',
      showtime_film_key: 'forgotten-island',
      parent_film_key: 'forgotten-island',
      parent_display_title: 'Forgotten Island',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['q_and_a'], ['Q&A']),
    }),
    showtime({
      id: 'w',
      film_title: 'Weekend Event',
      showtime_film_key: 'ordinary',
      parent_film_key: 'ordinary',
      parent_display_title: 'Ordinary Film',
      theater_id: 'amc-1',
      date: '2026-09-19',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['opening_night'], ['Opening Night']),
    }),
    showtime({
      id: 'l',
      film_title: 'Later Event',
      showtime_film_key: 'amc',
      parent_film_key: 'amc',
      parent_display_title: 'AMC',
      theater_id: 'amc-1',
      date: '2026-09-22',
      time: '19:00',
      time_display: '7:00 PM',
      special_event: se(['mystery_screening'], ['Screen Unseen']),
    }),
  ]);
  const page = composeSpecialEventsPage(home, { now: NOW });
  assert.deepEqual(
    page.sections.map((s) => s.id),
    ['today', 'tomorrow', 'this-week', 'later'],
  );
  assert.equal(page.sections[0].engagements[0].filmKey, 'weight');
  assert.equal(page.sections[1].engagements[0].types[0], 'q_and_a');
  assert.ok(!page.sections.some((s) => s.engagements.length === 0));
});

test('multi-type label prefers richer copy; formats stay secondary', () => {
  assert.equal(
    formatSpecialEventDescription({
      types: ['q_and_a', 'early_access'],
      labels: ['Early Access Screening with Cast Member Q&A'],
    }),
    'Early Access Screening with Cast Member Q&A',
  );
  assert.equal(
    formatSpecialEventDescription(
      {
        types: ['other_event'],
        labels: ['Community Screening'],
      },
      'Community Screening: North By Northwest',
    ),
    'Community Screening',
  );
  assert.equal(
    formatSpecialEventDescription({
      types: ['other_event'],
      labels: [],
    }),
    'Special Event',
  );
  assert.deepEqual(secondaryFormatLabels(['35mm', 'closed-caption', 'imax']), [
    '35mm',
    'IMAX',
  ]);
});

test('duplicate identical Screen Unseen rows collapse; distinct theaters survive', () => {
  const base = {
    film_title: 'AMC Screen Unseen: September 21',
    showtime_film_key: 'amc-screen-unseen-september-21',
    parent_film_key: 'amc',
    parent_display_title: 'AMC',
    date: '2026-09-21',
    time: '19:00',
    time_display: '7:00 PM',
    special_event: se(['mystery_screening'], ['Screen Unseen: September 21']),
    source: 'amc',
    source_showtime_id: null,
  };
  const home = homeFromShowtimes([
    showtime({ ...base, id: 'dup-kent', theater_id: 'amc-kent-station-14' }),
    showtime({ ...base, id: 'dup-kent', theater_id: 'amc-kent-station-14' }),
    showtime({
      ...base,
      id: 'uniq-pacific',
      theater_id: 'amc-pacific-place-11',
    }),
    showtime({
      ...base,
      id: 'uniq-alderwood',
      theater_id: 'amc-alderwood-mall-16',
    }),
  ]);
  const mystery = home.opportunities.filter(
    (o) =>
      o.specialEvent?.isSpecialEvent &&
      o.specialEvent.types.includes('mystery_screening'),
  );
  assert.equal(mystery.length, 3);
  const page = composeSpecialEventsPage(home, { now: NOW });
  const eng = page.engagements.filter((e) =>
    e.types.includes('mystery_screening'),
  );
  assert.equal(eng.length, 1);
  assert.equal(eng[0].opportunities.length, 3);
  assert.equal(eng[0].filmTitle, 'Screen Unseen: September 21');
  // Weak parent "amc" must not drop event metadata or invent film_id.
  assert.equal(eng[0].filmId, null);
  assert.ok(eng[0].opportunities.every((o) => o.specialEvent.isSpecialEvent));
});

test('ticket actions keep the exact special-event opportunityKey', () => {
  const home = homeFromShowtimes([
    showtime({
      id: 'ord',
      film_title: 'The Weight',
      showtime_film_key: 'weight',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '14:00',
      time_display: '2:00 PM',
      ticket_url: 'https://example.com/tickets/ordinary',
    }),
    showtime({
      id: 'evt',
      film_title: 'The Weight Early Access',
      showtime_film_key: 'weight',
      parent_film_key: 'weight',
      parent_display_title: 'The Weight',
      theater_id: 'amc-1',
      date: '2026-09-17',
      time: '19:00',
      time_display: '7:00 PM',
      ticket_url: 'https://example.com/tickets/event-only',
      special_event: se(['early_access'], ['Early Access']),
    }),
  ]);
  const page = composeSpecialEventsPage(home, { now: NOW });
  const detail = composeSpecialEventsDetail(
    home,
    page.engagements[0].engagementId,
    { now: NOW },
  );
  const eventOpp = home.opportunities.find((o) => o.specialEvent?.isSpecialEvent);
  const ordinaryOpp = home.opportunities.find((o) => !o.specialEvent?.isSpecialEvent);
  assert.ok(eventOpp && ordinaryOpp);
  assert.notEqual(eventOpp.opportunityKey, ordinaryOpp.opportunityKey);
  assert.equal(detail.showtimes.length, 1);
  assert.equal(detail.showtimes[0].opportunityKey, eventOpp.opportunityKey);
  assert.equal(detail.showtimes[0].ticketUrl, 'https://example.com/tickets/event-only');
  assert.notEqual(detail.showtimes[0].ticketUrl, ordinaryOpp.ticketUrl);
});

test('Explore tab stays active; back restores Special Events', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.specialEvents,
    originPrimary: 'explore',
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Explore');

  nav = openSpecialEventsDetail(nav, {
    engagementId: 'weight::early_access::early access',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Special Events');

  nav = openFilmDetail(nav, {
    filmKey: 'weight',
    opportunityKey: 'opp-1',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(
    resolveFilmDetailBackLabel('explore', nav.surface.returnSurface),
    'Special Events',
  );

  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'special-events-detail');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'collection');
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.specialEvents);
});

test('unavailable vs empty messaging; scaffold language removed', () => {
  const unavailable = composeSpecialEventsPage(null, {
    loadStatus: 'unavailable',
  });
  assert.equal(unavailable.state, 'unavailable');
  assert.match(unavailable.emptyMessage, /isn’t available/i);

  const emptyHome = homeFromShowtimes([]);
  const empty = composeSpecialEventsPage(emptyHome, { now: NOW });
  assert.equal(empty.emptyMessage, 'No special events are scheduled right now.');

  assert.doesNotMatch(CATALOG_SRC, /not stably modeled/);
  assert.doesNotMatch(PAGE_SRC, /not available yet/);
  assert.match(APP_SRC, /isSpecialEvents/);
  assert.match(APP_SRC, /SpecialEventsSurface/);
  assert.match(APP_SRC, /SpecialEventsDetailSurface/);
  assert.match(DETAIL_SRC, /Get Tickets/);
  assert.match(DETAIL_SRC, /opportunityKey/);
});

test('live HomeData preserves high-confidence special events into engagements', () => {
  // Reads production showtimes_current.json. Assert only feed-stable
  // adapter/page invariants — not exact counts or currently-playing titles.
  // Detailed grouping/Q&A/community-screening behavior is covered by fixtures above.
  const showtimes = JSON.parse(
    readFileSync(join(ROOT, 'public/data/showtimes_current.json'), 'utf8'),
  );
  const theaters = JSON.parse(
    readFileSync(join(ROOT, 'public/data/theaters.json'), 'utf8'),
  );
  const newly = JSON.parse(
    readFileSync(join(ROOT, 'public/data/newly_added_current.json'), 'utf8'),
  );
  const rawHigh = showtimes.showtimes.filter(
    (s) =>
      s.special_event?.is_special_event === true &&
      s.special_event?.confidence === 'high',
  );
  assert.ok(
    rawHigh.length > 0,
    'expected showtimes_current to include high-confidence special events',
  );

  const home = buildHomeData({
    showtimesCurrent: showtimes,
    theatersRegistry: theaters,
    newlyAdded: newly,
  });
  const homeHigh = home.opportunities.filter(
    (o) =>
      o.specialEvent?.isSpecialEvent === true &&
      o.specialEvent?.confidence === 'high',
  );
  // buildHomeData must not drop high-confidence special-event showtimes.
  assert.equal(rawHigh.length, homeHigh.length);
  for (const opportunity of homeHigh) {
    assert.equal(opportunity.specialEvent?.isSpecialEvent, true);
    assert.equal(opportunity.specialEvent?.confidence, 'high');
    assert.ok(isQualifyingSpecialEventOpportunity(opportunity));
  }

  const page = composeSpecialEventsPage(home, { now: NOW });
  assert.equal(page.loadStatus, 'ready');
  assert.ok(page.state === 'ready' || page.state === 'empty');
  assert.ok(Array.isArray(page.engagements));
  assert.equal(page.visibleCount, page.engagements.length);
  // Grouping collapses identical performances and drops dates before `now`,
  // so visible engagements never exceed the source high-confidence set.
  assert.ok(page.visibleCount <= homeHigh.length);
  assert.ok(page.visibleCount > 0);

  const sectionEngagementTotal = (page.sections || []).reduce(
    (sum, section) => sum + (section.engagements?.length || 0),
    0,
  );
  assert.equal(sectionEngagementTotal, page.visibleCount);

  const seenIds = new Set();
  for (const engagement of page.engagements) {
    assert.equal(typeof engagement.engagementId, 'string');
    assert.ok(engagement.engagementId.length > 0);
    assert.equal(seenIds.has(engagement.engagementId), false);
    seenIds.add(engagement.engagementId);
    assert.equal(typeof engagement.filmTitle, 'string');
    assert.ok(engagement.filmTitle.length > 0);
    assert.ok(Array.isArray(engagement.opportunities));
    assert.ok(engagement.opportunities.length >= 1);
    assert.equal(
      engagement.moreCount,
      Math.max(0, engagement.opportunities.length - 1),
    );
    for (const opportunity of engagement.opportunities) {
      assert.ok(isQualifyingSpecialEventOpportunity(opportunity));
      assert.equal(opportunity.specialEvent?.confidence, 'high');
    }
  }
});
