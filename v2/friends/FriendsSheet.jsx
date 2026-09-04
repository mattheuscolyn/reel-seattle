import { useEffect, useId, useRef } from 'react';
import { IconClose } from '../icons.jsx';

/**
 * Shared Friends bottom sheet chrome (Notifications / ShowtimeActionSheet pattern).
 *
 * @param {{
 *   title: string,
 *   onClose?: () => void,
 *   children: import('react').ReactNode,
 *   labelledBy?: string,
 * }} props
 */
export default function FriendsSheet({ title, onClose, children }) {
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
        onClose?.();
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

  return (
    <div
      className="v2-friends-sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="v2-friends-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-friends-sheet-handle" aria-hidden="true" />
        <header className="v2-friends-sheet-header">
          <h2 id={titleId} className="v2-friends-sheet-title">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="v2-friends-sheet-close"
            aria-label="Close"
            onClick={() => onClose?.()}
          >
            <IconClose width={18} height={18} />
          </button>
        </header>
        <div className="v2-friends-sheet-body">{children}</div>
      </div>
    </div>
  );
}
