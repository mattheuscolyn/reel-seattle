/**
 * Stage 1 Results film-click interaction sheet.
 *
 * Local preference state only. No itinerary recomputation, global NI store,
 * or production Film Detail navigation.
 */

import { useEffect, useId, useRef } from 'react';
import {
  IconBan,
  IconChevron,
  IconClose,
  IconHeart,
  IconInfo,
  IconLink,
  IconSliders,
  IconStar,
  IconStarFill,
  IconTarget,
} from '../icons.jsx';

const PREF_ICONS = {
  star: IconStar,
  heart: IconHeart,
  target: IconTarget,
  ban: IconBan,
};

/**
 * @param {{
 *   film: object,
 *   preference: string,
 *   sheetCopy: object,
 *   onPreferenceChange: (prefId: string) => void,
 *   onClose: () => void,
 *   onStubAction?: (actionId: string, label: string, message?: string) => void,
 * }} props
 */
export default function PlanFilmInteractionSheet({
  film,
  preference,
  sheetCopy,
  onPreferenceChange,
  onClose,
  onStubAction,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const timeWindow = `${film.startTime} – ${film.endTime ?? film.startTime}`;

  return (
    <div
      className="v2-bpr-sheet-backdrop"
      role="presentation"
      data-bpr-sheet="open"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="v2-bpr-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-bpr-sheet-handle" aria-hidden="true" />

        <div className="v2-bpr-sheet-film">
          <img
            className="v2-bpr-sheet-poster"
            src={film.imageUrl}
            alt=""
          />
          <div className="v2-bpr-sheet-film-copy">
            <h2 id={titleId} className="v2-bpr-sheet-title">
              {film.title}
              {film.formatBadge ? (
                <span className="v2-bpr-badge">{film.formatBadge}</span>
              ) : null}
            </h2>
            <p className="v2-bpr-sheet-meta">
              {film.theater} • {film.runtimeLabel}
            </p>
            <button
              type="button"
              className="v2-bpr-sheet-time"
              aria-label={`Showtime ${timeWindow}`}
              onClick={() =>
                onStubAction?.(
                  'time-adjust',
                  'Showtime',
                  sheetCopy.timeAdjustDeferredMessage,
                )
              }
            >
              {timeWindow}
            </button>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-bpr-sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>

        <p className="v2-bpr-sheet-section">{sheetCopy.sectionTitle}</p>

        <div
          className="v2-bpr-sheet-prefs"
          role="radiogroup"
          aria-label={sheetCopy.sectionTitle}
        >
          {sheetCopy.preferences.map((opt) => {
            const Icon = PREF_ICONS[opt.icon] ?? IconStar;
            const selected = preference === opt.id;
            const SelectedIcon =
              opt.id === 'must' && selected ? IconStarFill : Icon;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`v2-bpr-sheet-pref${selected ? ' is-selected' : ''}`}
                onClick={() => onPreferenceChange(opt.id)}
              >
                <span className="v2-bpr-sheet-pref-icon" aria-hidden="true">
                  <SelectedIcon width={16} height={16} />
                </span>
                <span className="v2-bpr-sheet-pref-copy">
                  <span className="v2-bpr-sheet-pref-label">{opt.label}</span>
                  <span className="v2-bpr-sheet-pref-support">{opt.support}</span>
                </span>
                <span
                  className={`v2-bpr-sheet-pref-check${selected ? ' is-on' : ''}`}
                  aria-hidden="true"
                >
                  {selected ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>

        <div className="v2-bpr-sheet-actions">
          <button
            type="button"
            className="v2-bpr-sheet-action"
            onClick={() =>
              onStubAction?.(
                'replace-film',
                sheetCopy.replaceLabel,
                sheetCopy.replaceDeferredMessage,
              )
            }
          >
            <span className="v2-bpr-sheet-pref-icon" aria-hidden="true">
              <IconSliders width={16} height={16} />
            </span>
            <span className="v2-bpr-sheet-pref-copy">
              <span className="v2-bpr-sheet-pref-label">
                {sheetCopy.replaceLabel}
              </span>
              <span className="v2-bpr-sheet-pref-support">
                {sheetCopy.replaceSupport}
              </span>
            </span>
            <IconChevron aria-hidden="true" />
          </button>
          <button
            type="button"
            className="v2-bpr-sheet-action"
            onClick={() =>
              onStubAction?.(
                'film-details',
                sheetCopy.filmDetailsLabel,
                sheetCopy.filmDetailsDeferredMessage,
              )
            }
          >
            <span className="v2-bpr-sheet-pref-icon" aria-hidden="true">
              <IconInfo width={16} height={16} />
            </span>
            <span className="v2-bpr-sheet-pref-copy">
              <span className="v2-bpr-sheet-pref-label">
                {sheetCopy.filmDetailsLabel}
              </span>
              <span className="v2-bpr-sheet-pref-support">
                {sheetCopy.filmDetailsSupport}
              </span>
            </span>
            <span aria-hidden="true">
              <IconLink width={14} height={14} />
            </span>
          </button>
        </div>

        <button
          type="button"
          className="v2-bpr-sheet-cancel"
          onClick={onClose}
        >
          {sheetCopy.cancelLabel}
        </button>
      </div>
    </div>
  );
}
