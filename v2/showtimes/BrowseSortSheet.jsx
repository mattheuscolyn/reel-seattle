/**
 * Browse All Showtimes — Sort bottom sheet (apply immediately).
 */

import { useEffect, useId, useRef } from 'react';
import { IconCheck, IconClose } from '../icons.jsx';
import { BROWSE_SORT_OPTIONS } from './browseDateSortUtils.js';

/**
 * @param {object} props
 */
export default function BrowseSortSheet({
  open,
  sortMode = 'earliest',
  onClose,
  onSelect,
}) {
  const titleId = useId();
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

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

  return (
    <div
      className="v2-bfs-backdrop"
      role="presentation"
      data-browse-sort-sheet="open"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="v2-bss-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-bfs-header">
          <div className="v2-bfs-header-copy">
            <h2 id={titleId} className="v2-bfs-title">
              Sort showtimes
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close v2-bfs-close"
            aria-label="Close sort"
            onClick={() => onClose?.()}
          >
            <IconClose />
          </button>
        </header>

        <ul className="v2-bss-list" role="listbox" aria-labelledby={titleId}>
          {BROWSE_SORT_OPTIONS.map((option) => {
            const selected = sortMode === option.id;
            return (
              <li key={option.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={
                    selected ? 'v2-bss-option is-selected' : 'v2-bss-option'
                  }
                  onClick={() => onSelect?.(option.id)}
                >
                  <span>{option.label}</span>
                  {selected ? (
                    <span className="v2-bss-check" aria-hidden="true">
                      <IconCheck width={14} height={14} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
