import {
  IconBookmark,
  IconCheckCircle,
  IconChevron,
  IconCloseCircle,
  IconStar,
  IconTicket,
} from '../icons.jsx';

/**
 * Concise inline quick-detail — matches Home Landing mockup panel.
 * Save / Seen / Not interested use local stores; actions must not open Film Detail.
 */
export default function InlineQuickDetail({
  detail,
  panelId,
  onClose,
  onMoreDetails,
  saved = false,
  seen = false,
  notInterested = false,
  onToggleSave,
  onToggleSeen,
  onToggleNotInterested,
}) {
  if (!detail) return null;

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      id={panelId}
      className="v2-inline-detail"
      role="region"
      aria-label={`Quick details for ${detail.title}`}
    >
      <button
        type="button"
        className="v2-inline-detail-close v2-visually-hidden"
        aria-label="Collapse film details"
        onClick={onClose}
      >
        Collapse
      </button>

      <div className="v2-inline-detail-body">
        <div className="v2-inline-detail-poster">
          {detail.posterUrl ? (
            <img src={detail.posterUrl} alt="" draggable="false" />
          ) : (
            <div className="v2-inline-detail-poster-fallback" aria-hidden="true">
              <span>{detail.title}</span>
            </div>
          )}
        </div>

        <div className="v2-inline-detail-copy">
          <h3 className="v2-inline-detail-title">{detail.title}</h3>
          {detail.synopsis ? (
            <p className="v2-inline-detail-synopsis">{detail.synopsis}</p>
          ) : null}
          {detail.metaLine ? (
            <p className="v2-inline-detail-meta">{detail.metaLine}</p>
          ) : null}
          {detail.surfaceReasonLabel ? (
            <p className="v2-inline-detail-opportunity">
              <span className="v2-inline-detail-opportunity-icon" aria-hidden="true">
                <IconTicket width={12} height={12} />
              </span>
              <span>{detail.surfaceReasonLabel}</span>
            </p>
          ) : null}
          {detail.showingLine ? (
            <p className="v2-inline-detail-showing">
              <span className="v2-inline-detail-showing-icon" aria-hidden="true">
                <IconStar width={12} height={12} />
              </span>
              <span>{detail.showingLine}</span>
            </p>
          ) : (
            <p className="v2-inline-detail-showing v2-inline-detail-muted">
              No upcoming showtimes in the current window.
            </p>
          )}
          <button
            type="button"
            className="v2-inline-more"
            onClick={(event) => {
              stop(event);
              onMoreDetails?.();
            }}
          >
            More details
            <IconChevron />
          </button>
        </div>
      </div>

      <div className="v2-inline-detail-actions" role="group" aria-label="Film actions">
        <button
          type="button"
          className={
            saved
              ? 'v2-inline-action v2-inline-action-on'
              : 'v2-inline-action'
          }
          aria-pressed={saved}
          onClick={(event) => {
            stop(event);
            onToggleSave?.();
          }}
        >
          <IconBookmark width={14} height={14} aria-hidden="true" />
          <span>Save</span>
        </button>
        <button
          type="button"
          className={
            seen ? 'v2-inline-action v2-inline-action-on' : 'v2-inline-action'
          }
          aria-pressed={seen}
          onClick={(event) => {
            stop(event);
            onToggleSeen?.();
          }}
        >
          <IconCheckCircle width={14} height={14} aria-hidden="true" />
          <span>Seen</span>
        </button>
        <button
          type="button"
          className={
            notInterested
              ? 'v2-inline-action v2-inline-action-on'
              : 'v2-inline-action'
          }
          aria-pressed={notInterested}
          onClick={(event) => {
            stop(event);
            onToggleNotInterested?.();
          }}
        >
          <IconCloseCircle width={14} height={14} aria-hidden="true" />
          <span>Not interested</span>
        </button>
      </div>
    </div>
  );
}
