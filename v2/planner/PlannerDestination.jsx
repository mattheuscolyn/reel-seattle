/**
 * Planner Landing — shared presentation for live accepted plans and mockup QC.
 *
 * Visual QC: `?plannerMockup=1` uses Canonical Planner Landing fixture.
 * Upcoming / Past plan cards open persistent Plan Details (not My Schedule).
 */

import { useEffect, useId, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconClapper,
  IconClock,
  IconEdit,
} from '../icons.jsx';
import {
  getPlannerLandingMockupPresentation,
  isPlannerMockupMode,
} from '../fixtures/plannerLandingMockupFixture.js';
import { composePlannerLandingFromAcceptedPlans } from './composePlannerLandingPresentation.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   plan: {
 *     id: string,
 *     title: string,
 *     venueLabel?: string | null,
 *     whenLabel?: string | null,
 *     imageUrl?: string | null,
 *     badges?: { id: string, label: string, tone: string }[],
 *   },
 *   onOpen: (planId: string) => void,
 * }} props
 */
function PlanRowButton({ plan, onOpen }) {
  return (
    <button
      type="button"
      className="v2-planner-plan-row"
      data-plan-id={plan.id}
      onClick={() => onOpen(plan.id)}
    >
      {plan.imageUrl ? (
        <img className="v2-planner-plan-thumb" src={plan.imageUrl} alt="" />
      ) : (
        <span
          className="v2-planner-plan-thumb v2-planner-plan-thumb-fallback"
          aria-hidden="true"
        />
      )}
      <span className="v2-planner-plan-copy">
        <span className="v2-planner-plan-title">{plan.title}</span>
        {plan.venueLabel ? (
          <span className="v2-planner-plan-venue">{plan.venueLabel}</span>
        ) : null}
        {plan.whenLabel ? (
          <span className="v2-planner-plan-when">{plan.whenLabel}</span>
        ) : null}
        {plan.badges?.length ? (
          <span className="v2-planner-plan-badges">
            {plan.badges.map((badge) => (
              <span
                key={badge.id}
                className={`v2-planner-plan-badge v2-planner-plan-badge-${badge.tone}`}
              >
                {badge.label}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="v2-planner-plan-chevron" aria-hidden="true">
        <IconChevron />
      </span>
    </button>
  );
}

/**
 * @param {{
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onOpenBuildPlan?: () => void,
 *   onOpenMyScheduleWeek?: () => void,
 *   onOpenSavedPlan?: (planId: string) => void,
 *   acceptedPlansRevision?: number,
 *   plannerSeed?: { filmKey?: string, opportunityKey?: string | null, mode?: string } | null,
 *   seedFilmTitle?: string | null,
 * }} [props]
 */
export default function PlannerDestination({
  onStubAction,
  onOpenBuildPlan,
  onOpenMyScheduleWeek,
  onOpenSavedPlan,
  acceptedPlansRevision = 0,
  plannerSeed = null,
  seedFilmTitle = null,
}) {
  const mockupMode = isPlannerMockupMode();
  const storage = getBrowserStorage();
  const [settingsTick, setSettingsTick] = useState(0);
  const [pastExpanded, setPastExpanded] = useState(false);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  void acceptedPlansRevision;
  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const presentation = mockupMode
    ? getPlannerLandingMockupPresentation()
    : composePlannerLandingFromAcceptedPlans({ storage, timeFormatId });
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const {
    pageTitle,
    pageTagline,
    summary,
    upcoming,
    past,
    entries,
    draft,
  } = presentation;

  const openSchedule = () => {
    if (onOpenMyScheduleWeek) onOpenMyScheduleWeek();
    else announceStub('my-schedule', 'My Schedule');
  };

  const openBuild = () => {
    if (onOpenBuildPlan) onOpenBuildPlan();
    else announceStub('build-a-plan', 'Build a Plan');
  };

  const openSavedPlan = (planId) => {
    if (onOpenSavedPlan) onOpenSavedPlan(planId);
    else announceStub('saved-plan', 'Plan Details');
  };

  const pastPlans = Array.isArray(past?.plans) ? past.plans : [];
  const pastPreviewCount =
    typeof past?.previewCount === 'number' ? past.previewCount : 3;
  const visiblePastPlans =
    pastExpanded || !past?.viewAllLabel
      ? pastPlans
      : pastPlans.slice(0, pastPreviewCount);

  return (
    <section
      className="v2-planner"
      aria-labelledby="v2-planner-title"
      data-planner-source={presentation.source}
    >
      <header className="v2-planner-page-header" data-planner-section="header">
        <h1 id="v2-planner-title" className="v2-planner-title">
          {pageTitle}
        </h1>
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
            Use Build a Plan to continue from this film.
          </p>
        </div>
      ) : null}

      <section
        className="v2-planner-summary"
        data-planner-section="summary"
        aria-label="Planner summary"
      >
        <div className="v2-planner-summary-col">
          <span className="v2-planner-summary-icon v2-planner-summary-icon-purple" aria-hidden="true">
            <IconCalendar width={16} height={16} />
          </span>
          <p className="v2-planner-summary-value v2-planner-summary-value-purple">
            {summary.upcomingCount}
          </p>
          <p className="v2-planner-summary-label">Upcoming plans</p>
        </div>
        <div className="v2-planner-summary-divider" aria-hidden="true" />
        <div className="v2-planner-summary-col">
          <span className="v2-planner-summary-icon v2-planner-summary-icon-teal" aria-hidden="true">
            <IconEdit width={16} height={16} />
          </span>
          <p className="v2-planner-summary-value v2-planner-summary-value-teal">
            {summary.draftCount}
          </p>
          <p className="v2-planner-summary-label">Draft in progress</p>
        </div>
        <div className="v2-planner-summary-divider" aria-hidden="true" />
        <div className="v2-planner-summary-col">
          <span className="v2-planner-summary-icon v2-planner-summary-icon-purple" aria-hidden="true">
            <IconClock width={16} height={16} />
          </span>
          <p className="v2-planner-summary-value v2-planner-summary-value-purple">
            {summary.nextPlanValue}
          </p>
          <p className="v2-planner-summary-label">{summary.nextPlanLabel}</p>
        </div>
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
            className={`v2-planner-entry-card v2-planner-entry-${entry.accent}`}
            onClick={() => {
              if (entry.id === 'build-a-plan') {
                openBuild();
                return;
              }
              if (entry.id === 'my-schedule') {
                openSchedule();
                return;
              }
              announceStub(entry.id, entry.title);
            }}
          >
            <span
              className={`v2-planner-entry-icon v2-planner-entry-icon-${entry.icon}`}
              aria-hidden="true"
            >
              {entry.icon === 'build' ? (
                <IconClapper width={28} height={28} />
              ) : (
                <IconCalendar width={28} height={28} />
              )}
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
            onClick={openSchedule}
          >
            {upcoming.viewAllLabel}
          </button>
        </div>

        {upcoming.plans.length === 0 ? (
          <div className="v2-planner-empty" role="status">
            <p className="v2-planner-empty-title">
              {upcoming.emptyTitle || 'No upcoming plans yet'}
            </p>
            {upcoming.emptyBody ? (
              <p className="v2-planner-empty-body">{upcoming.emptyBody}</p>
            ) : null}
          </div>
        ) : (
          <ul className="v2-planner-plans">
            {upcoming.plans.map((plan) => (
              <li key={plan.id}>
                <PlanRowButton plan={plan} onOpen={openSavedPlan} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {!mockupMode && pastPlans.length > 0 ? (
        <section
          className="v2-planner-section"
          data-planner-section="pastPlans"
          aria-labelledby="v2-planner-past-h"
        >
          <div className="v2-planner-section-row">
            <h2 id="v2-planner-past-h" className="v2-planner-section-label">
              {past?.sectionTitle || 'Past Plans'}
            </h2>
            {past?.viewAllLabel && pastPlans.length > pastPreviewCount ? (
              <button
                type="button"
                className="v2-planner-link"
                onClick={() => setPastExpanded((value) => !value)}
              >
                {pastExpanded ? 'Show less' : past.viewAllLabel}
              </button>
            ) : null}
          </div>
          <ul className="v2-planner-plans">
            {visiblePastPlans.map((plan) => (
              <li key={plan.id}>
                <PlanRowButton plan={plan} onOpen={openSavedPlan} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft?.visible ? (
        <section data-planner-section="draft" aria-label="Continue draft">
          <button
            type="button"
            className="v2-planner-draft-card"
            onClick={openBuild}
          >
            <span className="v2-planner-draft-icon" aria-hidden="true">
              <IconEdit width={22} height={22} />
            </span>
            <span className="v2-planner-draft-copy">
              <span className="v2-planner-draft-eyebrow">{draft.eyebrow}</span>
              <span className="v2-planner-draft-title">{draft.title}</span>
              {draft.metaLabel ? (
                <span className="v2-planner-draft-meta">{draft.metaLabel}</span>
              ) : null}
            </span>
            <span className="v2-planner-draft-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        </section>
      ) : null}

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
