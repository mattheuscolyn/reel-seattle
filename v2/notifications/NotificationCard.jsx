import {
  IconCalendar,
  IconChevron,
  IconClock,
  IconPin,
} from '../icons.jsx';
import { isNotificationUnread } from './notificationModel.js';

/**
 * Single notification row/card.
 */
export default function NotificationCard({ item, onOpen }) {
  if (!item) return null;
  const unread = isNotificationUnread(item);
  const snap = item.snapshot || {};

  return (
    <li
      className={
        unread ? 'v2-notif-card v2-notif-card-unread' : 'v2-notif-card'
      }
    >
      <button
        type="button"
        className="v2-notif-card-main"
        onClick={() => onOpen?.(item)}
        aria-label={
          unread
            ? `${item.headline}, unread`
            : item.headline
        }
      >
        <span
          className={
            unread
              ? 'v2-notif-card-indicator v2-notif-card-indicator-unread'
              : 'v2-notif-card-indicator'
          }
          aria-hidden="true"
        />
        <span className="v2-notif-card-poster">
          {item.posterUrl ? (
            <img src={item.posterUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="v2-shelf-poster-fallback" aria-hidden="true" />
          )}
        </span>
        <span className="v2-notif-card-copy">
          <span className="v2-notif-card-headline">{item.headline}</span>
          {item.body && unread ? (
            <span className="v2-notif-card-body">{item.body}</span>
          ) : null}
          {snap.theaterName || snap.dateLabel || snap.timeLabel ? (
            <span className="v2-notif-card-meta">
              {snap.theaterName ? (
                <span className="v2-notif-card-meta-row">
                  <IconPin width={13} height={13} aria-hidden="true" />
                  <span>{snap.theaterName}</span>
                </span>
              ) : null}
              {snap.dateLabel ? (
                <span className="v2-notif-card-meta-row">
                  <IconCalendar width={13} height={13} aria-hidden="true" />
                  <span>{snap.dateLabel}</span>
                </span>
              ) : null}
              {snap.timeLabel ? (
                <span className="v2-notif-card-meta-row">
                  <IconClock width={13} height={13} aria-hidden="true" />
                  <span>{snap.timeLabel}</span>
                </span>
              ) : null}
            </span>
          ) : null}
          {!unread && item.body ? (
            <span className="v2-notif-card-body v2-notif-card-body-quiet">
              {item.body}
            </span>
          ) : null}
          {unread && item.actionLabel ? (
            <span className="v2-notif-card-cta">
              {item.actionLabel}
              <IconChevron width={12} height={12} aria-hidden="true" />
            </span>
          ) : null}
        </span>
        <span className="v2-notif-card-chevron" aria-hidden="true">
          <IconChevron width={16} height={16} />
        </span>
      </button>
    </li>
  );
}
