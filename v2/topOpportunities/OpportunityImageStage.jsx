import { resolveOpportunityStageMedia } from './opportunityStageMedia.js';

/**
 * Wide cinematic image stage for Top Opportunities.
 * Supports poster now; optional future backdropUrl without restructuring.
 *
 * @param {{
 *   title: string,
 *   posterUrl?: string | null,
 *   backdropUrl?: string | null,
 * }} props
 */
export default function OpportunityImageStage({
  title,
  posterUrl = null,
  backdropUrl = null,
}) {
  const media = resolveOpportunityStageMedia({ posterUrl, backdropUrl });

  return (
    <div
      className={`v2-stage v2-stage-${media.kind}`}
      data-stage-kind={media.kind}
    >
      {media.url ? (
        <>
          <img
            className="v2-stage-bleed"
            src={media.url}
            alt=""
            aria-hidden="true"
            draggable="false"
          />
          <div className="v2-stage-dim" aria-hidden="true" />
        </>
      ) : (
        <div
          className="v2-stage-fallback"
          role="img"
          aria-label={`${title} artwork unavailable`}
        >
          <span className="v2-stage-fallback-title">{title}</span>
        </div>
      )}
      <div className="v2-stage-gradient" aria-hidden="true" />
    </div>
  );
}
