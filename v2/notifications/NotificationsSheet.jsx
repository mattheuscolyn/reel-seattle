import { useEffect, useId, useRef } from 'react';
import { IconClose } from '../icons.jsx';
import { groupNotificationsForSheet } from './notificationModel.js';
import NotificationCard from './NotificationCard.jsx';

/**
 * Notifications bottom sheet — Schedule Settings interaction pattern.
 */
export default function NotificationsSheet({
  items = [],
  onClose,
  onMarkAllRead,
  onOpenNotification,
  source = 'production',
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const grouped = groupNotificationsForSheet(items);

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
      className="v2-notif-backdrop"
      role="presentation"
      data-notifications-source={source}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="v2-notif-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-notif-handle" aria-hidden="true" />

        <header className="v2-notif-header">
          <div className="v2-notif-header-row">
            <h1 id={titleId} className="v2-notif-title">
              Notifications
            </h1>
            <button
              ref={closeRef}
              type="button"
              className="v2-notif-close"
              aria-label="Close notifications"
              onClick={() => onClose?.()}
            >
              <IconClose width={16} height={16} aria-hidden="true" />
            </button>
          </div>
          {grouped.hasUnread ? (
            <div className="v2-notif-header-actions">
              <button
                type="button"
                className="v2-notif-mark-all"
                onClick={() => onMarkAllRead?.()}
              >
                Mark all as read
              </button>
            </div>
          ) : null}
        </header>

        <div className="v2-notif-body">
          {grouped.isEmpty ? (
            <div className="v2-notif-empty" role="status">
              <p className="v2-notif-empty-title">No notifications yet</p>
              <p className="v2-notif-empty-body">
                When something changes for a film you’re keeping an eye on,
                you’ll see it here.
              </p>
            </div>
          ) : (
            <>
              {grouped.unread.length > 0 ? (
                <section
                  className="v2-notif-section"
                  aria-labelledby="v2-notif-new-h"
                >
                  <h2 id="v2-notif-new-h" className="v2-notif-section-label">
                    New
                  </h2>
                  <ul className="v2-notif-list" role="list">
                    {grouped.unread.map((item) => (
                      <NotificationCard
                        key={item.id}
                        item={item}
                        onOpen={onOpenNotification}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {grouped.read.length > 0 ? (
                <section
                  className="v2-notif-section"
                  aria-labelledby="v2-notif-earlier-h"
                >
                  <h2 id="v2-notif-earlier-h" className="v2-notif-section-label">
                    Earlier
                  </h2>
                  <ul className="v2-notif-list" role="list">
                    {grouped.read.map((item) => (
                      <NotificationCard
                        key={item.id}
                        item={item}
                        onOpen={onOpenNotification}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
