/**
 * Modify-plan scaffold for accepted My Schedule plans (T-SCH-01).
 *
 * Reads the real accepted plan. No reschedule/edit. Optional remove.
 * Film rows open Film Detail; View plan details reopens Plan Details.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { IconChevron, IconClose } from '../icons.jsx';
import {
  formatDisplayClock,
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
 *   plan: object | null,
 *   open: boolean,
 *   onClose: () => void,
 *   onRemove?: (planId: string) => void,
 *   onOpenFilmDetail?: (perf: object) => void,
 *   onViewPlanDetails?: (plan: object) => void,
 * }} props
 */
export default function ScheduleModifyPlanSheet({
  plan,
  open,
  onClose,
  onRemove,
  onOpenFilmDetail,
  onViewPlanDetails,
}) {
  const titleId = useId();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  const timeFormatId = getScheduleSettings(getBrowserStorage()).timeFormatId;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !plan) return null;

  const films = Array.isArray(plan.performances) ? plan.performances : [];

  return (
    <div
      className="v2-ss-backdrop"
      role="presentation"
      data-schedule-modify-source="accepted-plans"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="v2-ss-sheet v2-msw-modify-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />
        <header className="v2-ss-header">
          <h1 id={titleId} className="v2-ss-title">
            Modify plan?
          </h1>
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close"
            aria-label="Close modify plan"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <div className="v2-ss-body">
          <p className="v2-msw-modify-support">
            Editing showtimes isn’t available yet. You can open a film, view
            plan details, or remove this plan from My Schedule.
          </p>
          <ul className="v2-msw-modify-list">
            {films.map((perf) => {
              const canOpen = Boolean(
                perf.filmKey || perf.filmId || perf.showtimeFilmKey,
              );
              return (
                <li key={perf.performanceKey} className="v2-msw-modify-row">
                  <button
                    type="button"
                    className="v2-msw-modify-film"
                    aria-label={`Open Film Detail for ${perf.title}`}
                    disabled={!canOpen || typeof onOpenFilmDetail !== 'function'}
                    onClick={() => onOpenFilmDetail?.(perf)}
                  >
                    <span className="v2-msw-modify-title">{perf.title}</span>
                    <span className="v2-msw-modify-meta">
                      {[
                        perf.theaterName,
                        formatDisplayClock(perf.localTime, timeFormatId) ||
                          perf.localTime,
                        perf.format,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <IconChevron
                      className="v2-msw-modify-chevron"
                      width={14}
                      height={14}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="v2-msw-modify-details"
            onClick={() => onViewPlanDetails?.(plan)}
            disabled={typeof onViewPlanDetails !== 'function'}
          >
            View plan details
          </button>
          <button
            type="button"
            className="v2-msw-modify-remove"
            onClick={() => onRemove?.(plan.planId)}
          >
            Remove from My Schedule
          </button>
          <button
            type="button"
            className="v2-msw-modify-cancel"
            onClick={onClose}
          >
            Keep plan
          </button>
        </div>
      </div>
    </div>
  );
}
