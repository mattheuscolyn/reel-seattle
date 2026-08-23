/**
 * Adjust Time Window — Start after / Finish before for Results.
 * Supports No limit (null) and overnight finish (+1 day).
 */

import { useEffect, useId, useState } from 'react';
import PlanAdjustmentDialog from './PlanAdjustmentDialog.jsx';
import {
  addMinutesToClock,
  isValidTimeWindow,
} from './planTimeWindow.js';
import {
  buildPlanClockToHtmlTime,
  htmlTimeToBuildPlanFinish,
  htmlTimeToBuildPlanStart,
  normalizeBuildPlanClock,
  resolveFinishBeforeNextDayFlag,
} from './buildPlanTimeWindow.js';

const QUICK_DELTAS = Object.freeze([
  Object.freeze({ id: '15', label: '+15 min', minutes: 15 }),
  Object.freeze({ id: '30', label: '+30 min', minutes: 30 }),
  Object.freeze({ id: '60', label: '+1 hr', minutes: 60 }),
]);

/**
 * @param {{
 *   startAfter: string | null | undefined,
 *   endBefore: string | null | undefined,
 *   finishBeforeNextDay?: boolean,
 *   onCancel: () => void,
 *   onApply: (next: {
 *     startAfter: string | null,
 *     endBefore: string | null,
 *     finishBeforeNextDay: boolean,
 *   }) => void,
 * }} props
 */
export default function AdjustTimeWindowOverlay({
  startAfter,
  endBefore,
  finishBeforeNextDay,
  onCancel,
  onApply,
}) {
  const startId = useId();
  const endId = useId();
  const [draftStart, setDraftStart] = useState(
    () => normalizeBuildPlanClock(startAfter),
  );
  const [draftEnd, setDraftEnd] = useState(
    () => normalizeBuildPlanClock(endBefore),
  );
  const [draftNextDay, setDraftNextDay] = useState(() =>
    resolveFinishBeforeNextDayFlag(endBefore, finishBeforeNextDay),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraftStart(normalizeBuildPlanClock(startAfter));
    setDraftEnd(normalizeBuildPlanClock(endBefore));
    setDraftNextDay(
      resolveFinishBeforeNextDayFlag(endBefore, finishBeforeNextDay),
    );
    setError(null);
    setBusy(false);
  }, [startAfter, endBefore, finishBeforeNextDay]);

  const valid = isValidTimeWindow(draftStart, draftEnd, {
    finishBeforeNextDay: draftEnd ? draftNextDay : false,
  });

  const handleApply = () => {
    if (busy) return;
    if (!valid) {
      setError('Finish before must be later than Start after.');
      return;
    }
    setBusy(true);
    onApply({
      startAfter: draftStart,
      endBefore: draftEnd,
      finishBeforeNextDay: draftEnd ? draftNextDay : false,
    });
  };

  const startHtml = buildPlanClockToHtmlTime(draftStart) || '';
  const endHtml = buildPlanClockToHtmlTime(draftEnd) || '';

  return (
    <PlanAdjustmentDialog
      data-adjustment="time"
      title="Adjust time window"
      support="Update when your movie day can begin or end. Leave either side unlimited for Any time."
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
          <span className="v2-bpr-adj-label" id={startId}>
            Start after
          </span>
          <div
            className="v2-bp-time-bound-modes v2-bpr-adj-limit-modes"
            role="radiogroup"
            aria-label="Start after limit"
          >
            <button
              type="button"
              role="radio"
              aria-checked={draftStart == null}
              className={`v2-bp-time-bound-mode${
                draftStart == null ? ' is-selected' : ''
              }`}
              onClick={() => {
                setDraftStart(null);
                setError(null);
              }}
            >
              No limit
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draftStart != null}
              className={`v2-bp-time-bound-mode${
                draftStart != null ? ' is-selected' : ''
              }`}
              onClick={() => {
                if (draftStart == null) {
                  setDraftStart(htmlTimeToBuildPlanStart('12:00'));
                }
                setError(null);
              }}
            >
              Custom
            </button>
          </div>
        </div>
        {draftStart != null ? (
          <>
            <label className="v2-bp-time-input-row v2-bpr-adj-time-input">
              <span className="v2-visually-hidden">Start after time</span>
              <input
                type="time"
                className="v2-bp-time-input"
                value={startHtml || '12:00'}
                aria-label="Start after time"
                onChange={(e) => {
                  const clock = htmlTimeToBuildPlanStart(e.target.value);
                  if (clock) setDraftStart(clock);
                  setError(null);
                }}
              />
              <span className="v2-bp-time-input-value" aria-hidden="true">
                {draftStart}
              </span>
            </label>
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
          </>
        ) : null}
      </section>

      <section className="v2-bpr-adj-group" aria-labelledby={endId}>
        <div className="v2-bpr-adj-group-row">
          <span className="v2-bpr-adj-label" id={endId}>
            Finish before
          </span>
          <div
            className="v2-bp-time-bound-modes v2-bpr-adj-limit-modes"
            role="radiogroup"
            aria-label="Finish before limit"
          >
            <button
              type="button"
              role="radio"
              aria-checked={draftEnd == null}
              className={`v2-bp-time-bound-mode${
                draftEnd == null ? ' is-selected' : ''
              }`}
              onClick={() => {
                setDraftEnd(null);
                setDraftNextDay(false);
                setError(null);
              }}
            >
              No limit
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draftEnd != null}
              className={`v2-bp-time-bound-mode${
                draftEnd != null ? ' is-selected' : ''
              }`}
              onClick={() => {
                if (draftEnd == null) {
                  const next = htmlTimeToBuildPlanFinish('23:00');
                  setDraftEnd(next.clock);
                  setDraftNextDay(next.finishBeforeNextDay);
                }
                setError(null);
              }}
            >
              Custom
            </button>
          </div>
        </div>
        {draftEnd != null ? (
          <div className="v2-bp-time-finish-row">
            <label className="v2-bp-time-input-row v2-bpr-adj-time-input">
              <span className="v2-visually-hidden">Finish before time</span>
              <input
                type="time"
                className="v2-bp-time-input"
                value={endHtml || '23:00'}
                aria-label="Finish before time"
                onChange={(e) => {
                  const next = htmlTimeToBuildPlanFinish(e.target.value);
                  if (next.clock) {
                    setDraftEnd(next.clock);
                    setDraftNextDay(next.finishBeforeNextDay);
                  }
                  setError(null);
                }}
              />
              <span className="v2-bp-time-input-value" aria-hidden="true">
                {draftEnd}
              </span>
            </label>
            {draftNextDay ? (
              <span className="v2-bp-time-nextday" title="Next calendar day">
                +1 day
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <p id={`${startId}-err`} className="v2-bpr-adj-error" role="alert">
          {error}
        </p>
      ) : null}
    </PlanAdjustmentDialog>
  );
}
