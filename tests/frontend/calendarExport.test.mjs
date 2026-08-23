import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALENDAR_PRODID,
  CALENDAR_TIMEZONE,
  buildCalendarDownload,
  buildCalendarFilename,
  buildPlanCalendarDownload,
  buildPlanCalendarEvents,
  buildShowtimeCalendarDownload,
  buildShowtimeCalendarEvent,
  buildShowtimeCalendarUid,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtcStamp,
  pacificWallTimeToUtcDate,
  serializeCalendar,
} from '../../src/utils/calendarExport.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE_SRC = readFileSync(
  join(ROOT, 'src/utils/calendarExport.js'),
  'utf8',
);

function fixedNow(iso) {
  return () => new Date(iso);
}

const BASE_SHOWTIME = Object.freeze({
  title: 'The Odyssey',
  date: '2026-07-25',
  time: '7:00PM',
  runtime: 120,
  theater: 'The Beacon',
  theater_id: 'the-beacon',
  filmKey: 'the-odyssey',
  format: '70mm',
  ticket_url: 'https://tickets.example/beacon/odyssey',
  publicShowtimeId: 'pub-odyssey-1',
});

test('valid showtime creates one event with advertised start and buffered end', () => {
  const result = buildShowtimeCalendarEvent(BASE_SHOWTIME);
  assert.equal(result.ok, true);
  assert.equal(result.event.title, 'The Odyssey — 70mm');
  assert.equal(result.event.timezone, CALENDAR_TIMEZONE);
  assert.equal(result.event.location, 'The Beacon');
  assert.equal(result.event.url, 'https://tickets.example/beacon/odyssey');

  // 7:00PM PDT on 2026-07-25 → 02:00Z next calendar day.
  assert.equal(formatIcsUtcStamp(result.event.start), '20260726T020000Z');
  // End = start + 120 = 9:00PM PDT → 04:00Z.
  assert.equal(formatIcsUtcStamp(result.event.end), '20260726T040000Z');
  assert.equal(
    result.event.end.getTime() - result.event.start.getTime(),
    120 * 60_000,
  );

  const withAddress = buildShowtimeCalendarEvent({
    ...BASE_SHOWTIME,
    addressLine1: '4405 Rainier Ave S',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98118',
  });
  assert.equal(withAddress.ok, true);
  assert.equal(
    withAddress.event.location,
    'The Beacon, 4405 Rainier Ave S, Seattle, WA 98118',
  );
});

test('scheduling end is start + runtime; missing runtime and identity fail', () => {
  const once = buildShowtimeCalendarEvent(BASE_SHOWTIME);
  assert.equal(once.ok, true);
  assert.equal(
    once.event.end.getTime() - once.event.start.getTime(),
    120 * 60_000,
  );

  const noRuntime = buildShowtimeCalendarEvent({
    ...BASE_SHOWTIME,
    runtime: null,
  });
  assert.equal(noRuntime.ok, false);
  assert.equal(noRuntime.error.code, 'missing_runtime');

  const noIdentity = buildShowtimeCalendarEvent({
    title: 'Alpha',
    date: '2026-07-25',
    time: '7:00PM',
    runtime: 90,
    theater: 'Somewhere',
  });
  assert.equal(noIdentity.ok, false);
  assert.equal(noIdentity.error.code, 'missing_identity');

  const noTitle = buildShowtimeCalendarEvent({
    ...BASE_SHOWTIME,
    title: '',
    film: '',
    Film: '',
  });
  assert.equal(noTitle.ok, false);
  assert.equal(noTitle.error.code, 'missing_title');
});

test('midnight rollover and Pacific winter DST', () => {
  const late = buildShowtimeCalendarEvent({
    title: 'Late Show',
    date: '2026-07-25',
    time: '11:30PM',
    runtime: 120,
    theater_id: 'the-beacon',
    filmKey: 'late-show',
  });
  assert.equal(late.ok, true);
  // Start 11:30PM PDT → 06:30Z next day; end +120m → 08:30Z.
  assert.equal(formatIcsUtcStamp(late.event.start), '20260726T063000Z');
  assert.equal(formatIcsUtcStamp(late.event.end), '20260726T083000Z');

  const winter = buildShowtimeCalendarEvent({
    title: 'Winter Film',
    date: '2026-01-15',
    time: '7:00PM',
    runtime: 100,
    theater_id: 'the-beacon',
    filmKey: 'winter-film',
  });
  assert.equal(winter.ok, true);
  // PST (UTC-8): 7:00PM → 03:00Z next day; +100m → 04:40Z.
  assert.equal(formatIcsUtcStamp(winter.event.start), '20260116T030000Z');
  assert.equal(formatIcsUtcStamp(winter.event.end), '20260116T044000Z');

  const h24 = buildShowtimeCalendarEvent({
    title: 'Twenty Four',
    date: '2026-07-25',
    time: '19:00',
    runtime: 90,
    theater_id: 'the-beacon',
    filmKey: 'twenty-four',
  });
  assert.equal(h24.ok, true);
  assert.equal(formatIcsUtcStamp(h24.event.start), '20260726T020000Z');
});

test('UID precedence is stable and independent of export clock', () => {
  const withPublic = buildShowtimeCalendarEvent(BASE_SHOWTIME, {
    now: fixedNow('2026-07-25T12:00:00.000Z'),
  });
  const again = buildShowtimeCalendarEvent(BASE_SHOWTIME, {
    now: fixedNow('2026-08-01T00:00:00.000Z'),
  });
  assert.equal(withPublic.ok, true);
  assert.equal(again.ok, true);
  assert.equal(withPublic.event.uid, again.event.uid);
  assert.match(withPublic.event.uid, /pub-odyssey-1/);

  const sourceOnly = buildShowtimeCalendarEvent({
    title: 'Source Film',
    date: '2026-07-25',
    time: '8:00PM',
    runtime: 90,
    source: 'amc',
    source_showtime_id: '3387540',
    theater_id: 'amc-pacific-place-11',
    filmKey: 'source-film',
  });
  assert.equal(sourceOnly.ok, true);
  assert.match(sourceOnly.event.uid, /amc/);
  assert.match(sourceOnly.event.uid, /3387540/);

  const composite = buildShowtimeCalendarEvent({
    title: 'Composite',
    date: '2026-07-25',
    time: '6:00PM',
    runtime: 90,
    theater_id: 'central-cinema',
    filmKey: 'composite-film',
  });
  assert.equal(composite.ok, true);
  assert.match(composite.event.uid, /composite-film/);
  assert.match(composite.event.uid, /central-cinema/);

  assert.notEqual(withPublic.event.uid, sourceOnly.event.uid);
  assert.notEqual(sourceOnly.event.uid, composite.event.uid);

  const start = withPublic.event.start;
  assert.equal(
    buildShowtimeCalendarUid(BASE_SHOWTIME, start),
    withPublic.event.uid,
  );
});

test('ICS serialization uses CRLF, escaping, folding, and injected DTSTAMP', () => {
  const built = buildShowtimeCalendarEvent({
    ...BASE_SHOWTIME,
    title: 'Comma, Semicolon; Slash\\ Film',
    theater: 'Line\nBreak Theater',
  });
  assert.equal(built.ok, true);
  const ics = serializeCalendar([built.event], {
    now: fixedNow('2026-07-25T18:00:00.000Z'),
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nVERSION:2.0\r\n/);
  assert.match(ics, new RegExp(`PRODID:${CALENDAR_PRODID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(ics, /\r\nCALSCALE:GREGORIAN\r\n/);
  assert.match(ics, /\r\nBEGIN:VEVENT\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20260725T180000Z\r\n/);
  assert.match(ics, /\r\nDTSTART:20260726T020000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260726T040000Z\r\n/);
  assert.match(ics, /SUMMARY:Comma\\, Semicolon\\; Slash\\\\ Film/);
  assert.match(ics, /LOCATION:Line\\nBreak Theater/);
  assert.match(ics, /\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n$/);
  assert.equal(ics.includes('\n\n'), false);
  assert.equal(/[^\\]\\n/.test('x'), false);

  assert.equal(escapeIcsText('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
  const long = `SUMMARY:${'Å'.repeat(80)}`;
  const folded = foldIcsLine(long);
  assert.ok(folded.includes('\r\n '));
  for (const segment of folded.split('\r\n')) {
    assert.ok(new TextEncoder().encode(segment).length <= 75);
  }
});

test('multiple events serialize in deterministic start order', () => {
  const a = buildShowtimeCalendarEvent({
    title: 'Second',
    date: '2026-07-25',
    time: '9:00PM',
    runtime: 90,
    theater_id: 'the-beacon',
    filmKey: 'second',
  });
  const b = buildShowtimeCalendarEvent({
    title: 'First',
    date: '2026-07-25',
    time: '5:00PM',
    runtime: 90,
    theater_id: 'the-beacon',
    filmKey: 'first',
  });
  assert.equal(a.ok && b.ok, true);
  const ics = serializeCalendar([a.event, b.event], {
    now: fixedNow('2026-07-25T12:00:00.000Z'),
  });
  const firstIdx = ics.indexOf('SUMMARY:First');
  const secondIdx = ics.indexOf('SUMMARY:Second');
  assert.ok(firstIdx > 0 && secondIdx > firstIdx);
});

test('plan export creates one event per film; invalid item fails closed', () => {
  const plan = {
    title: 'Capitol Hill night',
    planId: 'plan-1',
    movies: [
      {
        title: 'Alpha',
        date: '07/25/2026',
        time: '5:00PM',
        runtime: '90',
        theater: 'The Beacon',
        theater_id: 'the-beacon',
        filmKey: 'alpha',
      },
      {
        title: 'Beta',
        date: '07/25/2026',
        time: '7:30PM',
        runtime: '100',
        theater: 'The Beacon',
        theater_id: 'the-beacon',
        filmKey: 'beta',
      },
    ],
  };
  const built = buildPlanCalendarEvents(plan);
  assert.equal(built.ok, true);
  assert.equal(built.events.length, 2);
  assert.match(built.events[0].description ?? '', /Reel Seattle plan: Capitol Hill night/);
  assert.match(built.events[1].description ?? '', /Reel Seattle plan: Capitol Hill night/);
  assert.equal(
    built.events[0].end.getTime() - built.events[0].start.getTime(),
    90 * 60_000,
  );

  const bad = buildPlanCalendarEvents({
    title: 'Broken',
    movies: [
      plan.movies[0],
      { ...plan.movies[1], runtime: null },
    ],
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'invalid_plan_item');

  const empty = buildPlanCalendarEvents({ title: 'Empty', movies: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, 'empty_plan');
});

test('filenames are deterministic and date from event start', () => {
  const download = buildShowtimeCalendarDownload(BASE_SHOWTIME, {
    now: fixedNow('2030-01-01T00:00:00.000Z'),
  });
  assert.equal(download.ok, true);
  assert.equal(download.filename, 'reel-seattle-the-odyssey-2026-07-25.ics');

  const planDl = buildPlanCalendarDownload({
    title: 'Day',
    movies: [
      {
        title: 'A',
        date: '2026-07-25',
        time: '5:00PM',
        runtime: 90,
        theater_id: 'the-beacon',
        filmKey: 'a',
      },
      {
        title: 'B',
        date: '2026-07-25',
        time: '8:00PM',
        runtime: 90,
        theater_id: 'the-beacon',
        filmKey: 'b',
      },
    ],
  });
  assert.equal(planDl.ok, true);
  assert.equal(planDl.filename, 'reel-seattle-movie-plan-2026-07-25.ics');

  assert.equal(
    buildCalendarFilename([], { kind: 'plan' }),
    'reel-seattle-movie-plan-event.ics',
  );
});

test('ticket URL omitted when invalid; format not duplicated in title', () => {
  const noTicket = buildShowtimeCalendarEvent({
    ...BASE_SHOWTIME,
    ticket_url: '/relative',
    publicShowtimeId: 'pub-2',
  });
  assert.equal(noTicket.ok, true);
  assert.equal(noTicket.event.url, null);

  const alreadyFormatted = buildShowtimeCalendarEvent({
    ...BASE_SHOWTIME,
    title: 'The Odyssey — 70mm',
    format: '70mm',
    publicShowtimeId: 'pub-3',
  });
  assert.equal(alreadyFormatted.ok, true);
  assert.equal(alreadyFormatted.event.title, 'The Odyssey — 70mm');
});

test('naive local time is not labeled as UTC; Pacific wall conversion works', () => {
  const summer = pacificWallTimeToUtcDate(2026, 7, 25, 19, 0);
  assert.equal(formatIcsUtcStamp(summer), '20260726T020000Z');
  const winter = pacificWallTimeToUtcDate(2026, 1, 15, 19, 0);
  assert.equal(formatIcsUtcStamp(winter), '20260116T030000Z');
});

test('module stays local-only: no OAuth, Google APIs, or fixture seeds', () => {
  assert.equal(MODULE_SRC.includes('googleapis'), false);
  assert.equal(MODULE_SRC.includes('oauth'), false);
  assert.equal(MODULE_SRC.includes('filmDetailMockup'), false);
  assert.equal(MODULE_SRC.includes('localStorage'), false);
  assert.match(MODULE_SRC, /No Google\/Apple APIs/);
});

test('buildCalendarDownload wraps serialize without mutating caller events', () => {
  const built = buildShowtimeCalendarEvent(BASE_SHOWTIME);
  assert.equal(built.ok, true);
  const events = [built.event];
  const snapshot = structuredClone({
    uid: events[0].uid,
    title: events[0].title,
  });
  const download = buildCalendarDownload(events, {
    now: fixedNow('2026-07-25T18:00:00.000Z'),
    kind: 'showtime',
  });
  assert.equal(download.ok, true);
  assert.match(download.ics, /BEGIN:VCALENDAR/);
  assert.equal(events[0].uid, snapshot.uid);
  assert.equal(events[0].title, snapshot.title);
});
