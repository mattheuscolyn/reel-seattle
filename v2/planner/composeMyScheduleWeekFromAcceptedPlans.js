/**
 * Compose My Schedule Week presentation from accepted plans (T-PLAN-01).
 *
 * Live default — no fixture films. Mockup weeks remain in
 * `myScheduleWeekMockupFixture.js` behind `?scheduleMockup=1`.
 */

import {
  addIsoDays,
  formatCompactDateLabel,
  isoWeekday,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import {
  MY_SCHEDULE_WEEK_TIMELINE_RANGE,
} from '../fixtures/myScheduleWeekMockupFixture.js';
import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';
import {
  formatScheduleClock,
  timelineRangeFromZoomId,
  timelineRulerLabelsForRange,
} from '../stores/scheduleSettingsStore.js';

const WEEKDAY_LETTERS = Object.freeze(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
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
 * Monday-start ISO date for the week containing `isoDate`.
 * @param {string} isoDate
 */
export function mondayOfWeekContaining(isoDate) {
  const dow = isoWeekday(isoDate); // 0=Sun
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  return addIsoDays(isoDate, -daysFromMonday);
}

/**
 * @param {string} iso
 */
function monthLabelForDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * @param {string} startIso
 * @param {string} endIso
 */
function weekRangeLabel(startIso, endIso) {
  const fmt = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    })
      .format(date)
      .toUpperCase();
  };
  const startYear = startIso.slice(0, 4);
  const endYear = endIso.slice(0, 4);
  if (startYear === endYear) {
    return `${fmt(startIso)} – ${fmt(endIso)}, ${startYear}`;
  }
  return `${fmt(startIso)} ${startYear} – ${fmt(endIso)} ${endYear}`;
}

/**
 * Pacific wall minutes since midnight from an ISO instant.
 * @param {string} iso
 * @param {string} [timeZone]
 */
export function pacificMinutesFromIso(iso, timeZone = 'America/Los_Angeles') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((p) => p.type === 'hour' || p.type === 'minute')
      .map((p) => [p.type, Number(p.value)]),
  );
  if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute)) {
    return null;
  }
  return parts.hour * 60 + parts.minute;
}

/**
 * @param {string} iso
 * @param {string} [timeZone]
 */
function pacificDateFromIso(iso, timeZone = 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * @param {number} minutes
 * @param {string} [timeFormatId]
 */
function formatShowtimeLabel(minutes, timeFormatId = '12h') {
  return formatScheduleClock(minutes, timeFormatId);
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance} perf
 * @param {string} planGroupId
 * @param {string} [timeFormatId]
 */
function performanceToFilmEvent(perf, planGroupId, timeFormatId = '12h') {
  const startMinutes = pacificMinutesFromIso(perf.startsAt) ?? 0;
  let endMinutes = pacificMinutesFromIso(perf.expectedEndsAt);
  if (endMinutes == null || endMinutes <= startMinutes) {
    endMinutes = startMinutes + Math.max(30, perf.runtimeMin + 15);
  }
  // Same-day timeline: clamp overnight ends into extended minutes for geometry.
  if (endMinutes < startMinutes) endMinutes += 1440;

  return {
    id: `${planGroupId}:${perf.performanceKey}`,
    type: 'film',
    title: perf.title,
    theaterLabel: perf.theaterName,
    showtimeLabel: formatShowtimeLabel(startMinutes, timeFormatId),
    startMinutes,
    endMinutes,
    planGroupId,
    tone: 'purple',
    imageUrl: perf.posterUrl,
    ticketUrl: perf.ticketUrl,
    performanceKey: perf.performanceKey,
    filmId: perf.filmId ?? null,
    filmKey: perf.filmKey ?? null,
    showtimeFilmKey: perf.filmKey ?? null,
    opportunityKey: perf.opportunityKey ?? null,
  };
}

/**
 * Insert visual break rows between performances (not stored).
 * @param {ReturnType<typeof performanceToFilmEvent>[]} filmEvents
 * @param {string} planGroupId
 * @param {boolean} [showBreaks]
 */
function withVisualBreaks(filmEvents, planGroupId, showBreaks = true) {
  /** @type {object[]} */
  const items = [];
  for (let i = 0; i < filmEvents.length; i += 1) {
    const film = filmEvents[i];
    items.push(film);
    const next = filmEvents[i + 1];
    if (!next || !showBreaks) continue;
    const gap = next.startMinutes - film.endMinutes;
    if (gap >= 5) {
      items.push({
        id: `${planGroupId}:break-${i}`,
        type: 'break',
        label: 'Break',
        startMinutes: film.endMinutes,
        durationMinutes: gap,
        planGroupId,
      });
    }
  }
  return items;
}

/**
 * @param {{
 *   storage?: Storage | null,
 *   weekOffset?: number,
 *   now?: Date | (() => Date),
 *   hideCompleted?: boolean,
 *   showBreaks?: boolean,
 *   timelineZoomId?: string,
 *   timeFormatId?: string,
 * }} [options]
 */
export function composeMyScheduleWeekFromAcceptedPlans(options = {}) {
  const nowFn =
    typeof options.now === 'function'
      ? options.now
      : () => options.now ?? new Date();
  const now = nowFn();
  const today = pacificDateString(now);
  const weekOffset = Number.isFinite(options.weekOffset)
    ? Number(options.weekOffset)
    : 0;
  const hideCompleted = options.hideCompleted !== false;
  const showBreaks = options.showBreaks !== false;
  const timeFormatId = options.timeFormatId ?? '12h';
  const timeRange =
    options.timelineZoomId != null
      ? timelineRangeFromZoomId(options.timelineZoomId)
      : MY_SCHEDULE_WEEK_TIMELINE_RANGE;
  const timeRulerLabels = Object.freeze(
    timelineRulerLabelsForRange(timeRange, timeFormatId),
  );

  const monday = addIsoDays(mondayOfWeekContaining(today), weekOffset * 7);
  const sunday = addIsoDays(monday, 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => addIsoDays(monday, i));

  const plans = getAcceptedPlans(options.storage).filter((plan) => {
    if (plan.date < monday || plan.date > sunday) return false;
    if (!hideCompleted) return true;
    const lastEnd = plan.performances.reduce((max, p) => {
      const t = Date.parse(p.expectedEndsAt);
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    return lastEnd === 0 || lastEnd >= now.getTime();
  });

  /** @type {Map<string, typeof plans>} */
  const byDate = new Map(weekDates.map((d) => [d, []]));
  for (const plan of plans) {
    byDate.get(plan.date)?.push(plan);
  }

  const days = weekDates.map((iso) => {
    const dow = isoWeekday(iso);
    const dayPlans = byDate.get(iso) ?? [];
    const planGroups = dayPlans.map((plan) => {
      const groupId = plan.planId;
      const films = plan.performances.map((p) =>
        performanceToFilmEvent(p, groupId, timeFormatId),
      );
      const items = withVisualBreaks(films, groupId, showBreaks);
      const kind = films.length > 1 ? 'multi' : 'single';
      return {
        id: groupId,
        kind,
        label: kind === 'multi' ? 'Multi-movie plan' : 'Planned film',
        modifyHint:
          kind === 'multi'
            ? 'Multi-movie plan • Tap anywhere to modify'
            : 'Tap to modify',
        items,
        planId: plan.planId,
        acceptedPlan: plan,
      };
    });

    const empty = planGroups.length === 0;
    return {
      id: iso,
      dayLabel: WEEKDAY_SHORT[dow],
      // Match mockup: dayLabel="MON" + dateLabel="JUL 27" (no weekday in dateLabel).
      dateLabel: formatCompactDateLabel(iso)
        .replace(/^[^,]+,\s*/, '')
        .toUpperCase(),
      empty,
      emptyTitle: empty ? 'No plans yet' : undefined,
      emptyHint: empty
        ? 'Accept a plan from Plan Results to see it here.'
        : undefined,
      planGroups,
      standaloneEvents: [],
      placeholders: [],
    };
  });

  const weekDays = weekDates.map((iso) => {
    const dow = isoWeekday(iso);
    const [y, m, d] = iso.split('-').map(Number);
    void y;
    void m;
    return {
      id: iso,
      letter: WEEKDAY_LETTERS[dow],
      date: d,
      hasPlans: (byDate.get(iso) ?? []).length > 0,
    };
  });

  // Next up: earliest upcoming performance across accepted plans (not week-bound).
  const upcoming = getAcceptedPlans(options.storage)
    .flatMap((plan) =>
      plan.performances.map((p) => ({ plan, performance: p })),
    )
    .filter(({ performance }) => Date.parse(performance.startsAt) >= now.getTime())
    .sort(
      (a, b) =>
        Date.parse(a.performance.startsAt) - Date.parse(b.performance.startsAt),
    )[0];

  const allPerfs = getAcceptedPlans(options.storage).flatMap(
    (p) => p.performances,
  );
  const filmDays = new Set(allPerfs.map((p) => p.localDate)).size;
  const totalRuntimeMin = allPerfs.reduce((sum, p) => sum + p.runtimeMin, 0);
  const hours = Math.floor(totalRuntimeMin / 60);
  const mins = totalRuntimeMin % 60;

  return {
    source: 'accepted-plans',
    view: 'week',
    title: 'My Schedule',
    tagline: 'Your movie plans at a glance.',
    searchLabel: 'Search',
    settingsLabel: 'Schedule settings',
    settingsStatus: 'Schedule settings.',
    searchPrefilterStatus: 'Search from the timeline isn’t wired yet.',
    modifyPlanPrompt: 'Modify plan?',
    monthViewStatus: 'Month view.',
    timelineDescription:
      'Accepted plans for this week. Breaks are visual only.',
    prevWeekLabel: 'Previous week',
    nextWeekLabel: 'Next week',
    viewToggle: {
      weekLabel: 'Week',
      monthLabel: 'Month',
    },
    timeRange,
    timeRulerLabels,
    nextUp: upcoming
      ? {
          label: 'NEXT UP',
          filmTitle: upcoming.performance.title,
          detailLabel: [
            upcoming.performance.format,
            upcoming.performance.theaterName
              ? `at ${upcoming.performance.theaterName}`
              : null,
          ]
            .filter(Boolean)
            .join(' '),
          timeLabel: `${formatCompactDateLabel(upcoming.performance.localDate)} • ${formatShowtimeLabel(pacificMinutesFromIso(upcoming.performance.startsAt) ?? 0, timeFormatId)}`,
          ticketsLabel: 'View tickets',
          imageUrl: upcoming.performance.posterUrl,
        }
      : {
          label: 'NEXT UP',
          filmTitle: 'No upcoming plans',
          detailLabel: 'Accept a plan from Plan Results',
          timeLabel: '',
          ticketsLabel: 'View tickets',
          imageUrl: null,
          empty: true,
        },
    insights: {
      label: 'AT A GLANCE',
      statsLine: `${filmDays} movie day${filmDays === 1 ? '' : 's'} • ${allPerfs.length} film${allPerfs.length === 1 ? '' : 's'} • ${hours}h ${mins}m`,
      actionLabel: 'View insights',
    },
    week: {
      id: `week-${monday}`,
      monthLabel: monthLabelForDate(monday),
      weekRangeLabel: weekRangeLabel(monday, sunday),
      todayButtonLabel: 'Today',
      selectedDateId: weekDates.includes(today) ? today : monday,
      weekDays,
      timeRulerLabels,
      currentTimeIndicator: weekDates.includes(today)
        ? {
            dayId: today,
            minutes: pacificMinutesFromIso(now.toISOString()) ?? 720,
          }
        : null,
      days,
    },
    canNavigateUnbounded: true,
  };
}
