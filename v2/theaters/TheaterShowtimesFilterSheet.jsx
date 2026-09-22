/**
 * Theater Detail showtimes filter sheet — format + time of day only.
 * Reuses Browse sheet chrome; no theater picker.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { IconClose } from '../icons.jsx';
import { SHOWTIMES_BROWSE_TIME_RANGES } from '../showtimes/showtimesBrowseModel.js';

/**
 * @param {{
 *   open: boolean,
 *   formatOptions?: { key: string, label: string }[],
 *   appliedFormatKeys?: string[],
 *   appliedTimeRangeId?: string,
 *   onClose?: () => void,
 *   onApply?: (next: { formatKeys: string[], timeRangeId: string }) => void,
 * }} props
 */
export default function TheaterShowtimesFilterSheet({
  open,
  formatOptions = [],
  appliedFormatKeys = [],
  appliedTimeRangeId = 'any',
  onClose,
  onApply,
}) {
  const titleId = useId();
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const [formatKeys, setFormatKeys] = useState(appliedFormatKeys);
  const [timeRangeId, setTimeRangeId] = useState(appliedTimeRangeId);

  useEffect(() => {
    if (!open) return;
    setFormatKeys(appliedFormatKeys);
    setTimeRangeId(appliedTimeRangeId || 'any');
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, appliedFormatKeys, appliedTimeRangeId]);

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

  if (!open) return null;

  const toggleFormat = (key) => {
    setFormatKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  return (
    <div className="v2-bfs-backdrop" role="presentation" onClick={onClose}>
      <div
        className="v2-bfs-sheet v2-td-filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="v2-bfs-header">
          <div className="v2-bfs-header-copy">
            <h2 id={titleId} className="v2-bfs-title">
              Filters
            </h2>
            <p className="v2-bfs-subtitle">Formats and time of day</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-bfs-close"
            aria-label="Close filters"
            onClick={onClose}
          >
            <IconClose aria-hidden="true" />
          </button>
        </div>
        <div className="v2-bfs-body">
          <fieldset className="v2-td-filter-fieldset">
            <legend>Time of day</legend>
            <div className="v2-td-filter-chips" role="group" aria-label="Time of day">
              {SHOWTIMES_BROWSE_TIME_RANGES.map((range) => (
                <button
                  key={range.id}
                  type="button"
                  className={
                    timeRangeId === range.id
                      ? 'v2-td-filter-chip is-active'
                      : 'v2-td-filter-chip'
                  }
                  aria-pressed={timeRangeId === range.id}
                  onClick={() => setTimeRangeId(range.id)}
                >
                  {range.id === 'any' ? 'Any' : range.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="v2-td-filter-fieldset">
            <legend>Formats</legend>
            {formatOptions.length === 0 ? (
              <p className="v2-td-filter-empty">No format options this week.</p>
            ) : (
              <div className="v2-td-filter-chips" role="group" aria-label="Formats">
                {formatOptions.map((option) => {
                  const selected = formatKeys.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={
                        selected ? 'v2-td-filter-chip is-active' : 'v2-td-filter-chip'
                      }
                      aria-pressed={selected}
                      onClick={() => toggleFormat(option.key)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        </div>
        <div className="v2-bfs-footer">
          <button
            type="button"
            className="v2-bfs-reset"
            onClick={() => {
              setFormatKeys([]);
              setTimeRangeId('any');
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="v2-bfs-apply"
            onClick={() =>
              onApply?.({
                formatKeys,
                timeRangeId,
              })
            }
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
