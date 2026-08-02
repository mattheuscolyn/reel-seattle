/**
 * Adjust Time Window — global Start after / End before for Results.
 */

import { useEffect, useId, useState } from 'react';
import { IconChevron } from '../icons.jsx';
import PlanAdjustmentDialog from './PlanAdjustmentDialog.jsx';
import {
  addMinutesToClock,
  isValidTimeWindow,
} from './planTimeWindow.js';

const QUICK_DELTAS = Object.freeze([
  Object.freeze({ id: '15', label: '+15 min', minutes: 15 }),
  Object.freeze({ id: '30', label: '+30 min', minutes: 30 }),
  Object.freeze({ id: '60', label: '+1 hr', minutes: 60 }),
]);

/**
 * @param {{
 *   startAfter: string,
 *   endBefore: string,
 *   onCancel: () => void,
 *   onApply: (next: { startAfter: string, endBefore: string }) => void,
 * }} props
 */
export default function AdjustTimeWindowOverlay({
  startAfter,
  endBefore,
  onCancel,
  onApply,
}) {
  const startId = useId();
  const endId = useId();
  const [draftStart, setDraftStart] = useState(startAfter);
  const [draftEnd, setDraftEnd] = useState(endBefore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraftStart(startAfter);
    setDraftEnd(endBefore);
    setError(null);
    setBusy(false);
  }, [startAfter, endBefore]);

  const valid = isValidTimeWindow(draftStart, draftEnd);

  const handleApply = () => {
    if (busy) return;
    if (!valid) {
      setError('End before must be later than Start after.');
      return;
    }
    setBusy(true);
    onApply({ startAfter: draftStart, endBefore: draftEnd });
  };

  return (
    <PlanAdjustmentDialog
      data-adjustment="time"
      title="Adjust time window"
      support="Update when your movie day can begin or end."
      onCancel={onCancel}
      footer={
        <>
          <button
            type="button"
            className="v2-bpr-adj-btn v2-bpr-adj-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="v2-bpr-adj-btn v2-bpr-adj-btn-apply"
            disabled={busy || !valid}
            onClick={handleApply}
          >
            Apply
          </button>
        </>
      }
    >
      <section className="v2-bpr-adj-group" aria-labelledby={startId}>
        <div className="v2-bpr-adj-group-row">
          <label className="v2-bpr-adj-label" htmlFor={startId}>
            Start after
          </label>
          <div className="v2-bpr-adj-time-value">
            <input
              id={startId}
              className="v2-bpr-adj-input v2-bpr-adj-input-compact"
              value={draftStart}
              onChange={(e) => {
                setDraftStart(e.target.value);
                setError(null);
              }}
              aria-describedby={error ? `${startId}-err` : undefined}
            />
            <IconChevron width={12} height={12} aria-hidden="true" />
          </div>
        </div>
        <div
          className="v2-bpr-adj-quick"
          role="group"
          aria-label="Quick add to start"
        >
          {QUICK_DELTAS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="v2-bpr-adj-chip"
              onClick={() => {
                setDraftStart(addMinutesToClock(draftStart, item.minutes));
                setError(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v2-bpr-adj-group" aria-labelledby={endId}>
        <div className="v2-bpr-adj-group-row">
          <label className="v2-bpr-adj-label" htmlFor={endId}>
            End before
          </label>
          <div className="v2-bpr-adj-time-value">
            <input
              id={endId}
              className="v2-bpr-adj-input v2-bpr-adj-input-compact"
              value={draftEnd}
              onChange={(e) => {
                setDraftEnd(e.target.value);
                setError(null);
              }}
            />
            <IconChevron width={12} height={12} aria-hidden="true" />
          </div>
        </div>
      </section>

      {error ? (
        <p id={`${startId}-err`} className="v2-bpr-adj-error" role="alert">
          {error}
        </p>
      ) : null}
    </PlanAdjustmentDialog>
  );
}
