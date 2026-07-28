/**
 * Stage 1 My Schedule — Week View fixture-backed replica of
 * My Schedule Main Page.png (week selected).
 *
 * Local-only UI state. No planner persistence, calendar sync, or production
 * showtime queries.
 */

import { useId, useState } from 'react';
import {
  IconChart,
  IconChevron,
  IconCup,
  IconSearch,
  IconSliders,
  IconTicket,
} from '../icons.jsx';
import {
  breakBlockGeometry,
  eventBlockGeometry,
  getMyScheduleWeekMockupPresentation,
  minutesToTimelinePercent,
  resolveMyScheduleWeekPresentation,
} from '../fixtures/myScheduleWeekMockupFixture.js';

function ChevronLeft(props) {
  return (
    <IconChevron
      {...props}
      style={{ ...(props.style ?? {}), transform: 'rotate(180deg)' }}
    />
  );
}

function ScheduleViewToggle({ weekLabel, monthLabel, onMonthSelect }) {
  return (
    <div
      className="v2-msw-view-toggle"
      role="group"
      aria-label="Schedule view"
    >
      <button
        type="button"
        className="v2-msw-view-btn v2-msw-view-btn-active"
        aria-pressed="true"
      >
        {weekLabel}
      </button>
      <button
        type="button"
        className="v2-msw-view-btn"
        aria-pressed="false"
        onClick={onMonthSelect}
      >
        {monthLabel}
      </button>
    </div>
  );
}

function ScheduleWeekNavigator({
  monthLabel,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
}) {
  return (
    <div className="v2-msw-month-nav">
      <button
        type="button"
        className="v2-msw-nav-arrow"
        aria-label={prevLabel}
        onClick={onPrev}
        disabled={!canGoPrev}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className="v2-msw-month-label">{monthLabel}</span>
      <button
        type="button"
        className="v2-msw-nav-arrow"
        aria-label={nextLabel}
        onClick={onNext}
        disabled={!canGoNext}
      >
        <IconChevron aria-hidden="true" />
      </button>
    </div>
  );
}

function WeekDayPicker({ days, selectedDateId, onSelectDay }) {
  return (
    <div className="v2-msw-week-picker" role="group" aria-label="Week days">
      {days.map((day) => {
        const selected = day.id === selectedDateId;
        return (
          <button
            key={day.id}
            type="button"
            className={
              selected
                ? 'v2-msw-week-day v2-msw-week-day-selected'
                : 'v2-msw-week-day'
            }
            aria-pressed={selected}
            aria-label={`${day.letter} ${day.date}${day.hasPlans ? ', has plans' : ''}`}
            onClick={() => onSelectDay(day.id)}
          >
            <span className="v2-msw-week-letter">{day.letter}</span>
            <span className="v2-msw-week-date">{day.date}</span>
            {day.hasPlans ? (
              <span className="v2-msw-week-dot" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleTimeRuler({ labels, timeRange }) {
  return (
    <div className="v2-msw-ruler" aria-hidden="true">
      {labels.map((label, index) => {
        const fraction =
          labels.length <= 1 ? 0 : index / (labels.length - 1);
        const minutes =
          timeRange.startMinutes +
          fraction * (timeRange.endMinutes - timeRange.startMinutes);
        const left = minutesToTimelinePercent(minutes, timeRange);
        return (
          <span
            key={label}
            className="v2-msw-ruler-tick"
            style={{ left: `${left}%` }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function ScheduleEventBlock({ event, timeRange, onSelect }) {
  const geometry = eventBlockGeometry(event, timeRange);
  const label = `${event.title}, ${event.theaterLabel}, ${event.showtimeLabel}`;
  return (
    <button
      type="button"
      className={`v2-msw-event v2-msw-event-${event.tone}`}
      style={{
        left: `${geometry.leftPercent}%`,
        width: `${geometry.widthPercent}%`,
      }}
      aria-label={label}
      data-schedule-event={event.id}
      onClick={() => onSelect(event)}
    >
      <img className="v2-msw-event-thumb" src={event.imageUrl} alt="" />
      <span className="v2-msw-event-copy">
        <span className="v2-msw-event-title">{event.title}</span>
        <span className="v2-msw-event-venue">{event.theaterLabel}</span>
        <span className="v2-msw-event-time">{event.showtimeLabel}</span>
      </span>
    </button>
  );
}

function ScheduleBreakBlock({ breakItem, timeRange }) {
  const geometry = breakBlockGeometry(breakItem, timeRange);
  const durationLabel = `${breakItem.durationMinutes}m`;
  return (
    <div
      className="v2-msw-break"
      style={{
        left: `${geometry.leftPercent}%`,
        width: `${geometry.widthPercent}%`,
      }}
      role="img"
      aria-label={`${breakItem.label}, ${durationLabel}`}
      data-schedule-break={breakItem.id}
    >
      <IconCup width={14} height={14} aria-hidden="true" />
      <span className="v2-msw-break-label">{breakItem.label}</span>
      <span className="v2-msw-break-duration">{durationLabel}</span>
    </div>
  );
}

function SchedulePlanGroup({
  group,
  timeRange,
  onGroupSelect,
  onEventSelect,
}) {
  return (
    <div
      className="v2-msw-plan-group"
      role="group"
      data-schedule-plan-group={group.id}
      aria-label={group.label}
    >
      <div className="v2-msw-plan-group-track">
        {group.items.map((item) =>
          item.type === 'break' ? (
            <ScheduleBreakBlock
              key={item.id}
              breakItem={item}
              timeRange={timeRange}
            />
          ) : (
            <ScheduleEventBlock
              key={item.id}
              event={item}
              timeRange={timeRange}
              onSelect={(evt) => onEventSelect(evt)}
            />
          ),
        )}
      </div>
      <button
        type="button"
        className="v2-msw-plan-group-hint"
        onClick={() => onGroupSelect(group)}
      >
        {group.modifyHint}
      </button>
    </div>
  );
}

function SchedulePlanPlaceholder({ placeholder, timeRange, onSelect }) {
  const geometry = eventBlockGeometry(
    {
      startMinutes: placeholder.startMinutes,
      endMinutes: placeholder.endMinutes,
    },
    timeRange,
  );
  return (
    <button
      type="button"
      className="v2-msw-plan-placeholder"
      style={{
        left: `${geometry.leftPercent}%`,
        width: `${geometry.widthPercent}%`,
      }}
      aria-label={`${placeholder.label}. ${placeholder.modifyHint}`}
      data-schedule-placeholder={placeholder.id}
      onClick={() => onSelect(placeholder)}
    >
      <span className="v2-msw-plan-placeholder-label">{placeholder.label}</span>
      <span className="v2-msw-plan-placeholder-hint">
        {placeholder.modifyHint}
      </span>
    </button>
  );
}

function ScheduleDayRow({
  day,
  timeRange,
  currentTimeIndicator,
  onTimelineTap,
  onGroupSelect,
  onEventSelect,
  onPlaceholderSelect,
}) {
  const showNow =
    currentTimeIndicator?.dayId === day.id &&
    Number.isFinite(currentTimeIndicator.minutes);
  const nowLeft = showNow
    ? minutesToTimelinePercent(currentTimeIndicator.minutes, timeRange)
    : null;

  return (
    <section
      className="v2-msw-day"
      data-schedule-day={day.id}
      aria-labelledby={`v2-msw-day-${day.id}`}
    >
      <div className="v2-msw-day-head">
        <h2 id={`v2-msw-day-${day.id}`} className="v2-msw-day-label">
          <span>{day.dayLabel}</span> <span>{day.dateLabel}</span>
        </h2>
      </div>
      <div className="v2-msw-day-body">
        {day.empty ? (
          <button
            type="button"
            className="v2-msw-empty"
            onClick={() => onTimelineTap(day)}
          >
            <span className="v2-msw-empty-title">{day.emptyTitle}</span>
            <span className="v2-msw-empty-hint">{day.emptyHint}</span>
          </button>
        ) : (
          <div className="v2-msw-day-track-wrap">
            <button
              type="button"
              className="v2-msw-timeline-hit"
              aria-label={`Open search for ${day.dateLabel}`}
              onClick={() => onTimelineTap(day)}
            />
            {day.planGroups.map((group) => (
              <SchedulePlanGroup
                key={group.id}
                group={group}
                timeRange={timeRange}
                onGroupSelect={onGroupSelect}
                onEventSelect={onEventSelect}
              />
            ))}
            {day.standaloneEvents.map((event) => (
              <ScheduleEventBlock
                key={event.id}
                event={event}
                timeRange={timeRange}
                onSelect={onEventSelect}
              />
            ))}
            {day.placeholders.map((placeholder) => (
              <SchedulePlanPlaceholder
                key={placeholder.id}
                placeholder={placeholder}
                timeRange={timeRange}
                onSelect={onPlaceholderSelect}
              />
            ))}
            {showNow ? (
              <span
                className="v2-msw-now-line"
                style={{ left: `${nowLeft}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * @param {{
 *   onOpenSearch?: () => void,
 *   onOpenSettings?: () => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} [props]
 */
export default function MyScheduleWeekSurface({
  onOpenSearch,
  onOpenSettings,
  onStubAction,
  onOpenMonth,
}) {
  const presentation = getMyScheduleWeekMockupPresentation();
  const statusId = useId();
  const [weekIndex, setWeekIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState(null);

  const week = resolveMyScheduleWeekPresentation(weekIndex);
  const weekCount = presentation.weeks.length;
  const canGoPrev = weekIndex > 0;
  const canGoNext = weekIndex < weekCount - 1;

  const announce = (actionId, label, message) => {
    setStatusMessage(message ?? label);
    onStubAction?.(actionId, label);
  };

  const handlePrevWeek = () => {
    if (!canGoPrev) {
      announce('week-prev', presentation.prevWeekLabel, 'Already at earliest week.');
      return;
    }
    setWeekIndex((value) => value - 1);
    setStatusMessage(`Showing ${resolveMyScheduleWeekPresentation(weekIndex - 1).weekRangeLabel}`);
  };

  const handleNextWeek = () => {
    if (!canGoNext) {
      announce('week-next', presentation.nextWeekLabel, 'Already at latest week.');
      return;
    }
    setWeekIndex((value) => value + 1);
    setStatusMessage(`Showing ${resolveMyScheduleWeekPresentation(weekIndex + 1).weekRangeLabel}`);
  };

  const handleMonthSelect = () => {
    if (typeof onOpenMonth === 'function') {
      onOpenMonth();
      return;
    }
    announce(
      'month-view',
      presentation.viewToggle.monthLabel,
      presentation.monthViewStatus,
    );
  };

  const handleSearch = () => {
    if (onOpenSearch) {
      onOpenSearch();
      return;
    }
    announce('search', presentation.searchLabel, `${presentation.searchLabel} opens Search Results in Stage 1.`);
  };

  const handleSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    announce('settings', presentation.settingsLabel, presentation.settingsStatus);
  };

  const handleTimelineTap = (day) => {
    announce(
      `timeline-${day.id}`,
      `Timeline ${day.dateLabel}`,
      presentation.searchPrefilterStatus,
    );
  };

  const handleGroupSelect = (group) => {
    announce(
      `group-${group.id}`,
      presentation.modifyPlanPrompt,
      `${presentation.modifyPlanPrompt} Plan editing isn’t available in Stage 1.`,
    );
  };

  const handlePlaceholderSelect = (placeholder) => {
    announce(
      `placeholder-${placeholder.id}`,
      presentation.modifyPlanPrompt,
      `${presentation.modifyPlanPrompt} Plan editing isn’t available in Stage 1.`,
    );
  };

  const handleEventSelect = (event) => {
    announce(`event-${event.id}`, event.title, `${event.title} detail isn’t available from My Schedule in Stage 1.`);
  };

  const handleNextUp = () => {
    announce('next-up', presentation.nextUp.filmTitle, `${presentation.nextUp.ticketsLabel} isn’t available in Stage 1.`);
  };

  const handleTickets = (event) => {
    event.stopPropagation();
    announce('view-tickets', presentation.nextUp.ticketsLabel, `${presentation.nextUp.ticketsLabel} isn’t available in Stage 1.`);
  };

  const handleInsights = () => {
    announce('insights', presentation.insights.actionLabel, `${presentation.insights.actionLabel} isn’t available in Stage 1.`);
  };

  const { nextUp, insights, timeRange } = presentation;

  return (
    <article
      className="v2-msw"
      aria-labelledby="v2-msw-title"
      data-schedule-source={presentation.source}
      data-schedule-view={presentation.view}
      data-schedule-week={week.id}
    >
      <header className="v2-msw-header" data-schedule-section="header">
        <div className="v2-msw-toolbar">
          <button
            type="button"
            className="v2-msw-toolbar-btn"
            aria-label={presentation.searchLabel}
            onClick={handleSearch}
          >
            <IconSearch aria-hidden="true" />
          </button>
          <button
            type="button"
            className="v2-msw-toolbar-btn"
            aria-label={presentation.settingsLabel}
            onClick={handleSettings}
          >
            <IconSliders aria-hidden="true" />
          </button>
        </div>
        <h1 id="v2-msw-title" className="v2-msw-title">
          {presentation.title}
        </h1>
        <p className="v2-msw-tagline">{presentation.tagline}</p>
        <ScheduleViewToggle
          weekLabel={presentation.viewToggle.weekLabel}
          monthLabel={presentation.viewToggle.monthLabel}
          onMonthSelect={handleMonthSelect}
        />
      </header>

      <section
        className="v2-msw-week-picker-section"
        data-schedule-section="weekPicker"
        aria-label="Week navigation"
      >
        <ScheduleWeekNavigator
          monthLabel={week.monthLabel}
          prevLabel={presentation.prevWeekLabel}
          nextLabel={presentation.nextWeekLabel}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
        />
        <WeekDayPicker
          days={week.weekDays}
          selectedDateId={week.selectedDateId}
          onSelectDay={() => {
            announce('week-day', 'Day', 'Day selection is fixture-only in Stage 1.');
          }}
        />
      </section>

      <section
        className="v2-msw-next-up"
        data-schedule-section="nextUp"
        aria-labelledby="v2-msw-next-up-h"
      >
        <p id="v2-msw-next-up-h" className="v2-msw-next-up-label">
          {nextUp.label}
        </p>
        <div className="v2-msw-next-up-card">
          <button type="button" className="v2-msw-next-up-main" onClick={handleNextUp}>
            <img className="v2-msw-next-up-thumb" src={nextUp.imageUrl} alt="" />
            <span className="v2-msw-next-up-copy">
              <span className="v2-msw-next-up-title">{nextUp.filmTitle}</span>
              <span className="v2-msw-next-up-detail">{nextUp.detailLabel}</span>
              <span className="v2-msw-next-up-time">{nextUp.timeLabel}</span>
            </span>
            <span className="v2-msw-next-up-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
          <button
            type="button"
            className="v2-msw-next-up-tickets"
            onClick={handleTickets}
          >
            <IconTicket width={14} height={14} aria-hidden="true" />
            {nextUp.ticketsLabel}
          </button>
        </div>
      </section>

      <section
        className="v2-msw-timeline"
        data-schedule-section="timeline"
        aria-label="Weekly schedule"
      >
        <div className="v2-msw-timeline-head">
          <h2 className="v2-msw-timeline-range">{week.weekRangeLabel}</h2>
          <button
            type="button"
            className="v2-msw-today-btn"
            onClick={() =>
              announce('today', week.todayButtonLabel, `${week.todayButtonLabel} jumps to the current week in a future release.`)
            }
          >
            {week.todayButtonLabel}
          </button>
        </div>
        <p className="v2-visually-hidden">{presentation.timelineDescription}</p>
        <div className="v2-msw-timeline-scroll">
          <ScheduleTimeRuler labels={week.timeRulerLabels} timeRange={timeRange} />
          <div className="v2-msw-days">
            {week.days.map((day) => (
              <ScheduleDayRow
                key={day.id}
                day={day}
                timeRange={timeRange}
                currentTimeIndicator={week.currentTimeIndicator}
                onTimelineTap={handleTimelineTap}
                onGroupSelect={handleGroupSelect}
                onEventSelect={handleEventSelect}
                onPlaceholderSelect={handlePlaceholderSelect}
              />
            ))}
          </div>
        </div>
      </section>

      <section
        className="v2-msw-insights"
        data-schedule-section="insights"
        aria-labelledby="v2-msw-insights-h"
      >
        <button type="button" className="v2-msw-insights-card" onClick={handleInsights}>
          <span className="v2-msw-insights-icon" aria-hidden="true">
            <IconChart width={20} height={20} />
          </span>
          <span className="v2-msw-insights-copy">
            <span id="v2-msw-insights-h" className="v2-msw-insights-label">
              {insights.label}
            </span>
            <span className="v2-msw-insights-stats">{insights.statsLine}</span>
          </span>
          <span className="v2-msw-insights-action">
            {insights.actionLabel}
            <IconChevron aria-hidden="true" />
          </span>
        </button>
      </section>

      <p
        id={statusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {statusMessage ?? ''}
      </p>
    </article>
  );
}
