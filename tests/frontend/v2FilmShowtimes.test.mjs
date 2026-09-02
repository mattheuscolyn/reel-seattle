/**
 * Film Showtimes page — Film Detail → See all showtimes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import { composeFilmShowtimesPresentation } from '../../v2/showtimes/composeFilmShowtimesPresentation.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openShowtimes,
  openTheaterDetail,
} from '../../v2/navigation/navState.js';
import { normalizeExternalTicketUrl } from '../../v2/ticket/externalTicketUrl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/ShowtimesSurface.jsx'),
  'utf8',
);
const COMPOSER = readFileSync(
  join(ROOT, 'v2/showtimes/composeFilmShowtimesPresentation.js'),
  'utf8',
);
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const FD = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

/** Fixed Pacific-day: 2026-08-01 15:00 PDT ≈ 22:00 UTC */
const NOW = new Date('2026-08-01T22:00:00.000Z');

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'spider',
        filmId: 'tmdb:1001',
        title: 'Spider Source Title',
        runtimeMin: 130,
        posterUrl: 'https://example.com/source-spider.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'spider-sensory',
        filmId: 'tmdb:1001',
        title: 'Spider Source Title (Sensory Friendly)',
        runtimeMin: 130,
        posterUrl: 'https://example.com/source-spider.jpg',
        parentFilmKey: 'spider',
        screeningVariantType: 'sensory',
      },
      {
        filmKey: 'spider-other',
        filmId: 'tmdb:2002',
        title: 'Spider Source Title',
        runtimeMin: 90,
        posterUrl: 'https://example.com/other.jpg',
        parentFilmKey: null,
      },
      {
        filmKey: 'live-event',
        filmId: null,
        title: 'Grateful Dead Meetup',
        runtimeMin: null,
        posterUrl: null,
        parentFilmKey: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'past-day',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-07-31',
        localTime: '20:00',
        sortableLocalDateTime: '2026-07-31T20:00',
        timeDisplay: '8:00 PM',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/past',
      },
      {
        opportunityKey: 'today-past',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '10:00',
        sortableLocalDateTime: '2026-08-01T10:00',
        timeDisplay: '10:00 AM',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/past-today',
      },
      {
        opportunityKey: 'today-imax',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        timeDisplay: '7:00 PM',
        formatLabels: ['IMAX'],
        ticketUrl: 'https://tickets.example/imax',
      },
      {
        opportunityKey: 'today-digital',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '16:30',
        sortableLocalDateTime: '2026-08-01T16:30',
        timeDisplay: '4:30 PM',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/digital',
      },
      {
        opportunityKey: 'today-alder',
        filmKey: 'spider',
        theaterId: 'amc-alder',
        theaterName: 'AMC Alderwood Mall 16',
        localDate: '2026-08-01',
        localTime: '18:15',
        sortableLocalDateTime: '2026-08-01T18:15',
        timeDisplay: '6:15 PM',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      // Duplicate of today-imax (same dedupe identity)
      {
        opportunityKey: 'today-imax-dup',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        timeDisplay: '7:00 PM',
        formatLabels: ['IMAX'],
        ticketUrl: 'https://tickets.example/imax-dup',
      },
      {
        opportunityKey: 'sensory-today',
        filmKey: 'spider-sensory',
        theaterId: 'amc-pacific',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-08-01',
        localTime: '17:00',
        sortableLocalDateTime: '2026-08-01T17:00',
        timeDisplay: '5:00 PM',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/sensory',
        screeningVariantType: 'sensory',
      },
      {
        opportunityKey: 'other-title-today',
        filmKey: 'spider-other',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-01T20:00',
        timeDisplay: '8:00 PM',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/other',
      },
      {
        opportunityKey: 'tm-south',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-02',
        localTime: '14:00',
        sortableLocalDateTime: '2026-08-02T14:00',
        timeDisplay: '2:00 PM',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/tm',
      },
      {
        opportunityKey: 'empty-day-none',
        filmKey: 'spider',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-04',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-04T19:00',
        timeDisplay: '7:00 PM',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      {
        opportunityKey: 'event-today',
        filmKey: 'live-event',
        theaterId: 'beacon',
        theaterName: 'The Beacon',
        localDate: '2026-08-01',
        localTime: '19:30',
        sortableLocalDateTime: '2026-08-01T19:30',
        timeDisplay: '7:30 PM',
        formatLabels: [],
        ticketUrl: 'https://tickets.example/event',
      },
    ],
  };
}

function enrichmentIndex() {
  return buildEnrichmentIndex({
    version: 1,
    generated_at: '2026-08-01T00:00:00Z',
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films: [
      {
        film_id: 'tmdb:1001',
        display_title: 'Spider-Man: Brand New Day',
        release_year: 2026,
        runtime_minutes: 135,
        us_certification: 'PG-13',
        poster: { path: '/spider.jpg' },
        backdrop: { path: '/spider-bd.jpg' },
        genres: [
          { id: 1, name: 'Action' },
          { id: 2, name: 'Adventure' },
        ],
      },
      {
        film_id: 'tmdb:2002',
        display_title: 'Spider-Man: Brand New Day (1967)',
        release_year: 1967,
        runtime_minutes: 90,
        us_certification: 'G',
        poster: { path: '/other.jpg' },
        backdrop: { path: '/other-bd.jpg' },
        genres: [{ id: 3, name: 'Animation' }],
      },
    ],
  });
}

test('Film Detail See all showtimes opens film-scoped showtimes surface', () => {
  assert.ok(FD.includes('See all showtimes'));
  assert.ok(FD.includes('onOpenShowtimes'));
  assert.ok(APP.includes('openShowtimes'));
  assert.ok(APP.includes('ShowtimesSurface'));
  assert.ok(APP.includes('enrichmentIndex={enrichmentState.index}'));
  assert.match(APP, /isShowtimes[\s\S]*onOpenTheaterDetail/);

  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'spider',
    opportunityKey: 'today-imax',
    originPrimary: 'explore',
  });
  nav = openShowtimes(nav, {
    filmKey: 'spider',
    opportunityKey: 'today-imax',
  });
  assert.equal(nav.surface.type, 'showtimes');
  assert.equal(nav.surface.filmKey, 'spider');
  assert.equal(nav.surface.opportunityKey, 'today-imax');
  assert.equal(nav.surface.returnSurface?.type, 'film-detail');

  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'spider');
});

test('designed surface replaces scaffold / deferred copy', () => {
  assert.equal(SURFACE.includes('scaffold'), false);
  assert.equal(SURFACE.includes('deferred'), false);
  assert.equal(SURFACE.includes('Film filter active'), false);
  assert.equal(SURFACE.includes('v2-film-detail-back'), false);
  assert.ok(SURFACE.includes('composeFilmShowtimesPresentation'));
  assert.ok(SURFACE.includes('v2-st-theater-card'));
  assert.ok(SURFACE.includes('v2-st-best-option'));
  assert.ok(SURFACE.includes('Add to calendar'));
  assert.ok(SURFACE.includes('ShowtimeActionSheet'));
  assert.ok(SURFACE.includes('resolveHomeOpportunity'));
  assert.equal(SURFACE.includes('externalTicketLinkProps'), false);
  assert.ok(SURFACE.includes('Theater'));
  assert.ok(SURFACE.includes('Format'));
  assert.ok(SURFACE.includes('Sort'));
  assert.ok(CSS.includes('.v2-st-theater-card'));
  assert.ok(CSS.includes('.v2-st-best-option'));
  assert.ok(CSS.includes('flex-wrap: nowrap'));
  assert.ok(COMPOSER.includes('enrichHomeFilm'));
  assert.ok(APP.includes("isShowtimes"));
  assert.match(APP, /isShowtimes[\s\S]*backLabel[\s\S]*Film/);
});

test('canonical film selected with TMDB presentation when enrichment joins', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    enrichmentIndex: enrichmentIndex(),
  });
  assert.equal(view.resolved, true);
  assert.equal(view.filmKey, 'spider');
  assert.equal(view.filmId, 'tmdb:1001');
  assert.equal(view.title, 'Spider-Man: Brand New Day');
  assert.equal(view.posterUrl, 'https://image.tmdb.org/t/p/w500/spider.jpg');
  assert.match(view.metaLine ?? '', /PG-13/);
});

test('real date grouping excludes past days and started today times', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
  });
  const ids = view.dateChips.map((c) => c.id);
  assert.ok(ids.includes('2026-08-01'));
  assert.ok(ids.includes('2026-08-02'));
  assert.ok(!ids.includes('2026-07-31'));
  assert.equal(view.selectedDate, '2026-08-01');
  assert.equal(
    view.dateChips.find((c) => c.id === '2026-08-01')?.isToday,
    true,
  );
  assert.equal(
    view.dateChips.find((c) => c.id === '2026-08-01')?.label,
    'Today',
  );
  assert.equal(
    view.dateChips.find((c) => c.id === '2026-08-02')?.isToday,
    false,
  );
  assert.notEqual(
    view.dateChips.find((c) => c.id === '2026-08-02')?.label,
    'Today',
  );

  const keys = view.theaterGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.ok(!keys.includes('past-day'));
  assert.ok(!keys.includes('today-past'));
  assert.ok(keys.includes('today-imax'));
  assert.ok(keys.includes('today-digital'));
});

test('shared screening attributes lift to theater card; distinct stay on pills', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  const alder = view.theaterGroups.find((g) => g.theaterId === 'amc-alder');
  assert.ok(alder);
  assert.equal(alder.times[0].detailLabel, null);

  const south = view.theaterGroups.find((g) => g.theaterId === 'amc-south');
  assert.ok(south);
  assert.ok(south.isBestCard);
  const imax = south.times.find((t) => t.opportunityKey === 'today-imax');
  const digital = south.times.find((t) => t.opportunityKey === 'today-digital');
  assert.ok(imax?.detailLabel);
  assert.match(imax.detailLabel, /IMAX/i);
  assert.equal(digital?.isBest, false);
});

test('multiple theaters; each group only contains its showtimes', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  assert.ok(view.theaterCount >= 2);
  for (const group of view.theaterGroups) {
    for (const time of group.times) {
      const opp = sampleHome().opportunities.find(
        (o) => o.opportunityKey === time.opportunityKey,
      );
      assert.equal(opp.theaterId, group.theaterId);
    }
  }
  const south = view.theaterGroups.find((g) => g.theaterId === 'amc-south');
  const alder = view.theaterGroups.find((g) => g.theaterId === 'amc-alder');
  assert.ok(south);
  assert.ok(alder);
  assert.ok(south.times.every((t) => !t.opportunityKey.includes('alder')));
});

test('multiple formats preserved; premium marks best option', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  const formatKeys = new Set(view.formatOptions.map((f) => f.key));
  assert.ok(formatKeys.has('imax'));
  const best = view.theaterGroups
    .flatMap((g) => g.times)
    .find((t) => t.isBest);
  assert.equal(best?.opportunityKey, 'today-imax');
  assert.equal(view.bestOpportunityKey, 'today-imax');
});

test('screening variant resolves into parent family showtimes', () => {
  const fromParent = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  const fromVariant = composeFilmShowtimesPresentation(
    sampleHome(),
    'spider-sensory',
    { now: NOW, selectedDate: '2026-08-01' },
  );
  const parentKeys = fromParent.theaterGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  const variantKeys = fromVariant.theaterGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.ok(parentKeys.includes('sensory-today'));
  assert.ok(variantKeys.includes('today-imax'));
  assert.ok(variantKeys.includes('sensory-today'));
  const sensoryGroup = fromParent.theaterGroups.find((g) =>
    g.times.some((t) => t.opportunityKey === 'sensory-today'),
  );
  const sensory = sensoryGroup?.times.find(
    (t) => t.opportunityKey === 'sensory-today',
  );
  const sensoryAttr =
    sensory?.detailLabel ||
    sensoryGroup?.sharedChips?.map((c) => c.label).join(' ') ||
    '';
  assert.match(sensoryAttr, /Sensory/i);
});

test('same-title films with different identities stay distinct', () => {
  const a = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  const b = composeFilmShowtimesPresentation(sampleHome(), 'spider-other', {
    now: NOW,
    selectedDate: '2026-08-01',
    enrichmentIndex: enrichmentIndex(),
  });
  const aKeys = a.theaterGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  const bKeys = b.theaterGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.ok(aKeys.includes('today-imax'));
  assert.ok(!aKeys.includes('other-title-today'));
  assert.deepEqual(bKeys, ['other-title-today']);
  assert.equal(b.filmId, 'tmdb:2002');
  assert.equal(b.title, 'Spider-Man: Brand New Day (1967)');
});

test('source-based event without TMDB id still presents', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'live-event', {
    now: NOW,
  });
  assert.equal(view.resolved, true);
  assert.equal(view.filmId, null);
  assert.equal(view.title, 'Grateful Dead Meetup');
  assert.equal(view.theaterGroups[0]?.times[0]?.opportunityKey, 'event-today');
  assert.equal(
    view.theaterGroups[0]?.times[0]?.ticketUrl,
    normalizeExternalTicketUrl('https://tickets.example/event'),
  );
});

test('empty selected date is honest; filters empty distinctly', () => {
  const emptyDate = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-03',
  });
  // 2026-08-03 not in chips — composer falls back to a real available date
  assert.ok(emptyDate.selectedDate !== '2026-08-03');

  const filtered = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
    formatKeys: ['70mm'],
  });
  assert.equal(filtered.empty, true);
  assert.equal(filtered.emptyMessage, 'No showtimes match these filters.');
});

test('theater scope and sort by theater', () => {
  const scoped = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
    theaterId: 'amc-alder',
  });
  assert.equal(scoped.theaterCount, 1);
  assert.equal(scoped.theaterGroups[0].theaterId, 'amc-alder');

  const byTheater = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
    sortId: 'theater',
  });
  const names = byTheater.theaterGroups.map((g) => g.theaterName);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test('Theater Detail navigation and ticket URLs from showtimes', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'spider', originPrimary: 'explore' });
  nav = openShowtimes(nav, { filmKey: 'spider' });
  const showtimesSurface = nav.surface;
  nav = openTheaterDetail(nav, {
    theaterId: 'amc-south',
    originPrimary: 'explore',
    returnSurface: showtimesSurface,
  });
  assert.equal(nav.surface.type, 'theater-detail');
  assert.equal(nav.surface.theaterId, 'amc-south');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'showtimes');

  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  const withTicket = view.theaterGroups
    .flatMap((g) => g.times)
    .find((t) => t.opportunityKey === 'today-imax');
  assert.equal(
    withTicket.ticketUrl,
    normalizeExternalTicketUrl('https://tickets.example/imax'),
  );
  const without = view.theaterGroups
    .flatMap((g) => g.times)
    .find((t) => t.opportunityKey === 'today-alder');
  assert.equal(without.ticketUrl, null);
});

test('mobile rendering structure uses wrapping times and bottom padding', () => {
  assert.ok(SURFACE.includes('role="toolbar"'));
  assert.ok(SURFACE.includes('aria-label="Showtime dates"'));
  assert.match(CSS, /\.v2-st-times\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(CSS, /\.v2-st-dates\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(CSS, /\.v2-st\s*\{[^}]*padding:[^}]*5\.75rem/);
  assert.match(CSS, /\.v2-st-theater-name\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test('dedupe drops duplicate showtimes from parent/variant grouping', () => {
  const view = composeFilmShowtimesPresentation(sampleHome(), 'spider', {
    now: NOW,
    selectedDate: '2026-08-01',
  });
  const keys = view.theaterGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.equal(keys.filter((k) => k === 'today-imax').length, 1);
  assert.ok(!keys.includes('today-imax-dup'));
});
