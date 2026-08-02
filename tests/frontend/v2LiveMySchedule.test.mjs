import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeMyScheduleWeekFromAcceptedPlans,
} from '../../v2/planner/composeMyScheduleWeekFromAcceptedPlans.js';
import {
  composeMyScheduleMonthFromAcceptedPlans,
  longestPerformanceStreak,
  monthHeatmapDateRange,
} from '../../v2/planner/composeMyScheduleMonthFromAcceptedPlans.js';
import { resolveMyScheduleWeekPagePresentation } from '../../v2/fixtures/resolveMyScheduleWeekPresentation.js';
import { resolveMyScheduleMonthPagePresentation } from '../../v2/planner/resolveMyScheduleMonthPresentation.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
} from '../../v2/stores/acceptedPlansStore.js';
import {
  SCHEDULE_SETTINGS_STORAGE_KEY,
  getScheduleSettings,
  timelineRangeFromZoomId,
  updateScheduleSettings,
  formatScheduleClock,
} from '../../v2/stores/scheduleSettingsStore.js';
import { eventBlockGeometry } from '../../v2/fixtures/myScheduleWeekMockupFixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const WEEK_SRC = readFileSync(
  join(ROOT, 'v2/planner/MyScheduleWeekSurface.jsx'),
  'utf8',
);
const MONTH_SRC = readFileSync(
  join(ROOT, 'v2/planner/MyScheduleMonthSurface.jsx'),
  'utf8',
);
const SETTINGS_SRC = readFileSync(
  join(ROOT, 'v2/planner/ScheduleSettingsSurface.jsx'),
  'utf8',
);

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function seedPlan(storage, { double = false, perfA = {} } = {}) {
  const performances = [
    {
      title: 'Alpha',
      filmKey: 'alpha',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate: '2026-07-28',
      localTime: '19:00',
      runtimeMin: 100,
      source: 'test',
      sourceShowtimeId: 'a1',
      format: 'Digital',
      ...perfA,
    },
  ];
  if (double) {
    performances.push({
      title: 'Beta',
      filmKey: 'beta',
      theaterId: 'theater-a',
      theaterName: 'Theater A',
      localDate: perfA.localDate ?? '2026-07-28',
      localTime: '21:30',
      runtimeMin: 90,
      source: 'test',
      sourceShowtimeId: 'b1',
      format: 'Digital',
    });
  }
  const result = acceptPlan(storage, {
    performances,
    label: 'Test',
    provenance: 'live',
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.equal(result.ok, true, result.error);
  return result.plan;
}

test('empty live week is honest and fixture-free', () => {
  const storage = memoryStorage();
  const week = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.equal(week.source, 'accepted-plans');
  assert.ok(week.week.days.every((d) => d.empty));
  assert.match(week.week.days[0].emptyHint, /Accept a plan/);
  assert.equal(week.nextUp.empty, true);
});

test('single and multi-film plans group correctly', () => {
  const storage = memoryStorage();
  seedPlan(storage, { double: true });
  const week = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    hideCompleted: false,
  });
  const day = week.week.days.find((d) => d.id === '2026-07-28');
  assert.ok(day);
  assert.equal(day.dayLabel, 'TUE');
  assert.equal(day.dateLabel, 'JUL 28');
  assert.equal(day.planGroups.length, 1);
  assert.equal(day.planGroups[0].kind, 'multi');
  const films = day.planGroups[0].items.filter((i) => i.type === 'film');
  const breaks = day.planGroups[0].items.filter((i) => i.type === 'break');
  assert.equal(films.length, 2);
  assert.ok(breaks.length >= 1);
});

test('showBreaks setting hides break visuals without removing films', () => {
  const storage = memoryStorage();
  seedPlan(storage, { double: true });
  const withBreaks = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    hideCompleted: false,
    showBreaks: true,
  });
  const without = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    hideCompleted: false,
    showBreaks: false,
  });
  const dayA = withBreaks.week.days.find((d) => d.id === '2026-07-28');
  const dayB = without.week.days.find((d) => d.id === '2026-07-28');
  assert.ok(dayA.planGroups[0].items.some((i) => i.type === 'break'));
  assert.equal(
    dayB.planGroups[0].items.some((i) => i.type === 'break'),
    false,
  );
  assert.equal(
    dayB.planGroups[0].items.filter((i) => i.type === 'film').length,
    2,
  );
});

test('hideCompleted keeps in-progress and hides finished plans', () => {
  const storage = memoryStorage();
  seedPlan(storage, {
    perfA: {
      localDate: '2026-07-20',
      localTime: '12:00',
      runtimeMin: 90,
      sourceShowtimeId: 'past-1',
    },
  });
  const hidden = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    weekOffset: -1,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    hideCompleted: true,
  });
  const shown = composeMyScheduleWeekFromAcceptedPlans({
    storage,
    weekOffset: -1,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    hideCompleted: false,
  });
  assert.ok(shown.week.days.some((d) => !d.empty));
  assert.ok(hidden.week.days.every((d) => d.empty));
});

test('timeline geometry never negative; min readable width', () => {
  const range = { startMinutes: 720, endMinutes: 1440 };
  const geo = eventBlockGeometry(
    { startMinutes: 730, endMinutes: 740 },
    range,
  );
  assert.ok(geo.widthPercent >= 8);
  assert.ok(geo.leftPercent >= 0);
  assert.ok(geo.widthPercent + geo.leftPercent <= 100.0001);
});

test('schedule settings persist and drive zoom/time format helpers', () => {
  const storage = memoryStorage();
  const updated = updateScheduleSettings(storage, {
    hideCompleted: false,
    showBreaks: false,
    timelineZoomId: '10-22',
    timeFormatId: '24h',
  });
  assert.equal(updated.ok, true);
  assert.equal(getScheduleSettings(storage).timelineZoomId, '10-22');
  assert.deepEqual(timelineRangeFromZoomId('10-22'), {
    startMinutes: 600,
    endMinutes: 1320,
  });
  assert.equal(formatScheduleClock(780, '24h'), '13:00');
  assert.equal(formatScheduleClock(780, '12h'), '1:00 PM');
  assert.ok(storage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY));
});

test('month heatmap counts accepted performances only', () => {
  const storage = memoryStorage();
  seedPlan(storage, { double: true });
  const month = composeMyScheduleMonthFromAcceptedPlans({
    storage,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    hideCompleted: false,
  });
  assert.equal(month.source, 'accepted-plans');
  const cell = month.heatmapGrid.find((c) => c.id === '2026-07-28');
  assert.equal(cell.movieCount, 2);
  assert.ok(month.busiestDays[0].movieCount >= 2);
  assert.equal(monthHeatmapDateRange('2026-07').length, 35);
  assert.equal(longestPerformanceStreak(['2026-07-27', '2026-07-28']), 2);
});

test('live default / mockup flag boundary', () => {
  const storage = memoryStorage();
  const liveWeek = resolveMyScheduleWeekPagePresentation({
    storage,
    forceMockup: false,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.equal(liveWeek.mode, 'accepted-plans');
  const mockWeek = resolveMyScheduleWeekPagePresentation({
    forceMockup: true,
  });
  assert.equal(mockWeek.mode, 'mockup-fixture');

  const liveMonth = resolveMyScheduleMonthPagePresentation({
    storage,
    forceMockup: false,
    now: () => new Date('2026-07-28T12:00:00-07:00'),
  });
  assert.equal(liveMonth.mode, 'accepted-plans');
  const mockMonth = resolveMyScheduleMonthPagePresentation({
    forceMockup: true,
  });
  assert.equal(mockMonth.mode, 'mockup-fixture');
});

test('surfaces wire settings store and modify scaffold; no OAuth', () => {
  assert.match(WEEK_SRC, /getScheduleSettings/);
  assert.match(WEEK_SRC, /ScheduleModifyPlanSheet/);
  assert.match(WEEK_SRC, /removeAcceptedPlan/);
  assert.match(MONTH_SRC, /resolveMyScheduleMonthPagePresentation/);
  assert.match(SETTINGS_SRC, /updateScheduleSettings/);
  assert.match(SETTINGS_SRC, /clearAcceptedPlans/);
  assert.equal(/googleapis|oauth/i.test(SETTINGS_SRC), false);
  assert.equal(WEEK_SRC.includes(ACCEPTED_PLANS_STORAGE_KEY), false);
});
