import { IconChevron } from '../icons.jsx';

/**
 * Concise inline quick-detail — “Is this worth investigating?”
 * Not a miniature Film Detail page.
 */
export default function InlineQuickDetail({
  detail,
  panelId,
  onClose,
  onMoreDetails,
}) {
  if (!detail) return null;

  return (
    <div
      id={panelId}
      className="v2-inline-detail"
      role="region"
      aria-label={`Quick details for ${detail.title}`}
    >
      <button
        type="button"
        className="v2-inline-detail-close"
        aria-label="Collapse film details"
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
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
          {detail.metaLine ? (
            <p className="v2-inline-detail-meta">{detail.metaLine}</p>
          ) : null}
          {detail.synopsis ? (
            <p className="v2-inline-detail-synopsis">{detail.synopsis}</p>
          ) : null}
          {detail.showingLine ? (
            <p className="v2-inline-detail-showing">
              <span className="v2-inline-detail-showing-label">Next showtime</span>
              {detail.showingLine}
            </p>
          ) : (
            <p className="v2-inline-detail-showing v2-inline-detail-muted">
              No upcoming showtimes in the current window.
            </p>
          )}

          <div className="v2-inline-detail-chips">
            {detail.surfaceReasonLabel ? (
              <span className="v2-inline-chip v2-inline-chip-accent">
                {detail.surfaceReasonLabel}
              </span>
            ) : null}
            {detail.alsoPlayingLabel ? (
              <span className="v2-inline-chip">{detail.alsoPlayingLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="v2-inline-detail-footer">
        <button
          type="button"
          className="v2-inline-more"
          onClick={onMoreDetails}
        >
          More details
          <IconChevron />
        </button>
        <p className="v2-inline-detail-actions-note">
          Save is on Film Detail. Not interested is not available in this quick
          panel yet.
        </p>
      </div>
    </div>
  );
}
