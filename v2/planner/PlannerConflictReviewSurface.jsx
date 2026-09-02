/**
 * Planner — dedicated conflict review surface.
 *
 * Canonical reference: Planner Main Page Upcoming Conflict Clickthrough.png
 */

import { useEffect, useId, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconChevronLeft,
  IconInfo,
  IconLightbulb,
  IconTrash,
} from '../icons.jsx';
import { isPlannerMockupMode } from '../fixtures/plannerLandingMockupFixture.js';
import {
  alternateToAcceptedPerformanceInput,
  isPlannerConflictResolved,
  resolvePlannerConflictReviewPresentation,
} from './resolvePlannerConflictReviewPresentation.js';
import {
  removePerformanceFromAcceptedPlan,
  replaceAcceptedPlanPerformance,
} from '../stores/acceptedPlansStore.js';
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
 * @param {{ url?: string | null, title?: string, className?: string }} props
 */
function PosterThumb({ url, title = '', className = 'v2-pcr-poster' }) {
  if (url) {
    return <img className={className} src={url} alt="" />;
  }
  return (
    <span
      className={`${className} v2-pcr-poster-fallback`}
      aria-hidden="true"
      data-title={title}
    />
  );
}

/**
 * @param {{
 *   conflictId: string,
 *   onBack: () => void,
 *   onConflictResolved?: () => void,
 *   onAcceptedPlansChange?: () => void,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 * }} props
 */
export default function PlannerConflictReviewSurface({
  conflictId,
  onBack,
  onConflictResolved,
  onAcceptedPlansChange,
  storage: storageProp = null,
  homeData = null,
  enrichmentIndex = null,
}) {
  const titleId = useId();
  const statusId = useId();
  const storage = storageProp ?? getBrowserStorage();
  const mockupMode = isPlannerMockupMode();
  const [settingsTick, setSettingsTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  void revision;

  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const resolved = resolvePlannerConflictReviewPresentation({
    conflictId,
    storage,
    homeData,
    enrichmentIndex,
    timeFormatId,
    mockupMode,
  });

  const finishIfResolved = () => {
    if (mockupMode) {
      onConflictResolved?.();
      onBack();
      return;
    }
    const memberPlanIds = (resolved.presentation?.members ?? []).map(
      (m) => m.planId,
    );
    if (isPlannerConflictResolved(conflictId, storage, new Date(), memberPlanIds)) {
      onConflictResolved?.();
      onBack();
    } else {
      setRevision((n) => n + 1);
    }
  };

  const handleRemove = async (member) => {
    if (busy || !member?.planId || !member?.performanceKey) return;
    if (mockupMode) {
      setStatusMessage('Removed from Planner (fixture preview).');
      window.setTimeout(() => finishIfResolved(), 150);
      return;
    }
    setBusy(true);
    const result = removePerformanceFromAcceptedPlan(
      storage,
      member.planId,
      member.performanceKey,
    );
    if (result.ok && result.changed) {
      onAcceptedPlansChange?.();
      setRevision((n) => n + 1);
      finishIfResolved();
    } else {
      setStatusMessage('Could not remove this screening from Planner.');
    }
    setBusy(false);
  };

  const handleSelectAlternate = async (member, alternate) => {
    if (busy || !member?.planId || !member?.performanceKey || !alternate) return;
    if (mockupMode) {
      setStatusMessage('Showtime updated (fixture preview).');
      window.setTimeout(() => finishIfResolved(), 150);
      return;
    }
    setBusy(true);
    const input = alternateToAcceptedPerformanceInput(alternate, member);
    const result = replaceAcceptedPlanPerformance(
      storage,
      member.planId,
      member.performanceKey,
      input,
    );
    if (result.ok && result.changed) {
      onAcceptedPlansChange?.();
      setRevision((n) => n + 1);
      finishIfResolved();
    } else {
      setStatusMessage('Could not move this screening to the selected showtime.');
    }
    setBusy(false);
  };

  if (!resolved.ok || !resolved.presentation) {
    return (
      <section
        className="v2-pcr"
        data-planner-conflict-review="unavailable"
        aria-labelledby={titleId}
      >
        <header className="v2-pcr-header">
          <button
            type="button"
            className="v2-pcr-back"
            onClick={onBack}
          >
            <IconChevronLeft width={16} height={16} aria-hidden="true" />
            <span>Back</span>
          </button>
        </header>
        <h1 id={titleId} className="v2-pcr-title">
          Conflict unavailable
        </h1>
        <p className="v2-pcr-subtitle">
          This conflict may have already been resolved.
        </p>
      </section>
    );
  }

  const presentation = resolved.presentation;

  return (
    <section
      className="v2-pcr"
      data-planner-conflict-review="open"
      data-conflict-id={presentation.conflictId}
      aria-labelledby={titleId}
    >
      <header className="v2-pcr-header">
        <button
          type="button"
          className="v2-pcr-back"
          onClick={onBack}
        >
          <IconChevronLeft width={16} height={16} aria-hidden="true" />
          <span>Back</span>
        </button>
        {presentation.dateLabel ? (
          <p className="v2-pcr-date">{presentation.dateLabel}</p>
        ) : null}
      </header>

      <div className="v2-pcr-intro">
        <h1 id={titleId} className="v2-pcr-title">
          {presentation.title}
        </h1>
        {presentation.subtitle ? (
          <p className="v2-pcr-subtitle">{presentation.subtitle}</p>
        ) : null}
      </div>

      <div className="v2-pcr-films">
        {presentation.members.map((member) => (
          <article
            key={`${member.planId}::${member.performanceKey}`}
            className="v2-pcr-film-card"
            data-plan-id={member.planId}
            data-performance-key={member.performanceKey}
          >
            <div className="v2-pcr-film-head">
              <PosterThumb url={member.posterUrl} title={member.title} />
              <div className="v2-pcr-film-copy">
                <h2 className="v2-pcr-film-title">{member.title}</h2>
                <p className="v2-pcr-film-screening">
                  {member.currentScreeningLabel}
                </p>
              </div>
            </div>

            {member.hasAlternatives ? (
              <div className="v2-pcr-alternates">
                <h3 className="v2-pcr-alternates-title">Other ways to see it</h3>
                <ul className="v2-pcr-alternates-list">
                  {(member.visibleAlternates ?? []).map((alt) => (
                    <li key={alt.opportunityKey ?? alt.rowLabel}>
                      <button
                        type="button"
                        className="v2-pcr-alternate-row"
                        disabled={busy}
                        onClick={() => handleSelectAlternate(member, alt)}
                      >
                        <IconCalendar
                          width={16}
                          height={16}
                          className="v2-pcr-alternate-icon"
                          aria-hidden="true"
                        />
                        <span className="v2-pcr-alternate-label">{alt.rowLabel}</span>
                        <IconChevron
                          width={14}
                          height={14}
                          className="v2-pcr-alternate-chevron"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
                {member.moreAlternateCount > 0 ? (
                  <p className="v2-pcr-alternates-more">
                    + {member.moreAlternateCount} more showtimes
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="v2-pcr-no-alternates" role="status">
                <IconInfo width={16} height={16} aria-hidden="true" />
                <span>No other showtimes currently scheduled</span>
              </div>
            )}

            <button
              type="button"
              className="v2-pcr-remove"
              disabled={busy}
              onClick={() => handleRemove(member)}
            >
              <IconTrash width={14} height={14} aria-hidden="true" />
              <span>Remove from Planner</span>
            </button>
          </article>
        ))}
      </div>

      {presentation.bestPath?.text ? (
        <aside className="v2-pcr-best-path" aria-labelledby="v2-pcr-best-path-h">
          <span className="v2-pcr-best-path-icon" aria-hidden="true">
            <IconLightbulb width={18} height={18} />
          </span>
          <div className="v2-pcr-best-path-copy">
            <h2 id="v2-pcr-best-path-h" className="v2-pcr-best-path-title">
              Best path
            </h2>
            <p className="v2-pcr-best-path-text">{presentation.bestPath.text}</p>
          </div>
        </aside>
      ) : null}

      <p id={statusId} className="v2-pcr-status" role="status" aria-live="polite">
        {statusMessage ?? ''}
      </p>
    </section>
  );
}
