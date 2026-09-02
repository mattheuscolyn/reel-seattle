import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  calendarExportStatusMessage,
  exportOpportunityToCalendar,
  opportunityToCalendarInput,
  resolveTheaterForExport,
} from '../../v2/calendar/exportFromOpportunity.js';
import {
  buildShowtimeCalendarDownload,
  buildShowtimeCalendarEvent,
} from '../../src/utils/calendarExport.js';
import { resolveFilm, selectBestOpportunity } from '../../v2/filmDetail/filmDetailModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');

const FD_SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const ST_SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/ShowtimesSurface.jsx'),
  'utf8',
);
const BPR_SURFACE = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const CAL_SRC = readFileSync(join(ROOT, 'src/utils/calendarExport.js'), 'utf8');
const ADAPTER_SRC = readFileSync(
  join(ROOT, 'v2/calendar/exportFromOpportunity.js'),
  'utf8',
);

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function homeData() {
  return buildHomeData({
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
  });
}

test('T-CAL-02 keeps calendar export off Film Detail; Showtimes + Results retain it', () => {
  // Canonical Film Detail no longer shows a separate Add to calendar row.
  assert.equal(FD_SURFACE.includes('<span>Add to calendar</span>'), false);
  assert.equal(FD_SURFACE.includes('exportOpportunityToCalendar'), false);
  assert.equal(FD_SURFACE.includes('v2-fd-best-export'), false);
  assert.match(FD_SURFACE, /Add to planner/);
  // Action row stays Save · Seen · Not interested · Add to planner
  assert.equal(
    (FD_SURFACE.match(/className=\{[\s\S]*?v2-fd-action/g) || []).length >= 1,
    true,
  );
  assert.match(ST_SURFACE, /Add to calendar/);
  assert.match(ST_SURFACE, /exportOpportunityToCalendar/);
  assert.match(BPR_SURFACE, /Export plan to calendar/);
  assert.match(BPR_SURFACE, /exportPlanToCalendar/);
  assert.equal(ADAPTER_SRC.includes('oauth'), false);
  assert.equal(ADAPTER_SRC.includes('googleapis'), false);
  assert.equal(/localStorage/.test(ADAPTER_SRC), false);
});

test('addressLabel and addressLine1 pass through to LOCATION', () => {
  assert.match(CAL_SRC, /addressLabel/);
  assert.match(CAL_SRC, /addressLine1/);

  const withLabel = buildShowtimeCalendarEvent({
    title: 'Labeled',
    date: '2026-07-25',
    time: '7:00PM',
    runtime: 100,
    theater: 'The Beacon',
    theater_id: 'the-beacon',
    filmKey: 'labeled',
    addressLabel: '4405 Rainier Ave S, Seattle, WA 98118',
  });
  assert.equal(withLabel.ok, true);
  assert.equal(
    withLabel.event.location,
    'The Beacon, 4405 Rainier Ave S, Seattle, WA 98118',
  );

  const composed = buildShowtimeCalendarEvent({
    title: 'Composed',
    date: '2026-07-25',
    time: '7:00PM',
    runtime: 100,
    theater: 'The Beacon',
    theater_id: 'the-beacon',
    filmKey: 'composed',
    addressLine1: '4405 Rainier Ave S',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98118',
  });
  assert.equal(composed.ok, true);
  assert.match(composed.event.location ?? '', /4405 Rainier Ave S/);
  assert.match(composed.event.location ?? '', /Seattle/);
});

test('HomeData opportunity maps to exportable calendar input', () => {
  const data = homeData();
  assert.ok(data.opportunities?.length > 0);
  const opp = data.opportunities[0];
  const film = resolveFilm(data, opp.filmKey);
  const theater = resolveTheaterForExport(data, opp.theaterId);
  const input = opportunityToCalendarInput(opp, film, theater);
  assert.ok(input);
  assert.equal(input.title, film.title);
  assert.equal(input.date, opp.localDate);
  assert.equal(input.filmKey, opp.filmKey);
  assert.equal(input.theaterId, opp.theaterId);

  const download = buildShowtimeCalendarDownload(input);
  if (film?.runtimeMin == null) {
    assert.equal(download.ok, false);
    assert.equal(download.error.code, 'missing_runtime');
  } else {
    assert.equal(download.ok, true);
    assert.match(download.ics, /BEGIN:VCALENDAR/);
    assert.match(download.filename, /\.ics$/);
  }
});

test('best opportunity export helper fails closed without browser document', () => {
  const data = homeData();
  const film = data.films.find((f) => f.runtimeMin != null) ?? data.films[0];
  assert.ok(film);
  const opp = selectBestOpportunity(data, film.filmKey, null);
  assert.ok(opp);
  const result = exportOpportunityToCalendar({
    opportunity: opp,
    film,
    homeData: data,
  });
  // Node test has no document → download_failed (or missing_runtime).
  assert.equal(result.ok, false);
  assert.ok(
    result.error.code === 'download_failed' ||
      result.error.code === 'missing_runtime' ||
      result.error.code === 'missing_identity' ||
      result.error.code === 'invalid_timestamp',
  );
  const msg = calendarExportStatusMessage(result);
  assert.ok(typeof msg === 'string' && msg.length > 10);
});

test('adapter does not invent ticket URLs or neighborhood as address', () => {
  const input = opportunityToCalendarInput(
    {
      filmKey: 'x',
      localDate: '2026-07-25',
      localTime: '19:00',
      theaterId: 't1',
      theaterName: 'Venue',
      sourceUrl: 'https://example.com/source-only',
      ticketUrl: null,
    },
    { filmKey: 'x', title: 'X', runtimeMin: 90 },
    { id: 't1', name: 'Venue', neighborhood: 'Capitol Hill', city: 'Seattle' },
  );
  assert.ok(input);
  assert.equal(input.ticketUrl, null);
  assert.equal(input.addressLabel, undefined);
  assert.equal(input.addressLine1, null);
});
