/**
 * Stage 1 Planner Landing — fixture-backed replica of Planner Landing Page.png.
 *
 * Does not persist plans or generate itineraries. Build a Plan opens the
 * Stage 1 config surface; My Schedule opens the Week view fixture surface.
 * Optional Film Detail plannerSeed is shown as an honest deferred note only.
 */

import { useId, useState } from 'react';
import {
  IconBookmark,
  IconCalendar,
  IconCalendarPlus,
  IconChevron,
  IconClapper,
  IconMore,
  IconPlus,
  IconShare,
} from '../icons.jsx';
import { resolvePlannerLandingPresentation } from '../fixtures/plannerLandingMockupFixture.js';

const ACTIVITY_ICONS = {
  bookmark: IconBookmark,
  calendarPlus: IconCalendarPlus,
  share: IconShare,
};

/**
 * @param {{
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onOpenBuildPlan?: () => void,
 *   onOpenMyScheduleWeek?: () => void,
 *   plannerSeed?: { filmKey?: string, opportunityKey?: string | null, mode?: string } | null,
 *   seedFilmTitle?: string | null,
 * }} [props]
 */
export default function PlannerDestination({
  onStubAction,
  onOpenBuildPlan,
  onOpenMyScheduleWeek,
  plannerSeed = null,
  seedFilmTitle = null,
}) {
  const presentation = resolvePlannerLandingPresentation();
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available in this Stage 1 Planner shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const { pageTitle, pageTagline, addPlanLabel, upcoming, entries, recentActivity } =
    presentation;

  return (
    <section
      className="v2-planner"
      aria-labelledby="v2-planner-title"
      data-planner-source={presentation.source}
    >
      <header className="v2-planner-page-header" data-planner-section="header">
        <div className="v2-planner-title-row">
          <h1 id="v2-planner-title" className="v2-planner-title">
            {pageTitle}
          </h1>
          <button
            type="button"
            className="v2-planner-add"
            aria-label={addPlanLabel}
            onClick={() => {
              if (onOpenBuildPlan) onOpenBuildPlan();
              else announceStub('add-plan', addPlanLabel);
            }}
          >
            <IconPlus />
          </button>
        </div>
        <p className="v2-planner-tagline">{pageTagline}</p>
      </header>

      {plannerSeed ? (
        <div className="v2-planner-seed-note" role="status">
          <p className="v2-planner-seed-note-title">Starting from Film Detail</p>
          <p>
            Film: <strong>{seedFilmTitle ?? 'Selected film'}</strong>
          </p>
          <p>
            Mode:{' '}
            <strong>
              {plannerSeed.mode === 'multi'
                ? 'Build a movie day'
                : 'Add this film to my calendar'}
            </strong>
          </p>
          <p className="v2-planner-seed-note-muted">
            Calendar write and itinerary generation are deferred in Stage 1.
          </p>
        </div>
      ) : null}

      <section
        className="v2-planner-section"
        data-planner-section="upcomingPlans"
        aria-labelledby="v2-planner-upcoming-h"
      >
        <div className="v2-planner-section-row">
          <h2 id="v2-planner-upcoming-h" className="v2-planner-section-label">
            {upcoming.sectionTitle}
          </h2>
          <button
            type="button"
            className="v2-planner-link"
            onClick={() =>
              announceStub('view-all-plans', upcoming.viewAllLabel)
            }
          >
            {upcoming.viewAllLabel}
          </button>
        </div>
        <ul className="v2-planner-plans">
          {upcoming.plans.map((plan) => (
            <li key={plan.id}>
              <div className="v2-planner-plan-card">
                <button
                  type="button"
                  className="v2-planner-plan-main"
                  onClick={() => announceStub(`plan-${plan.id}`, plan.title)}
                >
                  <span className="v2-planner-plan-date" aria-hidden="true">
                    <span>{plan.dateStack.weekday}</span>
                    <span>{plan.dateStack.monthDay}</span>
                  </span>
                  <img
                    className="v2-planner-plan-thumb"
                    src={plan.imageUrl}
                    alt=""
                  />
                  <span className="v2-planner-plan-copy">
                    <span className="v2-planner-plan-title">{plan.title}</span>
                    <span className="v2-planner-plan-detail">
                      {plan.detailLabel}
                    </span>
                    <span className="v2-planner-plan-time">{plan.timeLabel}</span>
                  </span>
                </button>
                <div className="v2-planner-plan-actions">
                  <button
                    type="button"
                    className="v2-planner-icon-btn v2-planner-icon-btn-on"
                    aria-label={`Bookmark ${plan.title}`}
                    aria-pressed={plan.bookmarked}
                    onClick={() =>
                      announceStub(`bookmark-${plan.id}`, `Bookmark ${plan.title}`)
                    }
                  >
                    <IconBookmark width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    className="v2-planner-icon-btn"
                    aria-label={`More actions for ${plan.title}`}
                    onClick={() =>
                      announceStub(`more-${plan.id}`, `More for ${plan.title}`)
                    }
                  >
                    <IconMore />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="v2-planner-plans-footer">
          <IconCalendar width={14} height={14} aria-hidden="true" />
          <span>{upcoming.footerLabel}</span>
        </p>
      </section>

      <section
        className="v2-planner-entries"
        data-planner-section="entryCards"
        aria-label="Planner destinations"
      >
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="v2-planner-entry-card"
            onClick={() => {
              if (entry.id === 'build-a-plan' && onOpenBuildPlan) {
                onOpenBuildPlan();
                return;
              }
              if (entry.id === 'my-schedule' && onOpenMyScheduleWeek) {
                onOpenMyScheduleWeek();
                return;
              }
              announceStub(entry.id, entry.title);
            }}
          >
            <span
              className={`v2-planner-entry-icon v2-planner-entry-icon-${entry.icon}`}
              aria-hidden="true"
            >
              {entry.icon === 'build' ? <IconClapper /> : <IconCalendar />}
            </span>
            <span className="v2-planner-entry-copy">
              <span className="v2-planner-entry-title">{entry.title}</span>
              <span className="v2-planner-entry-desc">{entry.description}</span>
            </span>
            <span className="v2-planner-entry-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        ))}
      </section>

      <section
        className="v2-planner-section"
        data-planner-section="recentActivity"
        aria-labelledby="v2-planner-activity-h"
      >
        <div className="v2-planner-section-row">
          <h2 id="v2-planner-activity-h" className="v2-planner-section-label">
            {recentActivity.sectionTitle}
          </h2>
          <button
            type="button"
            className="v2-planner-link"
            onClick={() =>
              announceStub('view-all-activity', recentActivity.viewAllLabel)
            }
          >
            {recentActivity.viewAllLabel}
          </button>
        </div>
        <ul className="v2-planner-activity">
          {recentActivity.items.map((item) => {
            const Icon = ACTIVITY_ICONS[item.icon] ?? IconBookmark;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="v2-planner-activity-row"
                  onClick={() => announceStub(item.id, item.label)}
                >
                  <span
                    className={`v2-planner-activity-icon v2-planner-activity-${item.tone}`}
                    aria-hidden="true"
                  >
                    <Icon width={16} height={16} />
                  </span>
                  <span className="v2-planner-activity-label">{item.label}</span>
                  <span className="v2-planner-activity-date">{item.dateLabel}</span>
                  <span aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p
        id={stubStatusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {stubMessage ?? ''}
      </p>
    </section>
  );
}
