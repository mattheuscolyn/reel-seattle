/**
 * My Schedule Week MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/My Schedule Main Page.png
 * (Week view). Not production plans. Does not import or write stores.
 */

function thumbSvg(title, from, to) {
  const safe = String(title).replace(/[<>&']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72" viewBox="0 0 120 72">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="120" height="72" fill="url(#g)"/>
  <text x="8" y="64" fill="#f5f5f7" font-family="Georgia, serif" font-size="10">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Visible timeline window on the mockup (12 PM – 10 PM). */
export const MY_SCHEDULE_WEEK_TIMELINE_RANGE = Object.freeze({
  startMinutes: 720,
  endMinutes: 1320,
});

export const MY_SCHEDULE_WEEK_SECTION_ORDER = Object.freeze([
  'header',
  'weekPicker',
  'nextUp',
  'timeline',
  'insights',
]);

/**
 * @param {{ startMinutes: number, endMinutes: number }} timeRange
 * @returns {number}
 */
export function timelineSpanMinutes(timeRange) {
  return timeRange.endMinutes - timeRange.startMinutes;
}

/**
 * @param {number} minutes
 * @param {{ startMinutes: number, endMinutes: number }} timeRange
 * @returns {number}
 */
export function minutesToTimelinePercent(minutes, timeRange) {
  const span = timelineSpanMinutes(timeRange);
  if (span <= 0) return 0;
  const raw = ((minutes - timeRange.startMinutes) / span) * 100;
  return Math.min(100, Math.max(0, raw));
}

/**
 * @param {{ startMinutes: number, endMinutes: number }} event
 * @param {{ startMinutes: number, endMinutes: number }} timeRange
 */
export function eventBlockGeometry(event, timeRange) {
  const leftPercent = minutesToTimelinePercent(event.startMinutes, timeRange);
  const rightPercent = minutesToTimelinePercent(event.endMinutes, timeRange);
  return {
    leftPercent,
    widthPercent: Math.max(0, rightPercent - leftPercent),
  };
}

/**
 * @param {{ startMinutes: number, durationMinutes: number }} breakItem
 * @param {{ startMinutes: number, endMinutes: number }} timeRange
 */
export function breakBlockGeometry(breakItem, timeRange) {
  const endMinutes = breakItem.startMinutes + breakItem.durationMinutes;
  return eventBlockGeometry(
    { startMinutes: breakItem.startMinutes, endMinutes },
    timeRange,
  );
}

/**
 * @param {number} weekIndex
 * @returns {Readonly<object>}
 */
export function resolveMyScheduleWeekPresentation(weekIndex = 0) {
  const weeks = MY_SCHEDULE_WEEK_MOCKUP_FIXTURE.weeks;
  const index = ((weekIndex % weeks.length) + weeks.length) % weeks.length;
  return weeks[index];
}

/**
 * @returns {Readonly<object>}
 */
export function getMyScheduleWeekMockupPresentation() {
  return MY_SCHEDULE_WEEK_MOCKUP_FIXTURE;
}

function filmEvent({
  id,
  title,
  theaterLabel,
  showtimeLabel,
  startMinutes,
  endMinutes,
  planGroupId = null,
  tone = 'purple',
  imageUrl = null,
}) {
  return Object.freeze({
    id,
    type: 'film',
    title,
    theaterLabel,
    showtimeLabel,
    startMinutes,
    endMinutes,
    planGroupId,
    tone,
    imageUrl: imageUrl ?? thumbSvg(title, '#2a3348', '#6b4a3a'),
  });
}

function breakEvent({
  id,
  startMinutes,
  durationMinutes,
  planGroupId = null,
  label = 'Break',
}) {
  return Object.freeze({
    id,
    type: 'break',
    label,
    startMinutes,
    durationMinutes,
    planGroupId,
  });
}

const WEEK_PRIMARY = Object.freeze({
  id: 'week-jul-19-25',
  monthLabel: 'July 2026',
  weekRangeLabel: 'JUL 19 – JUL 25, 2026',
  todayButtonLabel: 'Today',
  selectedDateId: 'sun-jul-20',
  weekDays: Object.freeze([
    Object.freeze({ id: 'mon-jul-14', letter: 'M', date: 14, hasPlans: false }),
    Object.freeze({ id: 'tue-jul-15', letter: 'T', date: 15, hasPlans: false }),
    Object.freeze({ id: 'wed-jul-16', letter: 'W', date: 16, hasPlans: true }),
    Object.freeze({ id: 'thu-jul-17', letter: 'T', date: 17, hasPlans: true }),
    Object.freeze({ id: 'fri-jul-18', letter: 'F', date: 18, hasPlans: true }),
    Object.freeze({ id: 'sat-jul-19', letter: 'S', date: 19, hasPlans: true }),
    Object.freeze({ id: 'sun-jul-20', letter: 'S', date: 20, hasPlans: true }),
  ]),
  timeRulerLabels: Object.freeze([
    '12 PM',
    '2 PM',
    '4 PM',
    '6 PM',
    '8 PM',
    '10 PM',
  ]),
  currentTimeIndicator: Object.freeze({
    dayId: 'sun-jul-20',
    minutes: 840,
  }),
  days: Object.freeze([
    Object.freeze({
      id: 'sat-jul-19',
      dayLabel: 'SAT',
      dateLabel: 'JUL 19',
      empty: false,
      planGroups: Object.freeze([
        Object.freeze({
          id: 'group-sat-multi',
          kind: 'multi',
          label: 'Multi-movie plan',
          modifyHint: 'Multi-movie plan • Tap anywhere to modify',
          items: Object.freeze([
            filmEvent({
              id: 'evt-solar-tide',
              title: 'Solar Tide',
              theaterLabel: 'SIFF Uptown',
              showtimeLabel: '2:00 PM',
              startMinutes: 840,
              endMinutes: 990,
              planGroupId: 'group-sat-multi',
              tone: 'teal',
              imageUrl: thumbSvg('Solar', '#1a3a48', '#3a7a8a'),
            }),
            breakEvent({
              id: 'brk-sat-afternoon',
              startMinutes: 990,
              durationMinutes: 30,
              planGroupId: 'group-sat-multi',
            }),
            filmEvent({
              id: 'evt-blue-hour',
              title: 'Blue Hour',
              theaterLabel: 'Egyptian Theatre',
              showtimeLabel: '5:00 PM',
              startMinutes: 1020,
              endMinutes: 1140,
              planGroupId: 'group-sat-multi',
              tone: 'blue',
              imageUrl: thumbSvg('Blue', '#14243a', '#3d6ea5'),
            }),
            breakEvent({
              id: 'brk-sat-evening',
              startMinutes: 1140,
              durationMinutes: 60,
              planGroupId: 'group-sat-multi',
              label: 'Break',
            }),
            filmEvent({
              id: 'evt-after-storm',
              title: 'After the Storm',
              theaterLabel: 'AMC Pacific Place 11',
              showtimeLabel: '9:15 PM',
              startMinutes: 1275,
              endMinutes: 1320,
              planGroupId: 'group-sat-multi',
              tone: 'amber',
              imageUrl: thumbSvg('Storm', '#1a2438', '#3a4a6a'),
            }),
          ]),
        }),
      ]),
      standaloneEvents: Object.freeze([]),
      placeholders: Object.freeze([]),
    }),
    Object.freeze({
      id: 'sun-jul-20',
      dayLabel: 'SUN',
      dateLabel: 'JUL 20',
      empty: false,
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([
        filmEvent({
          id: 'evt-long-horizon-sun',
          title: 'The Long Horizon',
          theaterLabel: 'SIFF Downtown',
          showtimeLabel: '6:45 PM',
          startMinutes: 1125,
          endMinutes: 1290,
          tone: 'purple',
          imageUrl: thumbSvg('Horizon', '#2a3348', '#6b4a3a'),
        }),
      ]),
      placeholders: Object.freeze([
        Object.freeze({
          id: 'ph-sun-multi',
          kind: 'multi-placeholder',
          label: 'Multi-movie plan',
          modifyHint: 'Tap to modify',
          startMinutes: 900,
          endMinutes: 1080,
        }),
      ]),
    }),
    Object.freeze({
      id: 'mon-jul-21',
      dayLabel: 'MON',
      dateLabel: 'JUL 21',
      empty: true,
      emptyTitle: 'No plans yet',
      emptyHint: 'Tap the timeline to find movies',
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([]),
      placeholders: Object.freeze([]),
    }),
    Object.freeze({
      id: 'tue-jul-22',
      dayLabel: 'TUE',
      dateLabel: 'JUL 22',
      empty: false,
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([
        filmEvent({
          id: 'evt-perfect-moment',
          title: 'Perfect Moment',
          theaterLabel: 'Central Cinema',
          showtimeLabel: '7:00 PM',
          startMinutes: 1140,
          endMinutes: 1260,
          tone: 'rose',
          imageUrl: thumbSvg('Perfect', '#3a2438', '#8a4a6a'),
        }),
      ]),
      placeholders: Object.freeze([]),
    }),
    Object.freeze({
      id: 'wed-jul-23',
      dayLabel: 'WED',
      dateLabel: 'JUL 23',
      empty: false,
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([
        filmEvent({
          id: 'evt-rashomon',
          title: 'Rashomon',
          theaterLabel: 'SIFF Film Center',
          showtimeLabel: '6:30 PM',
          startMinutes: 1110,
          endMinutes: 1230,
          tone: 'gold',
          imageUrl: thumbSvg('Rashomon', '#3a3020', '#8a7040'),
        }),
      ]),
      placeholders: Object.freeze([]),
    }),
    Object.freeze({
      id: 'thu-jul-24',
      dayLabel: 'THU',
      dateLabel: 'JUL 24',
      empty: true,
      emptyTitle: 'No plans yet',
      emptyHint: 'Tap the timeline to find movies',
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([]),
      placeholders: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fri-jul-25',
      dayLabel: 'FRI',
      dateLabel: 'JUL 25',
      empty: false,
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([
        filmEvent({
          id: 'evt-moon-harbor',
          title: 'Moon Harbor',
          theaterLabel: 'SIFF Uptown',
          showtimeLabel: '4:00 PM',
          startMinutes: 960,
          endMinutes: 1080,
          tone: 'teal',
          imageUrl: thumbSvg('Moon', '#1a3048', '#4a7a9a'),
        }),
        filmEvent({
          id: 'evt-2001',
          title: '2001: A Space Odyssey',
          theaterLabel: 'Cinerama',
          showtimeLabel: '8:45 PM',
          startMinutes: 1245,
          endMinutes: 1320,
          tone: 'indigo',
          imageUrl: thumbSvg('2001', '#1a1a38', '#4a4a8a'),
        }),
      ]),
      placeholders: Object.freeze([]),
    }),
  ]),
});

const WEEK_ALT = Object.freeze({
  id: 'week-jul-26-aug-1',
  monthLabel: 'July 2026',
  weekRangeLabel: 'JUL 26 – AUG 1, 2026',
  todayButtonLabel: 'Today',
  selectedDateId: 'sun-jul-27',
  weekDays: Object.freeze([
    Object.freeze({ id: 'mon-jul-21', letter: 'M', date: 21, hasPlans: false }),
    Object.freeze({ id: 'tue-jul-22', letter: 'T', date: 22, hasPlans: true }),
    Object.freeze({ id: 'wed-jul-23', letter: 'W', date: 23, hasPlans: true }),
    Object.freeze({ id: 'thu-jul-24', letter: 'T', date: 24, hasPlans: false }),
    Object.freeze({ id: 'fri-jul-25', letter: 'F', date: 25, hasPlans: true }),
    Object.freeze({ id: 'sat-jul-26', letter: 'S', date: 26, hasPlans: true }),
    Object.freeze({ id: 'sun-jul-27', letter: 'S', date: 27, hasPlans: false }),
  ]),
  timeRulerLabels: Object.freeze([
    '12 PM',
    '2 PM',
    '4 PM',
    '6 PM',
    '8 PM',
    '10 PM',
  ]),
  currentTimeIndicator: null,
  days: Object.freeze([
    Object.freeze({
      id: 'sat-jul-26',
      dayLabel: 'SAT',
      dateLabel: 'JUL 26',
      empty: false,
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([
        filmEvent({
          id: 'evt-alt-neon',
          title: 'Neon District',
          theaterLabel: 'Grand Illusion',
          showtimeLabel: '5:30 PM',
          startMinutes: 1050,
          endMinutes: 1170,
          tone: 'purple',
        }),
      ]),
      placeholders: Object.freeze([]),
    }),
    Object.freeze({
      id: 'sun-jul-27',
      dayLabel: 'SUN',
      dateLabel: 'JUL 27',
      empty: true,
      emptyTitle: 'No plans yet',
      emptyHint: 'Tap the timeline to find movies',
      planGroups: Object.freeze([]),
      standaloneEvents: Object.freeze([]),
      placeholders: Object.freeze([]),
    }),
  ]),
});

/**
 * @type {Readonly<object>}
 */
export const MY_SCHEDULE_WEEK_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  title: 'My Schedule',
  tagline: 'Your movie plans at a glance.',
  view: 'week',
  viewToggle: Object.freeze({
    weekLabel: 'Week',
    monthLabel: 'Month',
  }),
  searchLabel: 'Search',
  settingsLabel: 'Schedule settings',
  prevWeekLabel: 'Previous week',
  nextWeekLabel: 'Next week',
  timelineDescription:
    'Weekly movie schedule with showtimes from noon to 10 PM. Film blocks show title, theater, and showtime.',
  nextUp: Object.freeze({
    label: 'NEXT UP',
    filmTitle: 'The Long Horizon',
    detailLabel: '70mm at SIFF Downtown',
    timeLabel: 'Tomorrow • 7:00 PM',
    ticketsLabel: 'View tickets',
    imageUrl: thumbSvg('Horizon', '#2a3348', '#6b4a3a'),
  }),
  insights: Object.freeze({
    label: 'JULY AT A GLANCE',
    statsLine: '8 movie days • 11 films • 23h 45m',
    actionLabel: 'View insights',
  }),
  modifyPlanPrompt: 'Modify plan?',
  searchPrefilterStatus:
    'Search prefilter by day and time isn’t wired in Stage 1 yet.',
  monthViewStatus: 'Month view isn’t available in this Stage 1 shell yet.',
  settingsStatus:
    'Schedule Settings isn’t available in this Stage 1 shell yet.',
  timeRange: MY_SCHEDULE_WEEK_TIMELINE_RANGE,
  weeks: Object.freeze([WEEK_PRIMARY, WEEK_ALT]),
});

/** Query seam for Stage 1 QC / tests. */
export const MY_SCHEDULE_WEEK_QUERY = 'myScheduleWeek';

/**
 * @returns {boolean}
 */
export function isMyScheduleWeekQueryOpen() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(MY_SCHEDULE_WEEK_QUERY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}
