import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectSmokePlannerCandidateDates,
  plansAreSameTheater,
  selectFeasibleSmokePlannerRequest,
} from '../../v2/planner/selectFeasibleSmokePlannerRequest.js';

const TODAY = '2026-09-09';
const TOMORROW = '2026-09-10';
const NOW = new Date('2026-09-09T21:00:00-07:00');

function theater(id, name) {
  return {
    id,
    name,
    addressLine1: '100 Main St',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98101',
  };
}

function film(key, id, title, runtimeMin) {
  return {
    filmKey: key,
    filmId: id,
    title,
    runtimeMin,
    posterUrl: `https://example.com/${key}.jpg`,
  };
}

function opportunity({
  key,
  filmKey,
  title,
  theaterId,
  theaterName,
  localDate,
  localTime,
  runtimeMin,
}) {
  return {
    opportunityKey: key,
    filmKey,
    title,
    theaterId,
    theaterName,
    localDate,
    localTime,
    runtimeMin,
    source: 'fixture-test',
    sourceShowtimeId: key,
    formatLabels: ['Digital'],
    ticketUrl: `https://example.com/t/${key}`,
  };
}

function makeHomeData(opportunities) {
  const theaterA = theater('theater-a', 'Theater A');
  return {
    theaters: [theaterA],
    theatersById: { 'theater-a': theaterA },
    films: [
      film('alpha', 'tmdb:1', 'Alpha', 90),
      film('beta', 'tmdb:2', 'Beta', 100),
      film('gamma', 'tmdb:3', 'Gamma', 95),
    ],
    opportunities,
  };
}

function feasibleSameTheaterDay(localDate) {
  return [
    opportunity({
      key: `${localDate}-a`,
      filmKey: 'alpha',
      title: 'Alpha',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate,
      localTime: '14:00',
      runtimeMin: 90,
    }),
    opportunity({
      key: `${localDate}-b`,
      filmKey: 'beta',
      title: 'Beta',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate,
      localTime: '16:30',
      runtimeMin: 100,
    }),
    opportunity({
      key: `${localDate}-c`,
      filmKey: 'gamma',
      title: 'Gamma',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate,
      localTime: '19:30',
      runtimeMin: 95,
    }),
  ];
}

test('collectSmokePlannerCandidateDates puts Pacific today first among upcoming', () => {
  const homeData = makeHomeData([
    ...feasibleSameTheaterDay(TOMORROW),
    ...feasibleSameTheaterDay('2026-09-12'),
  ]);
  const dates = collectSmokePlannerCandidateDates(homeData, NOW, 14);
  assert.equal(dates[0], TODAY);
  assert.ok(dates.includes(TOMORROW));
  assert.ok(dates.includes('2026-09-12'));
  assert.ok(!dates.includes('2026-09-08'));
});

test('selectFeasibleSmokePlannerRequest advances past infeasible today', () => {
  // Today only has past/early shows relative to 21:00 Pacific — infeasible.
  // Tomorrow has a full same-theater slate — must be selected.
  const homeData = makeHomeData([
    opportunity({
      key: 'today-past',
      filmKey: 'alpha',
      title: 'Alpha',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate: TODAY,
      localTime: '10:00',
      runtimeMin: 90,
    }),
    ...feasibleSameTheaterDay(TOMORROW),
  ]);

  const selected = selectFeasibleSmokePlannerRequest(homeData, { now: NOW });
  assert.equal(selected.ok, true);
  assert.equal(selected.dateIso, TOMORROW);
  assert.deepEqual(selected.attemptedDates, [TODAY, TOMORROW]);
  assert.equal(selected.generated?.ok, true);
  assert.ok(selected.generated.plans.length > 0);
  assert.ok(plansAreSameTheater(selected.generated.plans));
  assert.equal(selected.form?.dateIso, TOMORROW);
});

test('selectFeasibleSmokePlannerRequest fails when no date is feasible', () => {
  const homeData = makeHomeData([
    opportunity({
      key: 'lonely',
      filmKey: 'alpha',
      title: 'Alpha',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate: TODAY,
      localTime: '10:00',
      runtimeMin: 90,
    }),
  ]);
  const selected = selectFeasibleSmokePlannerRequest(homeData, {
    now: NOW,
    maxDatesToTry: 3,
  });
  assert.equal(selected.ok, false);
  assert.equal(selected.error, 'no_feasible_plan');
  assert.ok(selected.attemptedDates.includes(TODAY));
  assert.equal(selected.generated, null);
});

test('plansAreSameTheater requires one theater across film items', () => {
  assert.equal(
    plansAreSameTheater([
      {
        theaterId: 'theater-a',
        items: [
          { type: 'film', theaterId: 'theater-a' },
          { type: 'break' },
          { type: 'film', theaterId: 'theater-a' },
        ],
      },
    ]),
    true,
  );
  assert.equal(
    plansAreSameTheater([
      {
        theaterId: 'theater-a',
        items: [
          { type: 'film', theaterId: 'theater-a' },
          { type: 'film', theaterId: 'theater-b' },
        ],
      },
    ]),
    false,
  );
  assert.equal(plansAreSameTheater([]), false);
});
