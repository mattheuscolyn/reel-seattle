import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlanWithFilmPath,
  buildPlannerFilterShareUrl,
  formatPlannerLineupShareText,
  PLANNER_LINEUP_SHARE_SITE_NAME,
} from '../../src/utils/plannerShare.js';

const sampleTwoFilmSchedule = {
  theater: 'AMC Pacific Place 11',
  filmCount: 2,
  startMin: 840,
  endMin: 1126,
  totalSpanMin: 286,
  filmRuntimeMin: 243,
  gapTimeMin: 32,
  movies: [
    {
      film: 'Sinners',
      showtime_film_key: 'sinners',
      date: '06/28/2026',
      time: '2:00PM',
      startMin: 840,
      endMin: 977,
      runtime: 137,
    },
    {
      film: 'Materialists',
      showtime_film_key: 'materialists',
      date: '06/28/2026',
      time: '4:49PM',
      startMin: 1009,
      endMin: 1126,
      runtime: 106,
    },
  ],
};

test('formatPlannerLineupShareText builds readable multi-line share text', () => {
  const text = formatPlannerLineupShareText(sampleTwoFilmSchedule, {
    filterUrl: 'https://example.com/planner?date=06%2F28%2F2026&count=2',
  });

  assert.match(text, /^Reel Seattle movie plan/);
  assert.match(text, /AMC Pacific Place 11 · 06\/28\/2026/);
  assert.match(text, /2 films · .+ total · 32 min between films/);
  assert.match(text, /1\. Sinners — 2:00PM–4:17PM \(137 min\)/);
  assert.match(text, /Gap: 32 min/);
  assert.match(text, /2\. Materialists — 4:49PM–6:46PM \(106 min\)/);
  assert.match(text, /Find similar plans: https:\/\/example.com\/planner\?date=06%2F28%2F2026&count=2/);
});

test('formatPlannerLineupShareText omits filter URL when not provided', () => {
  const text = formatPlannerLineupShareText(sampleTwoFilmSchedule);
  assert.ok(!text.includes('Find similar plans:'));
});

test('formatPlannerLineupShareText supports custom site name', () => {
  const text = formatPlannerLineupShareText(sampleTwoFilmSchedule, {
    siteName: 'Test Site',
  });
  assert.match(text, /^Test Site movie plan/);
});

test('formatPlannerLineupShareText returns empty string for empty schedule', () => {
  assert.equal(formatPlannerLineupShareText({ movies: [] }), '');
  assert.equal(formatPlannerLineupShareText(null), '');
});

test('formatPlannerLineupShareText handles back-to-back films', () => {
  const schedule = {
    theater: 'SIFF Cinema Uptown',
    gapTimeMin: 0,
    totalSpanMin: 120,
    filmRuntimeMin: 120,
    movies: [
      {
        film: 'Alpha',
        date: '07/01/2026',
        time: '12:00PM',
        startMin: 720,
        endMin: 780,
        runtime: 60,
      },
      {
        film: 'Beta',
        date: '07/01/2026',
        time: '1:00PM',
        startMin: 780,
        endMin: 840,
        runtime: 60,
      },
    ],
  };

  const text = formatPlannerLineupShareText(schedule);
  assert.match(text, /Gap: Back-to-back/);
});

test('buildPlannerFilterShareUrl encodes planner state into a share URL', () => {
  const url = buildPlannerFilterShareUrl(
    {
      selectedDate: '06/28/2026',
      selectedTheaters: ['AMC Pacific Place 11'],
      filmCount: 2,
      startAfter: '',
      finishBy: '',
      minGapMin: '',
      maxGapMin: '',
      maxGapExplicit: false,
      includeFilms: [],
      excludeFilms: [],
      preferredFilms: [],
      firstFilm: '',
      lastFilm: '',
      sort: '',
      advancedOpen: false,
    },
    {
      origin: 'https://example.com',
      pathname: '/planner',
    },
  );

  assert.equal(
    url,
    'https://example.com/planner?date=06%2F28%2F2026&theaters=AMC+Pacific+Place+11',
  );
});

test('PLANNER_LINEUP_SHARE_SITE_NAME defaults to Reel Seattle', () => {
  assert.equal(PLANNER_LINEUP_SHARE_SITE_NAME, 'Reel Seattle');
});

test('buildPlanWithFilmPath encodes preferred film deep link', () => {
  const path = buildPlanWithFilmPath({
    filmKey: 'sinners',
    date: '06/29/2026',
    theaters: ['The Beacon'],
    mode: 'preferred',
  });
  assert.match(path, /^\/planner\?/);
  assert.match(path, /date=06%2F29%2F2026/);
  assert.match(path, /preferred=sinners/);
  assert.match(path, /theaters=The\+Beacon/);
});
