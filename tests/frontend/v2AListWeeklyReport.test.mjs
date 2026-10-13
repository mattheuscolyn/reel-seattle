import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  A_LIST_WEEKLY_ALLOWANCE,
  buildAListWeeklyReport,
  clampAListUsed,
  readAListUsed,
  resolveAListCreditWeek,
  writeAListUsed,
} from '../../v2/planner/aListWeeklyReport.js';
import { saveFilm } from '../../v2/stores/savedFilmsStore.js';
import { markFilmSeen } from '../../v2/stores/seenFilmsStore.js';
import { markFilmNotInterested } from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = new Date('2026-10-12T12:00:00-07:00');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
function film(key, id) {
  return { filmKey: key, filmId: 'tmdb:' + id, title: key, posterUrl: null };
}
function opp(key, date, time, source = 'amc', theaterId = 'amc-pacific-place-11') {
  return {
    filmKey: key, localDate: date, localTime: time, source, theaterId,
    theaterName: theaterId, status: 'available',
    opportunityKey: key + ':' + date + ':' + time + ':' + theaterId,
  };
}
function makeHome() {
  return {
    films: [
      film('limited', 1),
      film('wide', 2),
      film('seen', 3),
      film('dismissed', 4),
      film('other', 5),
      film('siff-only', 6),
    ],
    opportunities: [
      opp('limited', '2026-10-13', '18:00'),
      opp('limited', '2026-10-15', '20:00'), // Thursday premiere uses current credits
      opp('wide', '2026-10-14', '19:00'),
      opp('wide', '2026-10-16', '20:00'), // new credits
      opp('seen', '2026-10-14', '19:00'),
      opp('dismissed', '2026-10-14', '19:00'),
      opp('other', '2026-10-14', '19:00'),
      opp('siff-only', '2026-10-14', '19:00', 'siff', 'siff-uptown'),
    ],
  };
}
function ref(key, id) {
  return { showtimeFilmKey: key, filmId: 'tmdb:' + id };
}

test('A-List week resets at 6 AM Pacific on Friday, including DST', () => {
  const before = resolveAListCreditWeek(new Date('2026-10-16T05:59:00-07:00'));
  const after = resolveAListCreditWeek(new Date('2026-10-16T06:00:00-07:00'));
  assert.equal(before.startDate, '2026-10-09');
  assert.equal(after.startDate, '2026-10-16');
  const winterBefore = resolveAListCreditWeek(new Date('2026-11-06T05:59:00-08:00'));
  const winterAfter = resolveAListCreditWeek(new Date('2026-11-06T06:00:00-08:00'));
  assert.equal(winterBefore.startDate, '2026-10-30');
  assert.equal(winterAfter.startDate, '2026-11-06');
});

test('credits used persist by credit week and are clamped to four', () => {
  const storage = memoryStorage();
  assert.equal(A_LIST_WEEKLY_ALLOWANCE, 4);
  assert.equal(readAListUsed(storage, '2026-10-09'), 0);
  assert.equal(writeAListUsed(storage, '2026-10-09', 3), true);
  assert.equal(readAListUsed(storage, '2026-10-09'), 3);
  assert.equal(readAListUsed(storage, '2026-10-16'), 0);
  assert.equal(clampAListUsed(5), 0);
  assert.equal(clampAListUsed(-1), 0);
});

test('Saved at-risk prioritized, Saved confirmed next can wait, unknown not interpreted as final', () => {
  const storage = memoryStorage();
  saveFilm(storage, ref('limited', 1), { now: () => NOW });
  saveFilm(storage, ref('wide', 2), { now: () => NOW });
  const r = buildAListWeeklyReport({ homeData: makeHome(), storage, now: NOW });
  assert.equal(r.creditsRemaining, 4);
  assert.deepEqual(r.prioritize.map((x) => x.title), ['limited']);
  assert.deepEqual(r.canWait.map((x) => x.title), ['wide']);
  assert.equal(r.prioritize[0].thisWeekShowtimes, 2);
  assert.equal(r.prioritize[0].lastThisWeek, '2026-10-15T20:00');
  assert.equal(r.canWait[0].nextWeekFirst, '2026-10-16T20:00');
  assert.match(r.prioritize[0].reason, /Few remaining AMC showtimes/);
  assert.equal(r.discover.some((x) => x.title === 'siff-only'), false);
});

test('Seen and Not Interested are always excluded, including from Must See', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, ref('seen', 3), { now: () => NOW });
  markFilmNotInterested(storage, ref('dismissed', 4), { now: () => NOW });
  const r = buildAListWeeklyReport({
    homeData: makeHome(), storage, now: NOW,
    priorityIds: ['tmdb:3', 'tmdb:4', 'tmdb:5'],
  });
  const all = [...r.prioritize, ...r.canWait, ...r.otherSaved, ...r.discover];
  assert.equal(all.some((x) => x.title === 'seen'), false);
  assert.equal(all.some((x) => x.title === 'dismissed'), false);
  assert.equal(r.prioritize[0].title, 'other');
});

test('four-credit cap and zero-credit state never allocate extra movies', () => {
  const storage = memoryStorage();
  for (const [key, id] of [['limited', 1], ['wide', 2], ['other', 5]]) {
    saveFilm(storage, ref(key, id), { now: () => NOW });
  }
  const home = makeHome();
  const r = buildAListWeeklyReport({ homeData: home, storage, now: NOW, creditsUsed: 3 });
  assert.equal(r.prioritize.length, 1);
  assert.equal(r.creditsRemaining, 1);
  const full = buildAListWeeklyReport({ homeData: home, storage, now: NOW, creditsUsed: 4 });
  assert.equal(full.prioritize.length, 0);
  assert.equal(full.creditsRemaining, 0);
});

test('Planner has an entry point and the weekly model does not claim shadow forecasts', () => {
  const src = readFileSync(join(ROOT, 'v2/planner/PlannerDestination.jsx'), 'utf8');
  const panel = readFileSync(join(ROOT, 'v2/planner/AListWeeklyPanel.jsx'), 'utf8');
  assert.match(src, /<AListWeeklyPanel/);
  assert.match(panel, /Missing future showtimes/i);
  assert.match(panel, /Experimental/i);
  const empty = buildAListWeeklyReport({ now: NOW });
  assert.equal(empty.hasData, false);
  assert.deepEqual(empty.prioritize, []);
});


test('next-week preview uses a distinct Friday 6 AM to Friday 6 AM window', () => {
  const storage = memoryStorage();
  saveFilm(storage, ref('wide', 2), { now: () => NOW });
  saveFilm(storage, ref('limited', 1), { now: () => NOW });
  const home = makeHome();
  home.films.push(film('early', 7), film('following', 8));
  home.opportunities.push(
    opp('early', '2026-10-16', '05:30'),
    opp('early', '2026-10-16', '06:30'),
    opp('following', '2026-10-23', '06:30'),
  );
  const current = buildAListWeeklyReport({ homeData: home, storage, now: NOW });
  const next = buildAListWeeklyReport({
    homeData: home, storage, now: NOW, weekOffset: 1,
  });
  assert.equal(current.week.startDate, '2026-10-09');
  assert.equal(next.week.startDate, '2026-10-16');
  assert.equal(next.week.endDate, '2026-10-23');
  assert.deepEqual(next.prioritize.map((x) => x.title), ['wide']);
  assert.equal(next.prioritize[0].thisWeekShowtimes, 1);
  assert.equal(next.discover.find((x) => x.title === 'early').thisWeekShowtimes, 1);
  assert.equal(next.discover.find((x) => x.title === 'following'), undefined);
  assert.equal(current.discover.find((x) => x.title === 'early').thisWeekShowtimes, 1);
  assert.equal(next.prioritize.some((x) => x.title === 'limited'), false);
});

test('next-week preview can show confirmed follow-on week and uses its own credit count', () => {
  const storage = memoryStorage();
  saveFilm(storage, ref('wide', 2), { now: () => NOW });
  const home = makeHome();
  home.opportunities.push(opp('wide', '2026-10-23', '06:30'));
  writeAListUsed(storage, '2026-10-09', 3);
  writeAListUsed(storage, '2026-10-16', 1);
  const report = buildAListWeeklyReport({
    homeData: home, storage, now: NOW, weekOffset: 1,
    creditsUsed: readAListUsed(storage, '2026-10-16'),
  });
  assert.equal(report.creditsRemaining, 3);
  assert.deepEqual(report.canWait.map((x) => x.title), ['wide']);
  assert.equal(report.canWait[0].nextWeekFirst, '2026-10-23T06:30');
  assert.equal(readAListUsed(storage, '2026-10-09'), 3);
});

test('next-week view does not borrow this-week films when nothing is announced', () => {
  const home = {
    films: [film('this-week-only', 99)],
    opportunities: [opp('this-week-only', '2026-10-14', '18:00')],
  };
  const next = buildAListWeeklyReport({ homeData: home, now: NOW, weekOffset: 1 });
  assert.equal(next.hasData, true);
  assert.equal(next.eligibleAMCCount, 0);
  assert.deepEqual(next.prioritize, []);
});

test('next-week control is visible, accessible, and future credits do not replace the collapsed current count', () => {
  const panel = readFileSync(join(ROOT, 'v2/planner/AListWeeklyPanel.jsx'), 'utf8');
  assert.match(panel, /Select A-List credit week/);
  assert.match(panel, /This week/);
  assert.match(panel, /Next week/);
  assert.match(panel, /aria-pressed=\{weekOffset===1\}/);
  assert.match(panel, /currentUsed/);
  assert.match(panel, /Top .* to consider/);
});
