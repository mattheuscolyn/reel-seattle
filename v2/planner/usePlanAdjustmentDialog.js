/**
 * Shared focus trap, Escape, and body scroll-lock for Results adjustment dialogs.
 */

import { useEffect, useRef } from 'react';

/**
 * @param {{
 *   open: boolean,
 *   onCancel: () => void,
 *   initialFocusRef?: { current: HTMLElement | null },
 * }} options
 */
export function usePlanAdjustmentDialog({ open, onCancel, initialFocusRef }) {
  const dialogRef = useRef(null);
  const scrollYRef = useRef(0);

  useEffect(() => {
    if (!open) return undefined;

    scrollYRef.current = window.scrollY || window.pageYOffset || 0;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = '100%';

    const focusTimer = window.setTimeout(() => {
      const target =
        initialFocusRef?.current ??
        dialogRef.current?.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
      target?.focus?.();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) =>
          el instanceof HTMLElement &&
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true',
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
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollYRef.current);
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onCancel, initialFocusRef]);

  return { dialogRef };
}
