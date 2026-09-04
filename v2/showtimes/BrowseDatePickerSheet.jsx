/**
 * Browse All Showtimes — Dates bottom sheet (draft / apply).
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconClose } from '../icons.jsx';
import { getBrowseOpportunityDateHorizon } from './showtimeEligibility.js';
import {
  createBrowseDateDraftFromApplied,
  dateSelectionFromBrowseDateDraft,
  formatBrowseHorizonLabel,
  resetBrowseDateDraftToToday,
  validateBrowseDateDraft,
} from './browseDateSortUtils.js';
import { normalizeBrowseFilters } from './browseFilterState.js';

/**
 * @param {object} props
 */
export default function BrowseDatePickerSheet({
  open,
  appliedFilters,
  homeData = null,
  now = null,
  onClose,
  onApply,
}) {
  const titleId = useId();
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const horizon = useMemo(
    () => getBrowseOpportunityDateHorizon(homeData),
    [homeData],
  );

  const [draft, setDraft] = useState(() =>
    createBrowseDateDraftFromApplied(
      normalizeBrowseFilters(appliedFilters, now ?? undefined),
      horizon,
      now ?? undefined,
    ),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(
      createBrowseDateDraftFromApplied(
        normalizeBrowseFilters(appliedFilters, now ?? undefined),
        horizon,
        now ?? undefined,
      ),
    );
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, appliedFilters, horizon, now]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const validation = validateBrowseDateDraft(draft, horizon);

  if (!open) return null;

  const min = horizon.minDate ?? undefined;
  const max = horizon.maxDate ?? undefined;

  const handleApply = () => {
    if (!validation.ok) return;
    onApply?.(
      dateSelectionFromBrowseDateDraft({
        pickerMode: draft.pickerMode,
        startDate: validation.startDate,
        endDate: validation.endDate,
      }),
    );
  };

  return (
    <div
      className="v2-bfs-backdrop"
      role="presentation"
      data-browse-date-sheet="open"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="v2-bds-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-bfs-header">
          <div className="v2-bfs-header-copy">
            <h2 id={titleId} className="v2-bfs-title">
              Dates
            </h2>
            <p className="v2-bfs-subtitle">{formatBrowseHorizonLabel(horizon)}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close v2-bfs-close"
            aria-label="Close dates"
            onClick={() => onClose?.()}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-bds-body">
          <div
            className="v2-bfs-segments"
            role="group"
            aria-label="Date selection mode"
          >
            <button
              type="button"
              className={
                draft.pickerMode === 'single'
                  ? 'v2-bfs-segment is-selected'
                  : 'v2-bfs-segment'
              }
              aria-pressed={draft.pickerMode === 'single'}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  pickerMode: 'single',
                  endDate: current.startDate,
                }))
              }
            >
              Single date
            </button>
            <button
              type="button"
              className={
                draft.pickerMode === 'range'
                  ? 'v2-bfs-segment is-selected'
                  : 'v2-bfs-segment'
              }
              aria-pressed={draft.pickerMode === 'range'}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  pickerMode: 'range',
                  endDate: current.endDate || current.startDate,
                }))
              }
            >
              Date range
            </button>
          </div>

          {draft.pickerMode === 'single' ? (
            <label className="v2-bds-field">
              <span>Date</span>
              <input
                type="date"
                value={draft.startDate ?? ''}
                min={min}
                max={max}
                onChange={(event) => {
                  const value = event.target.value || null;
                  setDraft((current) => ({
                    ...current,
                    startDate: value,
                    endDate: value,
                  }));
                }}
              />
            </label>
          ) : (
            <div className="v2-bds-fields">
              <label className="v2-bds-field">
                <span>Start</span>
                <input
                  type="date"
                  value={draft.startDate ?? ''}
                  min={min}
                  max={max}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setDraft((current) => ({
                      ...current,
                      startDate: value,
                    }));
                  }}
                />
              </label>
              <label className="v2-bds-field">
                <span>End</span>
                <input
                  type="date"
                  value={draft.endDate ?? ''}
                  min={min}
                  max={max}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setDraft((current) => ({
                      ...current,
                      endDate: value,
                    }));
                  }}
                />
              </label>
            </div>
          )}

          {validation.error ? (
            <p className="v2-bds-error" role="alert">
              {validation.error}
            </p>
          ) : null}
        </div>

        <footer className="v2-bfs-footer">
          <button
            type="button"
            className="v2-bfs-reset"
            onClick={() =>
              setDraft(resetBrowseDateDraftToToday(horizon, now ?? undefined))
            }
          >
            Reset
          </button>
          <button
            type="button"
            className="v2-bfs-apply"
            disabled={!validation.ok}
            onClick={handleApply}
          >
            Show results
          </button>
        </footer>
      </div>
    </div>
  );
}
