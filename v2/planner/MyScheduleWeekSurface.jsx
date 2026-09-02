/**
 * My Schedule — Week View (T-SCH-01).
 *
 * Live default: accepted plans + schedule settings.
 * Mockup QC: `?scheduleMockup=1`.
 * Local-only — no calendar sync or cloud persistence.
 */

import { useEffect, useId, useMemo, useState } from 'react';
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
  minutesToTimelinePercent,
} from '../fixtures/myScheduleWeekMockupFixture.js';
import { resolveMyScheduleWeekPagePresentation } from '../fixtures/resolveMyScheduleWeekPresentation.js';
import { getScheduleSettings } from '../stores/scheduleSettingsStore.js';
import { removeAcceptedPlan } from '../stores/acceptedPlansStore.js';
import ScheduleModifyPlanSheet from './ScheduleModifyPlanSheet.jsx';
import { resolveFilmDetailNavParams } from '../identity/filmIdentity.js';
import { acceptedPlanToPlanDetailsPlan } from './acceptedPlanToPlanDetails.js';
import { weekOffsetForFocusDate } from './planLifecycle.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

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

function ScheduleEventBlock({ event, timeRange, onOpenFilmDetail }) {
  const geometry = eventBlockGeometry(event, timeRange);
  const groupLabel = `${event.title}, ${event.theaterLabel}, ${event.showtimeLabel}`;
  const canOpenFilm = Boolean(event.filmKey || event.filmId || event.showtimeFilmKey);
  return (
    <div
      className={`v2-msw-event v2-msw-event-${event.tone}`}
      style={{
        left: `${geometry.leftPercent}%`,
        width: `${geometry.widthPercent}%`,
      }}
      role="group"
      aria-label={groupLabel}
      data-schedule-event={event.id}
    >
      <button
        type="button"
        className="v2-msw-event-film"
        aria-label={`Open Film Detail for ${event.title}`}
        disabled={!canOpenFilm || typeof onOpenFilmDetail !== 'function'}
        onClick={() => onOpenFilmDetail?.(event)}
      >
        <img
          className="v2-msw-event-thumb"
          src={event.imageUrl || undefined}
          alt=""
        />
        <span className="v2-msw-event-title">{event.title}</span>
        <IconChevron
          className="v2-msw-event-chevron"
          width={12}
          height={12}
          aria-hidden="true"
        />
      </button>
      <span className="v2-msw-event-meta">
        <span className="v2-msw-event-venue">{event.theaterLabel}</span>
        <span className="v2-msw-event-time">{event.showtimeLabel}</span>
      </span>
    </div>
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
  onOpenFilmDetail,
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
              onOpenFilmDetail={onOpenFilmDetail}
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
  onOpenFilmDetail,
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
                onOpenFilmDetail={onOpenFilmDetail}
              />
            ))}
            {day.standaloneEvents.map((event) => (
              <ScheduleEventBlock
                key={event.id}
                event={event}
                timeRange={timeRange}
                onOpenFilmDetail={onOpenFilmDetail}
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
 *   onOpenMonth?: () => void,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   onOpenPlanDetails?: (plan: object) => void,
 *   homeData?: object | null,
 *   acceptedPlansRevision?: number,
 *   scheduleSettingsRevision?: number,
 *   onAcceptedPlanChange?: () => void,
 *   storage?: Storage | null,
 *   focusDate?: string | null,
 *   focusPlanId?: string | null,
 * }} [props]
 */
export default function MyScheduleWeekSurface({
  onOpenSearch,
  onOpenSettings,
  onStubAction,
  onOpenMonth,
  onOpenFilmDetail,
  onOpenPlanDetails,
  homeData = null,
  enrichmentIndex = null,
  acceptedPlansRevision = 0,
  scheduleSettingsRevision = 0,
  onAcceptedPlanChange,
  storage = null,
  focusDate = null,
  focusPlanId = null,
}) {
  const statusId = useId();
  const initialFocus =
    typeof focusDate === 'string' && focusDate.trim() ? focusDate.trim() : null;
  const [weekOffset, setWeekOffset] = useState(() =>
    initialFocus ? weekOffsetForFocusDate(initialFocus) : 0,
  );
  const [statusMessage, setStatusMessage] = useState(null);
  const [selectedDateId, setSelectedDateId] = useState(initialFocus);
  const [modifyPlan, setModifyPlan] = useState(null);
  const resolvedStorage = storage ?? getBrowserStorage();

  useEffect(() => {
    if (typeof focusDate === 'string' && focusDate.trim()) {
      const next = focusDate.trim();
      setSelectedDateId(next);
      setWeekOffset(weekOffsetForFocusDate(next));
    }
  }, [focusDate, focusPlanId]);

  const settings = useMemo(() => {
    void scheduleSettingsRevision;
    return getScheduleSettings(resolvedStorage);
  }, [resolvedStorage, scheduleSettingsRevision]);

  const presentation = useMemo(() => {
    void acceptedPlansRevision;
    return resolveMyScheduleWeekPagePresentation({
      weekOffset,
      storage: resolvedStorage,
      settings,
      homeData,
      enrichmentIndex,
    });
  }, [
    acceptedPlansRevision,
    resolvedStorage,
    settings,
    weekOffset,
    homeData,
    enrichmentIndex,
  ]);

  const week = presentation.week;
  const isMockup = presentation.mode === 'mockup-fixture';
  const canGoPrev = isMockup ? weekOffset > 0 : true;
  const canGoNext = isMockup
    ? weekOffset < (presentation.weekCount ?? 1) - 1
    : true;
  const activeSelectedDateId = selectedDateId ?? week.selectedDateId;

  const announce = (actionId, label, message) => {
    setStatusMessage(message ?? label);
    onStubAction?.(actionId, label);
  };

  const handlePrevWeek = () => {
    if (isMockup && !canGoPrev) {
      announce('week-prev', presentation.prevWeekLabel, 'Already at earliest week.');
      return;
    }
    setWeekOffset((value) => value - 1);
    setSelectedDateId(null);
    setStatusMessage('Showing previous week');
  };

  const handleNextWeek = () => {
    if (isMockup && !canGoNext) {
      announce('week-next', presentation.nextWeekLabel, 'Already at latest week.');
      return;
    }
    setWeekOffset((value) => value + 1);
    setSelectedDateId(null);
    setStatusMessage('Showing next week');
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
    announce('search', presentation.searchLabel, `${presentation.searchLabel} opens Search Results.`);
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
    if (isMockup || !group.acceptedPlan) {
      announce(
        `group-${group.id}`,
        presentation.modifyPlanPrompt,
        `${presentation.modifyPlanPrompt} Plan editing isn’t available yet.`,
      );
      return;
    }
    setModifyPlan(group.acceptedPlan);
  };

  const handlePlaceholderSelect = (placeholder) => {
    announce(
      `placeholder-${placeholder.id}`,
      presentation.modifyPlanPrompt,
      `${presentation.modifyPlanPrompt} Plan editing isn’t available yet.`,
    );
  };

  const handleOpenFilmFromRecord = (record) => {
    const params = resolveFilmDetailNavParams(record, homeData);
    if (!params || typeof onOpenFilmDetail !== 'function') {
      announce(
        'film-detail',
        record?.title ?? record?.filmTitle ?? 'Film',
        'Film Detail isn’t available for this screening yet.',
      );
      return;
    }
    onOpenFilmDetail(params);
  };

  const handleRemovePlan = (planId) => {
    const result = removeAcceptedPlan(resolvedStorage, planId);
    setModifyPlan(null);
    if (result.ok && result.changed) {
      setStatusMessage('Plan removed from Planner.');
      onAcceptedPlanChange?.();
    } else {
      setStatusMessage('Couldn’t remove that plan.');
    }
  };

  const handleViewPlanDetails = (plan) => {
    const adapted = acceptedPlanToPlanDetailsPlan(plan, {
      enrichmentIndex,
      homeData,
    });
    if (!adapted || typeof onOpenPlanDetails !== 'function') {
      announce(
        'plan-details',
        'View plan details',
        'Plan Details isn’t available for this accepted plan yet.',
      );
      return;
    }
    setModifyPlan(null);
    onOpenPlanDetails(adapted);
  };

  const handleNextUp = () => {
    if (presentation.nextUp?.empty) {
      announce(
        'next-up',
        presentation.nextUp.filmTitle,
        'Accept a plan from Plan Results to see upcoming films.',
      );
      return;
    }
    handleOpenFilmFromRecord(presentation.nextUp);
  };

  const handleTickets = (event) => {
    event.stopPropagation();
    const url = presentation.nextUp?.ticketUrl;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      setStatusMessage('Opening tickets.');
      return;
    }
    announce(
      'view-tickets',
      presentation.nextUp.ticketsLabel,
      'Tickets aren’t available for this screening.',
    );
  };

  const handleInsights = () => {
    announce(
      'insights',
      presentation.insights.actionLabel,
      `${presentation.insights.actionLabel} isn’t available yet.`,
    );
  };

  const handleToday = () => {
    if (isMockup) {
      announce(
        'today',
        week.todayButtonLabel,
        `${week.todayButtonLabel} jumps to the current week in a future release.`,
      );
      return;
    }
    setWeekOffset(0);
    setSelectedDateId(null);
    setStatusMessage('Showing this week');
  };

  const { nextUp, insights, timeRange } = presentation;

  return (
    <>
    <article
      className={`v2-msw${modifyPlan ? ' is-sheet-open' : ''}`}
      aria-labelledby="v2-msw-title"
      data-schedule-source={presentation.source}
      data-schedule-mode={presentation.mode}
      data-schedule-view={presentation.view}
      data-schedule-week={week.id}
      {...(modifyPlan ? { inert: '' } : {})}
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
          selectedDateId={activeSelectedDateId}
          onSelectDay={(id) => {
            setSelectedDateId(id);
            announce('week-day', 'Day', `Selected ${id}`);
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
          <button
            type="button"
            className="v2-msw-next-up-main"
            aria-label={
              nextUp.empty
                ? nextUp.filmTitle
                : `Open Film Detail for ${nextUp.filmTitle}`
            }
            onClick={handleNextUp}
          >
            {nextUp.imageUrl ? (
              <img className="v2-msw-next-up-thumb" src={nextUp.imageUrl} alt="" />
            ) : (
              <span
                className="v2-msw-next-up-thumb v2-msw-next-up-thumb-empty"
                aria-hidden="true"
              />
            )}
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
            onClick={handleToday}
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
                onOpenFilmDetail={handleOpenFilmFromRecord}
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
    <ScheduleModifyPlanSheet
      open={Boolean(modifyPlan)}
      plan={modifyPlan}
      onClose={() => setModifyPlan(null)}
      onRemove={handleRemovePlan}
      onOpenFilmDetail={handleOpenFilmFromRecord}
      onViewPlanDetails={handleViewPlanDetails}
    />
    </>
  );
}
