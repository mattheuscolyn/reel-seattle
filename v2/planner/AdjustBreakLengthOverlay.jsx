/**
 * Adjust Break Length — global min/max break constraints for Results.
 */

import { useEffect, useId, useState } from 'react';
import { IconClock, IconInfo } from '../icons.jsx';
import PlanAdjustmentDialog from './PlanAdjustmentDialog.jsx';
import {
  BREAK_STEP_MINUTES,
  MAX_BREAK_PRESETS,
  MIN_BREAK_PRESETS,
  formatBreakMinutes,
  isValidBreakRange,
  stepBreakMinutes,
} from './planBreakRange.js';

/**
 * @param {{
 *   minBreakMinutes: number,
 *   maxBreakMinutes: number | null,
 *   onCancel: () => void,
 *   onApply: (next: {
 *     minBreakMinutes: number,
 *     maxBreakMinutes: number | null,
 *   }) => void,
 * }} props
 */
export default function AdjustBreakLengthOverlay({
  minBreakMinutes,
  maxBreakMinutes,
  onCancel,
  onApply,
}) {
  const minId = useId();
  const maxId = useId();
  const [draftMin, setDraftMin] = useState(minBreakMinutes);
  const [draftMax, setDraftMax] = useState(maxBreakMinutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraftMin(minBreakMinutes);
    setDraftMax(maxBreakMinutes);
    setBusy(false);
    setError(null);
  }, [minBreakMinutes, maxBreakMinutes]);

  const valid = isValidBreakRange(draftMin, draftMax);

  const handleApply = () => {
    if (busy) return;
    if (!valid) {
      setError('Minimum break cannot exceed maximum break.');
      return;
    }
    setBusy(true);
    onApply({ minBreakMinutes: draftMin, maxBreakMinutes: draftMax });
  };

  return (
    <PlanAdjustmentDialog
      data-adjustment="break"
      title="Adjust break length"
      support="Set the range of time you’re comfortable having between movies."
      icon={<IconClock width={22} height={22} />}
      footerClassName="is-break-footer"
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
            Apply and refresh plans
          </button>
        </>
      }
    >
      <section className="v2-bpr-adj-group" aria-labelledby={minId}>
        <h3 id={minId} className="v2-bpr-adj-break-title">
          Minimum break
        </h3>
        <p className="v2-bpr-adj-break-support">
          Shortest acceptable time between movies
        </p>
        <div
          className="v2-bpr-adj-stepper"
          role="group"
          aria-label="Minimum break"
        >
          <button
            type="button"
            className="v2-bpr-adj-step"
            aria-label="Decrease minimum break"
            onClick={() => {
              setDraftMin((m) =>
                stepBreakMinutes(m, -BREAK_STEP_MINUTES, {
                  min: 0,
                  max: draftMax,
                }),
              );
              setError(null);
            }}
          >
            −
          </button>
          <span className="v2-bpr-adj-step-value" aria-live="polite">
            {formatBreakMinutes(draftMin)}
          </span>
          <button
            type="button"
            className="v2-bpr-adj-step"
            aria-label="Increase minimum break"
            onClick={() => {
              setDraftMin((m) =>
                stepBreakMinutes(m, BREAK_STEP_MINUTES, {
                  min: 0,
                  max: draftMax ?? 12 * 60,
                }),
              );
              setError(null);
            }}
          >
            +
          </button>
        </div>
        <div
          className="v2-bpr-adj-quick v2-bpr-adj-quick-grid"
          role="group"
          aria-label="Minimum presets"
        >
          {MIN_BREAK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`v2-bpr-adj-chip${
                draftMin === preset.minutes ? ' is-selected' : ''
              }`}
              aria-pressed={draftMin === preset.minutes}
              onClick={() => {
                setDraftMin(preset.minutes);
                setError(null);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v2-bpr-adj-group" aria-labelledby={maxId}>
        <h3 id={maxId} className="v2-bpr-adj-break-title">
          Maximum break
        </h3>
        <p className="v2-bpr-adj-break-support">
          Longest acceptable time between movies
        </p>
        <div
          className="v2-bpr-adj-stepper"
          role="group"
          aria-label="Maximum break"
        >
          <button
            type="button"
            className="v2-bpr-adj-step"
            aria-label="Decrease maximum break"
            disabled={draftMax == null}
            onClick={() => {
              if (draftMax == null) return;
              setDraftMax((m) =>
                stepBreakMinutes(m, -BREAK_STEP_MINUTES, {
                  min: draftMin,
                  max: 12 * 60,
                }),
              );
              setError(null);
            }}
          >
            −
          </button>
          <span className="v2-bpr-adj-step-value" aria-live="polite">
            {formatBreakMinutes(draftMax)}
          </span>
          <button
            type="button"
            className="v2-bpr-adj-step"
            aria-label="Increase maximum break"
            disabled={draftMax == null}
            onClick={() => {
              if (draftMax == null) return;
              setDraftMax((m) =>
                stepBreakMinutes(m, BREAK_STEP_MINUTES, {
                  min: draftMin,
                  max: 12 * 60,
                }),
              );
              setError(null);
            }}
          >
            +
          </button>
        </div>
        <div
          className="v2-bpr-adj-quick v2-bpr-adj-quick-grid"
          role="group"
          aria-label="Maximum presets"
        >
          {MAX_BREAK_PRESETS.map((preset) => {
            const selected =
              preset.minutes == null
                ? draftMax == null
                : draftMax === preset.minutes;
            return (
              <button
                key={preset.id}
                type="button"
                className={`v2-bpr-adj-chip${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  setDraftMax(preset.minutes);
                  setError(null);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      <p className="v2-bpr-adj-note">
        <span aria-hidden="true">
          <IconInfo width={14} height={14} />
        </span>
        <span>
          Breaks include travel time between theaters. These settings will be
          used for all gaps in your plans.
        </span>
      </p>

      {error ? (
        <p className="v2-bpr-adj-error" role="alert">
          {error}
        </p>
      ) : null}
    </PlanAdjustmentDialog>
  );
}
