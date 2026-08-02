/**
 * Compose My Schedule Month heatmap from accepted plans (T-SCH-01).
 *
 * Intensity = scheduled performance count per day (user schedule only).
 * Not citywide showtimes. Mockup remains behind `?scheduleMockup=1`.
 */

import {
  addIsoDays,
  formatCompactDateLabel,
  isoWeekday,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import {
  dotCountFromMovieCount,
  heatLevelFromMovieCount,
} from '../fixtures/myScheduleMonthMockupFixture.js';
import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';
import { mondayOfWeekContaining } from './composeMyScheduleWeekFromAcceptedPlans.js';

const WEEKDAY_SHORT = Object.freeze([
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
]);

/**
 * @param {string} yearMonth — YYYY-MM
 * @param {number} monthOffset
 */
export function shiftYearMonth(yearMonth, monthOffset) {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + monthOffset, 1, 12));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

/**
 * @param {Date | (() => Date)} now
 */
export function pacificYearMonth(now = new Date()) {
  const nowFn = typeof now === 'function' ? now : () => now;
  return pacificDateString(nowFn()).slice(0, 7);
}

/**
 * @param {string} yearMonth
 */
function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Monday-start heatmap covering the calendar month (+ leading/trailing days).
 * @param {string} yearMonth
 * @returns {string[]}
 */
export function monthHeatmapDateRange(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const first = `${yearMonth}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const last = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  const start = mondayOfWeekContaining(first);
  let end = addIsoDays(mondayOfWeekContaining(last), 6);
  // Always render 5 weeks (35 cells) like the mockup grid.
  const cells = [];
  let cursor = start;
  for (let i = 0; i < 35; i += 1) {
    cells.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  void end;
  return cells;
}

/**
 * Longest consecutive calendar-day streak with ≥1 performance.
 * @param {string[]} datesSorted
 */
export function longestPerformanceStreak(datesSorted) {
  if (!datesSorted.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < datesSorted.length; i += 1) {
    const prev = datesSorted[i - 1];
    const cur = datesSorted[i];
    if (cur === addIsoDays(prev, 1)) {
      run += 1;
      best = Math.max(best, run);
    } else if (cur !== prev) {
      run = 1;
    }
  }
  return best;
}

/**
 * @param {{
 *   storage?: Storage | null,
 *   monthOffset?: number,
 *   now?: Date | (() => Date),
 *   hideCompleted?: boolean,
 * }} [options]
 */
export function composeMyScheduleMonthFromAcceptedPlans(options = {}) {
  const nowFn =
    typeof options.now === 'function'
      ? options.now
      : () => options.now ?? new Date();
  const now = nowFn();
  const monthOffset = Number.isFinite(options.monthOffset)
    ? Number(options.monthOffset)
    : 0;
  const hideCompleted = options.hideCompleted !== false;
  const yearMonth = shiftYearMonth(pacificYearMonth(now), monthOffset);
  const today = pacificDateString(now);

  let plans = getAcceptedPlans(options.storage);
  if (hideCompleted) {
    plans = plans.filter((plan) => {
      const lastEnd = plan.performances.reduce((max, p) => {
        const t = Date.parse(p.expectedEndsAt);
        return Number.isFinite(t) && t > max ? t : max;
      }, 0);
      return lastEnd === 0 || lastEnd >= now.getTime();
    });
  }

  /** @type {Map<string, object[]>} */
  const perfsByDate = new Map();
  for (const plan of plans) {
    for (const perf of plan.performances) {
      const date = perf.localDate;
      if (!perfsByDate.has(date)) perfsByDate.set(date, []);
      perfsByDate.get(date).push({ plan, performance: perf });
    }
  }

  const gridDates = monthHeatmapDateRange(yearMonth);
  const heatmapGrid = gridDates.map((iso) => {
    const inMonth = iso.startsWith(yearMonth);
    const rows = inMonth ? perfsByDate.get(iso) ?? [] : [];
    const movieCount = rows.length;
    const dow = isoWeekday(iso);
    const dateNumber = Number(iso.slice(8, 10));
    return {
      id: iso,
      weekdayLabel: WEEKDAY_SHORT[dow],
      dateNumber,
      movieCount: inMonth ? movieCount : 0,
      heatLevel: inMonth ? heatLevelFromMovieCount(movieCount) : 0,
      dots: inMonth ? dotCountFromMovieCount(movieCount) : 0,
      selected: iso === today,
      inMonth,
    };
  });

  const monthDates = [...perfsByDate.keys()]
    .filter((d) => d.startsWith(yearMonth))
    .sort();

  const busiestDays = [...monthDates]
    .map((date) => {
      const rows = perfsByDate.get(date) ?? [];
      return {
        id: `busiest-${date}`,
        dateLabel: formatCompactDateLabel(date),
        movieCount: rows.length,
        dots: dotCountFromMovieCount(rows.length),
        thumbUrls: rows
          .slice(0, 3)
          .map((r) => r.performance.posterUrl)
          .filter(Boolean),
      };
    })
    .sort((a, b) => b.movieCount - a.movieCount || a.id.localeCompare(b.id))
    .slice(0, 3);

  const upcomingHighlights = [...perfsByDate.keys()]
    .filter((d) => d >= today)
    .sort()
    .slice(0, 4)
    .map((date) => {
      const rows = perfsByDate.get(date) ?? [];
      const count = rows.length;
      return {
        id: `upcoming-${date}`,
        dateLabel: formatCompactDateLabel(date),
        filmCountLabel: `${count} film${count === 1 ? '' : 's'}`,
        dots: dotCountFromMovieCount(count),
        description:
          count > 1 ? 'Multi-film day' : rows[0]?.performance.title ?? 'Planned film',
        thumbUrl: rows[0]?.performance.posterUrl ?? null,
      };
    });

  // Week with most performances overlapping this month (Mon–Sun).
  /** @type {Map<string, number>} */
  const weekTotals = new Map();
  for (const date of monthDates) {
    const monday = mondayOfWeekContaining(date);
    weekTotals.set(
      monday,
      (weekTotals.get(monday) ?? 0) + (perfsByDate.get(date)?.length ?? 0),
    );
  }
  const topWeekEntry = [...weekTotals.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  const topWeekLabel = topWeekEntry
    ? `${formatCompactDateLabel(topWeekEntry[0])} week · ${topWeekEntry[1]} films`
    : 'No top week yet';

  const allMonthPerfs = monthDates.flatMap((d) => perfsByDate.get(d) ?? []);
  const filmDays = monthDates.length;
  const totalRuntimeMin = allMonthPerfs.reduce(
    (sum, row) => sum + (row.performance.runtimeMin ?? 0),
    0,
  );
  const hours = Math.floor(totalRuntimeMin / 60);
  const mins = totalRuntimeMin % 60;
  const doubleFeatures = plans.filter(
    (p) =>
      p.date.startsWith(yearMonth) &&
      p.performances.length >= 2,
  ).length;
  const theaters = new Set(
    allMonthPerfs.map((r) => r.performance.theaterId).filter(Boolean),
  );
  const streak = longestPerformanceStreak(monthDates);

  const empty = filmDays === 0;

  return {
    source: 'accepted-plans',
    mode: 'accepted-plans',
    view: 'month',
    title: 'My Schedule',
    tagline: 'Your movie plans at a glance.',
    searchLabel: 'Search',
    settingsLabel: 'Schedule settings',
    viewToggle: {
      weekLabel: 'Week',
      monthLabel: 'Month',
    },
    heatmapDescription:
      'Heatmap of your accepted plans per day. Dot count reflects scheduled performances — not citywide showtimes.',
    heatmapLabel: empty
      ? `${monthLabel(yearMonth)} at a glance`
      : `${monthLabel(yearMonth)} · ${topWeekLabel} · streak ${streak}d`,
    monthLabel: monthLabel(yearMonth),
    yearMonth,
    prevMonthLabel: 'Previous month',
    nextMonthLabel: 'Next month',
    todayButtonLabel: 'Today',
    heatmapWeekdays: Object.freeze([
      'MON',
      'TUE',
      'WED',
      'THU',
      'FRI',
      'SAT',
      'SUN',
    ]),
    legend: Object.freeze([
      Object.freeze({ id: 'none', label: 'No plans', movieCount: 0 }),
      Object.freeze({ id: 'one', label: '1 movie', movieCount: 1 }),
      Object.freeze({ id: 'two', label: '2 movies', movieCount: 2 }),
      Object.freeze({ id: 'three', label: '3 movies', movieCount: 3 }),
      Object.freeze({ id: 'four-plus', label: '4+ movies', movieCount: 4 }),
    ]),
    heatmapGrid,
    atAGlanceStats: Object.freeze([
      Object.freeze({
        id: 'movie-days',
        label: 'movie days',
        value: String(filmDays),
      }),
      Object.freeze({
        id: 'films',
        label: 'films',
        value: String(allMonthPerfs.length),
      }),
      Object.freeze({
        id: 'runtime',
        label: 'total runtime',
        value: `${hours}h ${mins}m`,
      }),
      Object.freeze({
        id: 'double-features',
        label: 'double features',
        value: String(doubleFeatures),
      }),
      Object.freeze({
        id: 'theaters-visited',
        label: 'theater variety',
        value: String(theaters.size),
      }),
    ]),
    summaryMeta: Object.freeze({
      topWeekLabel,
      longestStreakDays: streak,
      theaterVariety: theaters.size,
    }),
    viewInsightsLabel: 'View insights',
    busiestDays,
    busiestDaysViewAllLabel: 'View all',
    upcomingHighlights,
    upcomingHighlightsViewAllLabel: 'View all',
    empty,
    emptyTitle: empty ? 'No plans this month' : null,
    emptyHint: empty
      ? 'Accept a plan from Plan Results to fill this heatmap.'
      : null,
    canNavigateUnbounded: true,
  };
}
