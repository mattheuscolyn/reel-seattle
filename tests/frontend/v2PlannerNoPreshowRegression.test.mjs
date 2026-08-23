/**
 * Production regression: Miasma 8:00 PM → Oak Street 10:05 PM same theater
 * must be a valid 2-film plan once universal preshow is removed.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findSchedules } from '../../src/utils/plannerEngine.js';
import {
  calculateExpectedEndTime,
  isValidSequence,
} from '../../src/utils/plannerBufferPolicy.js';
import { generateLivePlannerResults } from '../../v2/planner/generateLivePlannerResults.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  opportunityMatchesHardConstraints,
  resolveBuildPlanHardConstraints,
} from '../../v2/planner/buildPlanHardConstraints.js';

const DATE = '2026-08-22';
const THEATER_ID = 'amc-pacific-place-11';
const THEATER_NAME = 'AMC Pacific Place 11';

function engineRow({ film, time, runtime, id }) {
  return {
    Film: film,
    film: film,
    showtime_film_key: id,
    Theater: THEATER_NAME,
    theater_id: THEATER_ID,
    Date: DATE,
    Time: time,
    Runtime: String(runtime),
    source: 'test',
    source_showtime_id: id,
  };
}

function homeData() {
  return {
    theaters: [{ id: THEATER_ID, name: THEATER_NAME }],
    films: [
      {
        filmKey: 'miasma',
        title: 'Teenage Sex and Death at Camp Miasma',
        runtimeMin: 112,
      },
      {
        filmKey: 'oak-street',
        title: 'The End of Oak Street',
        runtimeMin: 100,
      },
    ],
    opportunities: [
      {
        filmKey: 'miasma',
        title: 'Teenage Sex and Death at Camp Miasma',
        theaterId: THEATER_ID,
        theaterName: THEATER_NAME,
        localDate: DATE,
        localTime: '20:00',
        runtimeMin: 112,
        source: 'test',
        sourceShowtimeId: 'miasma-2000',
      },
      {
        filmKey: 'oak-street',
        title: 'The End of Oak Street',
        theaterId: THEATER_ID,
        theaterName: THEATER_NAME,
        localDate: DATE,
        localTime: '22:05',
        runtimeMin: 100,
        source: 'test',
        sourceShowtimeId: 'oak-2205',
      },
    ],
  };
}

test('Miasma scheduling end is 9:52 PM with no universal preshow', () => {
  const end = calculateExpectedEndTime('8:00PM', 112);
  assert.equal(end.ok, true);
  assert.equal(end.endMin, 20 * 60 + 112);
  assert.equal(end.preshowMinutes, 0);
});

test('Miasma → Oak Street same-theater sequence is valid with 13 min gap', () => {
  const seq = isValidSequence(
    {
      startMin: 20 * 60,
      runtime: 112,
      theater_id: THEATER_ID,
    },
    {
      startMin: 22 * 60 + 5,
      theater_id: THEATER_ID,
    },
  );
  assert.equal(seq.valid, true);
  assert.equal(seq.previousEndMin, 20 * 60 + 112);
  assert.equal(seq.breakMinutes, 13);
  assert.equal(seq.transferMinutes, 5);
});

test('findSchedules includes the exact Miasma → Oak Street 2-film plan', () => {
  const rows = [
    engineRow({
      film: 'Teenage Sex and Death at Camp Miasma',
      time: '8:00PM',
      runtime: 112,
      id: 'miasma',
    }),
    engineRow({
      film: 'The End of Oak Street',
      time: '10:05PM',
      runtime: 100,
      id: 'oak',
    }),
  ];
  const { schedules } = findSchedules({
    rows,
    filters: {
      date: DATE,
      theaters: [],
      filmCount: 2,
      startAfterMin: null,
      finishByMin: null,
      minGapMin: 0,
      maxGapMin: null,
      includeFilms: [],
      excludeFilms: [],
      preferredFilms: [],
      allowRepeatFilms: false,
    },
  });
  assert.equal(schedules.length, 1);
  assert.deepEqual(schedules[0].films, [
    'Teenage Sex and Death at Camp Miasma',
    'The End of Oak Street',
  ]);
  assert.equal(schedules[0].gapTimeMin, 13);
  assert.equal(schedules[0].movies[0].endMin, 20 * 60 + 112);
  assert.equal(schedules[0].movies[1].startMin, 22 * 60 + 5);
});

test('Generate Results accepts the same Miasma → Oak Street sequence', () => {
  const form = {
    ...createLiveBuildPlanFormState(() => new Date('2026-08-22T12:00:00-07:00')),
    dateIso: DATE,
    startAfter: null,
    finishBefore: null,
    planSize: { min: 2, max: 2 },
    theaterPrefId: 'any',
    maxGap: 'Any',
    minGap: 'Any',
  };
  const result = generateLivePlannerResults({
    homeData: homeData(),
    form,
    sortId: 'best-match',
  });
  assert.equal(result.ok, true, result.message);
  assert.ok(result.plans.length >= 1, 'expected at least one plan');
  const hit = result.plans.find((plan) => {
    const films = plan.items.filter((i) => i.type !== 'break');
    return (
      films.length === 2 &&
      /miasma/i.test(films[0].title) &&
      /oak street/i.test(films[1].title)
    );
  });
  assert.ok(hit, 'expected Miasma → Oak Street plan');
  const films = hit.items.filter((i) => i.type !== 'break');
  assert.equal(films[0].localTime, '20:00');
  assert.equal(films[1].localTime, '22:05');
});

test('finish-before uses start + runtime only for late Oak Street', () => {
  const oak = {
    filmKey: 'oak-street',
    title: 'The End of Oak Street',
    theaterId: THEATER_ID,
    theaterName: THEATER_NAME,
    localDate: DATE,
    localTime: '22:05',
    runtimeMin: 100,
  };
  // 10:05 + 100 = 11:45
  const reject = resolveBuildPlanHardConstraints(
    {
      dateIso: DATE,
      finishBefore: '11:30 PM',
      finishBeforeNextDay: false,
    },
    { theaters: [] },
  );
  assert.equal(opportunityMatchesHardConstraints(oak, reject), false);

  const allowExact = resolveBuildPlanHardConstraints(
    {
      dateIso: DATE,
      finishBefore: '11:45 PM',
      finishBeforeNextDay: false,
    },
    { theaters: [] },
  );
  assert.equal(opportunityMatchesHardConstraints(oak, allowExact), true);

  const allowMidnight = resolveBuildPlanHardConstraints(
    {
      dateIso: DATE,
      finishBefore: '12:00 AM',
      finishBeforeNextDay: true,
    },
    { theaters: [] },
  );
  assert.equal(opportunityMatchesHardConstraints(oak, allowMidnight), true);
});
