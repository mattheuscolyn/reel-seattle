/**
 * Modify-plan scaffold for accepted My Schedule plans (T-SCH-01).
 *
 * Reads the real accepted plan. No reschedule/edit. Optional remove.
 */

import { useEffect, useId, useRef } from 'react';
import { IconClose } from '../icons.jsx';

/**
 * @param {{
 *   plan: object | null,
 *   open: boolean,
 *   onClose: () => void,
 *   onRemove?: (planId: string) => void,
 * }} props
 */
export default function ScheduleModifyPlanSheet({
  plan,
  open,
  onClose,
  onRemove,
}) {
  const titleId = useId();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

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
            Editing showtimes isn’t available yet. You can review this accepted
            plan or remove it from My Schedule.
          </p>
          <ul className="v2-msw-modify-list">
            {films.map((perf) => (
              <li key={perf.performanceKey} className="v2-msw-modify-row">
                <span className="v2-msw-modify-title">{perf.title}</span>
                <span className="v2-msw-modify-meta">
                  {[perf.theaterName, perf.localTime, perf.format]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
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
