import { resolveOpportunityStageMedia } from './opportunityStageMedia.js';

/**
 * Wide cinematic image stage.
 * Sharp cover crop is the primary visible artwork; optional soft fill may sit behind posters.
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
          {media.kind === 'poster' ? (
            <img
              className="v2-stage-fill"
              src={media.url}
              alt=""
              aria-hidden="true"
              draggable="false"
            />
          ) : null}
          <img
            className="v2-stage-cover"
            src={media.url}
            alt=""
            aria-hidden="true"
            draggable="false"
          />
          <div className="v2-stage-scrim" aria-hidden="true" />
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
