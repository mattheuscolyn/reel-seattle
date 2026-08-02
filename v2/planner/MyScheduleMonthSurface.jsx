/**
 * My Schedule — Month View (T-SCH-01).
 *
 * Live default: accepted-plan heatmap (user schedule only).
 * Mockup QC: `?scheduleMockup=1`.
 */

import { useId, useMemo, useState } from 'react';
import {
  IconChart,
  IconChevron,
  IconClock,
  IconMovies,
  IconSearch,
  IconSliders,
  IconStarFill,
  IconTheaters,
} from '../icons.jsx';
import {
  dotCountFromMovieCount,
  heatLevelFromMovieCount,
} from '../fixtures/myScheduleMonthMockupFixture.js';
import { resolveMyScheduleMonthPagePresentation } from './resolveMyScheduleMonthPresentation.js';
import { getScheduleSettings } from '../stores/scheduleSettingsStore.js';

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

function ScheduleViewToggle({ weekLabel, monthLabel, activeView, onWeekSelect, onMonthSelect }) {
  const weekActive = activeView === 'week';
  const monthActive = activeView === 'month';
  return (
    <div className="v2-msw-view-toggle" role="group" aria-label="Schedule view">
      <button
        type="button"
        className={`v2-msw-view-btn${weekActive ? ' v2-msw-view-btn-active' : ''}`}
        aria-pressed={weekActive ? 'true' : 'false'}
        onClick={onWeekSelect}
      >
        {weekLabel}
      </button>
      <button
        type="button"
        className={`v2-msw-view-btn${monthActive ? ' v2-msw-view-btn-active' : ''}`}
        aria-pressed={monthActive ? 'true' : 'false'}
        onClick={onMonthSelect}
      >
        {monthLabel}
      </button>
    </div>
  );
}

function MonthNavigator({ monthLabel, onPrev, onNext, onToday, prevLabel, nextLabel, todayLabel }) {
  return (
    <div className="v2-msw-month-nav" aria-label="Month navigation">
      <button type="button" className="v2-msw-nav-arrow" aria-label={prevLabel} onClick={onPrev}>
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className="v2-msw-month-label">{monthLabel}</span>
      <button type="button" className="v2-msw-nav-arrow" aria-label={nextLabel} onClick={onNext}>
        <IconChevron aria-hidden="true" />
      </button>
      <button type="button" className="v2-msw-today-btn" onClick={onToday}>
        {todayLabel}
      </button>
    </div>
  );
}

function HeatmapLegend({ legend }) {
  return (
    <div className="v2-msw-legend" role="note" aria-label="Heatmap legend">
      {legend.map((item) => (
        <div key={item.id} className="v2-msw-legend-item">
          <span className="v2-msw-legend-dots" aria-hidden="true">
            {Array.from({ length: dotCountFromMovieCount(item.movieCount) }).map((_, idx) => (
              <span key={`${item.id}-d-${idx}`} className="v2-msw-legend-dot" />
            ))}
          </span>
          <span className="v2-msw-legend-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function SmallDayDotRow({ dots }) {
  return (
    <span className="v2-msw-small-dot-row" aria-hidden="true">
      {Array.from({ length: dots }).map((_, idx) => (
        <span key={`d-${idx}`} className="v2-msw-small-dot" />
      ))}
    </span>
  );
}

function HeatmapCell({ cell, selectedId, onSelect }) {
  const selected = cell.id === selectedId;
  const heat = heatLevelFromMovieCount(cell.movieCount);
  return (
    <button
      type="button"
      className={`v2-msw-heat-cell${selected ? ' v2-msw-heat-cell-selected' : ''}`}
      data-heat-level={heat}
      data-schedule-day={cell.id}
      aria-label={`${cell.weekdayLabel}, ${cell.dateNumber} — ${cell.movieCount} movie${cell.movieCount === 1 ? '' : 's'}`}
      onClick={() => onSelect(cell)}
    >
      <span className="v2-msw-heat-date" aria-hidden="true">{cell.dateNumber}</span>
      {cell.dots > 0 ? (
        <span className="v2-msw-heat-dots" aria-hidden="true">
          {Array.from({ length: cell.dots }).map((_, idx) => (
            <span key={`${cell.id}-dot-${idx}`} className="v2-msw-heat-dot" />
          ))}
        </span>
      ) : (
        <span className="v2-msw-heat-empty" aria-hidden="true" />
      )}
    </button>
  );
}

function ScheduleMonthHeatmap({ presentation, selectedDayId, onSelectDay }) {
  return (
    <section className="v2-msw-heatmap" aria-label="Month heatmap">
      <div className="v2-msw-heatmap-weekdays" aria-hidden="true">
        {presentation.heatmapWeekdays.map((d) => (
          <span key={d} className="v2-msw-heatmap-weekday">{d}</span>
        ))}
      </div>

      <div className="v2-msw-heatmap-grid" role="grid" aria-label="Showtime activity by day">
        {presentation.heatmapGrid.map((cell) => (
          <HeatmapCell key={cell.id} cell={cell} selectedId={selectedDayId} onSelect={onSelectDay} />
        ))}
      </div>

      <HeatmapLegend legend={presentation.legend} />
    </section>
  );
}

function BusiestDayCard({ card }) {
  return (
    <div className="v2-msw-busiest-card" data-schedule-busiest-day={card.id}>
      <p className="v2-msw-busiest-date">{card.dateLabel}</p>
      <div className="v2-msw-busiest-count">
        <SmallDayDotRow dots={card.dots} />
        <span className="v2-msw-busiest-count-label">{card.movieCount} movies</span>
      </div>
      <div className="v2-msw-busiest-thumbs" aria-hidden="true">
        {card.thumbUrls.map((url, idx) => (
          <img key={`${card.id}-t-${idx}`} className="v2-msw-busiest-thumb" src={url} alt="" />
        ))}
      </div>
    </div>
  );
}

function UpcomingHighlightRow({ row }) {
  return (
    <div className="v2-msw-upcoming-row" data-schedule-upcoming={row.id}>
      <img className="v2-msw-upcoming-thumb" src={row.thumbUrl} alt="" />
      <div className="v2-msw-upcoming-main">
        <p className="v2-msw-upcoming-date">{row.dateLabel}</p>
        <div className="v2-msw-upcoming-meta">
          <span className="v2-msw-upcoming-films">{row.filmCountLabel}</span>
          <SmallDayDotRow dots={row.dots} />
          <span className="v2-msw-upcoming-desc">{row.description}</span>
        </div>
      </div>
      <span className="v2-msw-upcoming-arrow" aria-hidden="true">
        <IconChevron />
      </span>
    </div>
  );
}

export default function MyScheduleMonthSurface({
  onOpenWeek,
  onOpenSearch,
  onOpenSettings,
  onStubAction,
  acceptedPlansRevision = 0,
  scheduleSettingsRevision = 0,
  storage = null,
}) {
  const statusId = useId();
  const [monthOffset, setMonthOffset] = useState(0);
  const [statusMessage, setStatusMessage] = useState(null);
  const [selectedDayId, setSelectedDayId] = useState(null);
  const resolvedStorage = storage ?? getBrowserStorage();

  const settings = useMemo(() => {
    void scheduleSettingsRevision;
    return getScheduleSettings(resolvedStorage);
  }, [resolvedStorage, scheduleSettingsRevision]);

  const presentation = useMemo(() => {
    void acceptedPlansRevision;
    return resolveMyScheduleMonthPagePresentation({
      monthOffset,
      storage: resolvedStorage,
      settings,
    });
  }, [acceptedPlansRevision, monthOffset, resolvedStorage, settings]);

  const isMockup = presentation.mode === 'mockup-fixture';
  const activeSelectedDayId =
    selectedDayId ??
    presentation.heatmapGrid.find((c) => c.selected)?.id ??
    presentation.heatmapGrid[0]?.id;

  const announce = (actionId, label, message) => {
    setStatusMessage(message ?? label);
    onStubAction?.(actionId, label);
  };

  const handlePrevMonth = () => {
    if (isMockup) {
      announce('month-prev', presentation.prevMonthLabel, 'Month navigation stays on the fixture month in mockup mode.');
      return;
    }
    setMonthOffset((v) => v - 1);
    setSelectedDayId(null);
    setStatusMessage('Showing previous month');
  };
  const handleNextMonth = () => {
    if (isMockup) {
      announce('month-next', presentation.nextMonthLabel, 'Month navigation stays on the fixture month in mockup mode.');
      return;
    }
    setMonthOffset((v) => v + 1);
    setSelectedDayId(null);
    setStatusMessage('Showing next month');
  };
  const handleToday = () => {
    if (isMockup) {
      announce('today', presentation.todayButtonLabel, 'Today stays on the fixture month in mockup mode.');
      return;
    }
    setMonthOffset(0);
    setSelectedDayId(null);
    setStatusMessage('Showing this month');
  };

  const handleSearch = () => {
    if (typeof onOpenSearch === 'function') return onOpenSearch();
    announce('search', presentation.searchLabel, 'Search Results day/time prefilter is deferred in Stage 1.');
  };

  const handleSettings = () => {
    if (typeof onOpenSettings === 'function') return onOpenSettings();
    announce('settings', presentation.settingsLabel, 'Schedule Settings is deferred in Stage 1.');
  };

  const handleWeekSelect = () => {
    if (typeof onOpenWeek === 'function') return onOpenWeek();
    announce('week', presentation.viewToggle.weekLabel, 'Week view switching is deferred in Stage 1.');
  };

  const handleMonthSelect = () =>
    announce('month', presentation.viewToggle.monthLabel, 'Month view is already active.');

  const handleSelectDay = (cell) => {
    setSelectedDayId(cell.id);
    announce(`day-${cell.id}`, `${cell.weekdayLabel}, ${cell.dateNumber}`, `Selected ${cell.dateNumber} in ${presentation.monthLabel}.`);
  };

  return (
    <article
      className="v2-msw"
      aria-labelledby="v2-msw-month-title"
      data-schedule-source={presentation.source}
      data-schedule-view={presentation.view}
      data-schedule-mode={presentation.mode}
      data-schedule-month={presentation.yearMonth ?? presentation.monthLabel}
    >
      <header className="v2-msw-header" data-schedule-section="header">
        <div className="v2-msw-toolbar">
          <button type="button" className="v2-msw-toolbar-btn" aria-label={presentation.searchLabel} onClick={handleSearch}>
            <IconSearch aria-hidden="true" />
          </button>
          <button type="button" className="v2-msw-toolbar-btn" aria-label={presentation.settingsLabel} onClick={handleSettings}>
            <IconSliders aria-hidden="true" />
          </button>
        </div>

        <h1 id="v2-msw-month-title" className="v2-msw-title">{presentation.title}</h1>
        <p className="v2-msw-tagline">{presentation.tagline}</p>

        <ScheduleViewToggle
          weekLabel={presentation.viewToggle.weekLabel}
          monthLabel={presentation.viewToggle.monthLabel}
          activeView="month"
          onWeekSelect={handleWeekSelect}
          onMonthSelect={handleMonthSelect}
        />
      </header>

      <section className="v2-msw-month-split" aria-label="Month overview">
        <div className="v2-msw-month-side">
          <div className="v2-msw-at-glance">
            <div className="v2-msw-at-glance-title-row">
              <span className="v2-msw-at-glance-icon" aria-hidden="true">
                <IconChart width={18} height={18} />
              </span>
              <p className="v2-msw-at-glance-title">{presentation.heatmapLabel}</p>
            </div>

            <div className="v2-msw-at-glance-stats">
              <div className="v2-msw-at-stat">
                <span className="v2-msw-at-stat-icon" aria-hidden="true"><IconMovies width={16} height={16} /></span>
                <span className="v2-msw-at-stat-text">
                  <span className="v2-msw-at-stat-value">{presentation.atAGlanceStats[0].value}</span>
                  <span className="v2-msw-at-stat-label">{presentation.atAGlanceStats[0].label}</span>
                </span>
              </div>
              <div className="v2-msw-at-stat">
                <span className="v2-msw-at-stat-icon" aria-hidden="true"><IconMovies width={16} height={16} /></span>
                <span className="v2-msw-at-stat-text">
                  <span className="v2-msw-at-stat-value">{presentation.atAGlanceStats[1].value}</span>
                  <span className="v2-msw-at-stat-label">{presentation.atAGlanceStats[1].label}</span>
                </span>
              </div>
              <div className="v2-msw-at-stat">
                <span className="v2-msw-at-stat-icon" aria-hidden="true"><IconClock width={16} height={16} /></span>
                <span className="v2-msw-at-stat-text">
                  <span className="v2-msw-at-stat-value">{presentation.atAGlanceStats[2].value}</span>
                  <span className="v2-msw-at-stat-label">{presentation.atAGlanceStats[2].label}</span>
                </span>
              </div>
              <div className="v2-msw-at-stat">
                <span className="v2-msw-at-stat-icon" aria-hidden="true"><IconStarFill width={16} height={16} /></span>
                <span className="v2-msw-at-stat-text">
                  <span className="v2-msw-at-stat-value">{presentation.atAGlanceStats[3].value}</span>
                  <span className="v2-msw-at-stat-label">{presentation.atAGlanceStats[3].label}</span>
                </span>
              </div>
              <div className="v2-msw-at-stat">
                <span className="v2-msw-at-stat-icon" aria-hidden="true"><IconTheaters width={16} height={16} /></span>
                <span className="v2-msw-at-stat-text">
                  <span className="v2-msw-at-stat-value">{presentation.atAGlanceStats[4].value}</span>
                  <span className="v2-msw-at-stat-label">{presentation.atAGlanceStats[4].label}</span>
                </span>
              </div>
            </div>

            <button type="button" className="v2-msw-at-glance-btn" onClick={() => announce('insights', presentation.viewInsightsLabel, 'Insights are deferred in Stage 1.')}
            >
              {presentation.viewInsightsLabel}
              <IconChevron aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="v2-msw-month-main">
          <MonthNavigator
            monthLabel={presentation.monthLabel}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            onToday={handleToday}
            prevLabel={presentation.prevMonthLabel}
            nextLabel={presentation.nextMonthLabel}
            todayLabel={presentation.todayButtonLabel}
          />

          <p className="v2-visually-hidden">{presentation.heatmapDescription}</p>
          <ScheduleMonthHeatmap
            presentation={presentation}
            selectedDayId={activeSelectedDayId}
            onSelectDay={handleSelectDay}
          />
        </div>
      </section>

      <section className="v2-msw-month-section" aria-label="Busiest days">
        <div className="v2-msw-month-section-head">
          <h2 className="v2-msw-month-section-title">Busiest days this month</h2>
          <button type="button" className="v2-msw-month-view-all" onClick={() => announce('busiest-view-all', presentation.busiestDaysViewAllLabel, 'View all is deferred in Stage 1.')}
          >
            {presentation.busiestDaysViewAllLabel}
          </button>
        </div>
        <div className="v2-msw-month-card-row">
          {presentation.busiestDays.map((card) => (
            <BusiestDayCard key={card.id} card={card} />
          ))}
        </div>
      </section>

      <section className="v2-msw-month-section" aria-label="Upcoming highlights">
        <div className="v2-msw-month-section-head">
          <h2 className="v2-msw-month-section-title">Upcoming highlights</h2>
          <button type="button" className="v2-msw-month-view-all" onClick={() => announce('upcoming-view-all', presentation.upcomingHighlightsViewAllLabel, 'View all is deferred in Stage 1.')}
          >
            {presentation.upcomingHighlightsViewAllLabel}
          </button>
        </div>
        <div className="v2-msw-upcoming-list">
          {presentation.upcomingHighlights.map((row) => (
            <UpcomingHighlightRow key={row.id} row={row} />
          ))}
        </div>
      </section>

      <p id={statusId} className="v2-visually-hidden" role="status" aria-live="polite">
        {statusMessage ?? ''}
      </p>
    </article>
  );
}
