/**
 * Build a Plan time-window: null defaults, arbitrary clocks, overnight finish,
 * hard-constraint / generate parity (PLAN-03 / PLAN-04).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  formatBuildPlanTimeWindowSummary,
  isValidBuildPlanTimeWindow,
  normalizeBuildPlanTimeWindowFields,
  resolveBuildPlanTimeWindowMinutes,
} from '../../v2/planner/buildPlanTimeWindow.js';
import {
  opportunityMatchesHardConstraints,
  resolveBuildPlanHardConstraints,
} from '../../v2/planner/buildPlanHardConstraints.js';
import { mapBuildFormToPlannerFilters } from '../../v2/planner/mapBuildFormToPlannerFilters.js';
import {
  clearBuildPlanFormSession,
  ensureBuildPlanFormSession,
  getBuildPlanFormSession,
  setBuildPlanFormSession,
} from '../../v2/planner/buildPlanFormSession.js';
import { buildCollapsedSectionSummaries } from '../../v2/planner/buildPlanAccordion.js';

const DATE = '2026-08-22';

function liveForm(overrides = {}) {
  return {
    ...createLiveBuildPlanFormState(() => new Date('2026-08-22T12:00:00-07:00')),
    dateIso: DATE,
    ...overrides,
  };
}

function lateOpp({ title, localTime, runtimeMin, id }) {
  return {
    filmKey: id,
    title,
    theaterId: 'theater-a',
    theaterName: 'Theater A',
    localDate: DATE,
    localTime,
    runtimeMin,
    source: 'test',
    sourceShowtimeId: id,
  };
}

test('fresh live plan defaults have no time limits and summarize Any time', () => {
  const form = createLiveBuildPlanFormState(
    () => new Date('2026-08-22T12:00:00-07:00'),
  );
  assert.equal(form.startAfter, null);
  assert.equal(form.finishBefore, null);
  assert.equal(form.finishBeforeNextDay, false);
  assert.equal(formatBuildPlanTimeWindowSummary(form), 'Any time');

  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  assert.equal(hard.startAfterMin, null);
  assert.equal(hard.finishByMin, null);

  const mapped = mapBuildFormToPlannerFilters(form, { theaters: [] });
  assert.equal(mapped.filters.startAfterMin, null);
  assert.equal(mapped.filters.finishByMin, null);
});

test('default late showtimes remain eligible without finish limit', () => {
  const form = liveForm();
  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  const oak = lateOpp({
    id: 'oak',
    title: 'The End of Oak Street',
    localTime: '22:05',
    runtimeMin: 100,
  });
  const miasma = lateOpp({
    id: 'miasma',
    title: 'Teenage Sex and Death at Camp Miasma',
    localTime: '22:00',
    runtimeMin: 112,
  });
  assert.equal(opportunityMatchesHardConstraints(oak, hard), true);
  assert.equal(opportunityMatchesHardConstraints(miasma, hard), true);
});

test('explicit Finish before 11:00 PM excludes late screenings by expected end', () => {
  const form = liveForm({
    finishBefore: '11:00 PM',
    finishBeforeNextDay: false,
  });
  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  assert.equal(hard.finishByMin, 23 * 60);
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({
        id: 'oak',
        title: 'Oak',
        localTime: '22:05',
        runtimeMin: 100,
      }),
      hard,
    ),
    false,
  );
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({
        id: 'miasma',
        title: 'Miasma',
        localTime: '22:00',
        runtimeMin: 112,
      }),
      hard,
    ),
    false,
  );
});

test('arbitrary Start after 1:37 PM filters by advertised start', () => {
  const form = liveForm({ startAfter: '1:37 PM' });
  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  assert.equal(hard.startAfterMin, 13 * 60 + 37);
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({ id: 'early', title: 'Early', localTime: '13:30', runtimeMin: 90 }),
      hard,
    ),
    false,
  );
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({ id: 'ok', title: 'Ok', localTime: '13:37', runtimeMin: 90 }),
      hard,
    ),
    true,
  );
});

test('arbitrary Finish before 9:43 PM uses expected end not advertised start', () => {
  const form = liveForm({
    finishBefore: '9:43 PM',
    finishBeforeNextDay: false,
  });
  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  assert.equal(hard.finishByMin, 21 * 60 + 43);
  // 8:00 PM + 105 runtime = 9:45 PM end → excluded
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({ id: 'long', title: 'Long', localTime: '20:00', runtimeMin: 105 }),
      hard,
    ),
    false,
  );
  // 8:00 PM + 100 = 9:40 PM → eligible
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({ id: 'fit', title: 'Fit', localTime: '20:00', runtimeMin: 100 }),
      hard,
    ),
    true,
  );
});

test('overnight Finish before 1:30 AM next day uses extended minutes', () => {
  const form = liveForm({
    finishBefore: '1:30 AM',
    finishBeforeNextDay: true,
  });
  const mins = resolveBuildPlanTimeWindowMinutes(form);
  assert.equal(mins.finishByMin, 90 + 1440);

  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  // 11:00 PM + 120 = 1:00 AM → eligible vs finish 1:30 AM
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({
        id: 'ok',
        title: 'Ends 1:00',
        localTime: '23:00',
        runtimeMin: 120,
      }),
      hard,
    ),
    true,
  );
  // 11:00 PM + 160 = 1:40 AM → excluded
  assert.equal(
    opportunityMatchesHardConstraints(
      lateOpp({
        id: 'late',
        title: 'Ends 1:40',
        localTime: '23:00',
        runtimeMin: 160,
      }),
      hard,
    ),
    false,
  );
});

test('independent limit combinations and summaries', () => {
  assert.equal(
    formatBuildPlanTimeWindowSummary(liveForm({ startAfter: '1:30 PM' })),
    'After 1:30 PM',
  );
  assert.equal(
    formatBuildPlanTimeWindowSummary(
      liveForm({ finishBefore: '11:45 PM', finishBeforeNextDay: false }),
    ),
    'Finish by 11:45 PM',
  );
  assert.equal(
    formatBuildPlanTimeWindowSummary(
      liveForm({
        startAfter: '1:30 PM',
        finishBefore: '11:45 PM',
        finishBeforeNextDay: false,
      }),
    ),
    '1:30 PM – 11:45 PM',
  );
  assert.equal(
    formatBuildPlanTimeWindowSummary(
      liveForm({ finishBefore: '12:42 AM', finishBeforeNextDay: true }),
    ),
    'Finish by 12:42 AM',
  );

  const startOnly = resolveBuildPlanTimeWindowMinutes(
    liveForm({ startAfter: '2:00 PM' }),
  );
  assert.equal(startOnly.startAfterMin, 14 * 60);
  assert.equal(startOnly.finishByMin, null);

  const finishOnly = resolveBuildPlanTimeWindowMinutes(
    liveForm({ finishBefore: '10:00 PM', finishBeforeNextDay: false }),
  );
  assert.equal(finishOnly.startAfterMin, null);
  assert.equal(finishOnly.finishByMin, 22 * 60);

  const bothOpen = resolveBuildPlanTimeWindowMinutes(liveForm());
  assert.equal(bothOpen.startAfterMin, null);
  assert.equal(bothOpen.finishByMin, null);

  const bothSet = resolveBuildPlanTimeWindowMinutes(
    liveForm({
      startAfter: '1:37 PM',
      finishBefore: '12:42 AM',
      finishBeforeNextDay: true,
    }),
  );
  assert.equal(bothSet.startAfterMin, 13 * 60 + 37);
  assert.equal(bothSet.finishByMin, 42 + 1440);
});

test('Add a showtime hard constraints match Generate Results filters', () => {
  const form = liveForm({
    startAfter: '1:37 PM',
    finishBefore: '12:42 AM',
    finishBeforeNextDay: true,
  });
  const hard = resolveBuildPlanHardConstraints(form, { theaters: [] });
  const mapped = mapBuildFormToPlannerFilters(form, { theaters: [] });
  assert.equal(hard.startAfterMin, mapped.filters.startAfterMin);
  assert.equal(hard.finishByMin, mapped.filters.finishByMin);
  assert.equal(hard.startAfterMin, 13 * 60 + 37);
  assert.equal(hard.finishByMin, 42 + 1440);
});

test('session navigation preserves custom times and no-limit states', () => {
  clearBuildPlanFormSession();
  ensureBuildPlanFormSession(() => liveForm());
  setBuildPlanFormSession((prev) => ({
    ...prev,
    startAfter: '1:37 PM',
    finishBefore: '12:42 AM',
    finishBeforeNextDay: true,
  }));
  let session = getBuildPlanFormSession();
  assert.equal(session.startAfter, '1:37 PM');
  assert.equal(session.finishBefore, '12:42 AM');
  assert.equal(session.finishBeforeNextDay, true);

  setBuildPlanFormSession((prev) => ({
    ...prev,
    startAfter: null,
    finishBefore: null,
    finishBeforeNextDay: false,
  }));
  session = getBuildPlanFormSession();
  assert.equal(session.startAfter, null);
  assert.equal(session.finishBefore, null);
  assert.equal(formatBuildPlanTimeWindowSummary(session), 'Any time');
  clearBuildPlanFormSession();
});

test('start after early AM stays same-day; finish early AM can be next day', () => {
  const startEarly = resolveBuildPlanTimeWindowMinutes(
    liveForm({ startAfter: '1:00 AM' }),
  );
  assert.equal(startEarly.startAfterMin, 60);

  const finishLegacy = resolveBuildPlanTimeWindowMinutes({
    finishBefore: '1:30 AM',
    // omit finishBeforeNextDay → infer early AM as next day
  });
  assert.equal(finishLegacy.finishByMin, 90 + 1440);

  assert.equal(
    isValidBuildPlanTimeWindow('11:00 PM', '1:30 AM', {
      finishBeforeNextDay: true,
    }),
    true,
  );
  assert.equal(
    isValidBuildPlanTimeWindow('11:00 PM', '2:00 PM', {
      finishBeforeNextDay: false,
    }),
    false,
  );
});

test('midnight boundary minutes: same-day, next-day midnight, early AM start', () => {
  assert.equal(
    resolveBuildPlanTimeWindowMinutes({
      finishBefore: '11:59 PM',
      finishBeforeNextDay: false,
    }).finishByMin,
    23 * 60 + 59,
  );
  assert.equal(
    resolveBuildPlanTimeWindowMinutes({
      finishBefore: '12:00 AM',
      finishBeforeNextDay: true,
    }).finishByMin,
    1440,
  );
  assert.equal(
    resolveBuildPlanTimeWindowMinutes({
      finishBefore: '1:30 AM',
      finishBeforeNextDay: true,
    }).finishByMin,
    90 + 1440,
  );
  assert.equal(
    resolveBuildPlanTimeWindowMinutes({
      startAfter: '1:30 AM',
    }).startAfterMin,
    90,
  );
  // Legacy 12:00 AM without flag (old dropdown) → next-day midnight
  assert.equal(
    resolveBuildPlanTimeWindowMinutes({
      finishBefore: '12:00 AM',
    }).finishByMin,
    1440,
  );
});

test('explicit finishBeforeNextDay false is never re-inferred for early AM', () => {
  const mins = resolveBuildPlanTimeWindowMinutes({
    finishBefore: '1:30 AM',
    finishBeforeNextDay: false,
  });
  assert.equal(mins.finishByMin, 90);

  const normalized = normalizeBuildPlanTimeWindowFields({
    finishBefore: '1:30 AM',
    finishBeforeNextDay: false,
  });
  assert.equal(normalized.finishBeforeNextDay, false);
  assert.equal(
    resolveBuildPlanTimeWindowMinutes(normalized).finishByMin,
    90,
  );
});

test('production regression: Any time keeps late shows; Finish by 11 PM drops them', () => {
  const any = liveForm();
  const hardAny = resolveBuildPlanHardConstraints(any, { theaters: [] });
  const mappedAny = mapBuildFormToPlannerFilters(any, { theaters: [] });
  assert.equal(hardAny.finishByMin, null);
  assert.equal(mappedAny.filters.finishByMin, null);

  const oak = lateOpp({
    id: 'oak',
    title: 'The End of Oak Street',
    localTime: '22:05',
    runtimeMin: 100,
  });
  const miasma = lateOpp({
    id: 'miasma',
    title: 'Teenage Sex and Death at Camp Miasma',
    localTime: '22:00',
    runtimeMin: 112,
  });
  assert.equal(opportunityMatchesHardConstraints(oak, hardAny), true);
  assert.equal(opportunityMatchesHardConstraints(miasma, hardAny), true);

  const finish11 = liveForm({
    finishBefore: '11:00 PM',
    finishBeforeNextDay: false,
  });
  const hard11 = resolveBuildPlanHardConstraints(finish11, { theaters: [] });
  const mapped11 = mapBuildFormToPlannerFilters(finish11, { theaters: [] });
  assert.equal(hard11.finishByMin, mapped11.filters.finishByMin);
  assert.equal(hard11.finishByMin, 23 * 60);
  assert.equal(opportunityMatchesHardConstraints(oak, hard11), false);
  assert.equal(opportunityMatchesHardConstraints(miasma, hard11), false);
});

test('normalize empties legacy magic clocks and collapsed When uses summary', () => {
  const normalized = normalizeBuildPlanTimeWindowFields({
    startAfter: '',
    finishBefore: '  ',
  });
  assert.equal(normalized.startAfter, null);
  assert.equal(normalized.finishBefore, null);

  const collapsed = buildCollapsedSectionSummaries(
    liveForm({
      dateDisplay: 'Sat, Aug 22, 2026',
      startAfter: null,
      finishBefore: null,
    }),
  );
  assert.match(collapsed.when, /Any time/);
  assert.equal(collapsed.when.includes('null'), false);
});
