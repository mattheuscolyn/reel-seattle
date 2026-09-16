/**
 * Lightweight Coming Soon detail — not canonical Film Detail.
 * Powered only by a Coming Soon entry. No save / seen / planner / tickets.
 */

import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import { composeComingSoonDetail } from './comingSoonModel.js';

/**
 * @param {{
 *   artifact?: object | null,
 *   entryId?: string | null,
 * }} props
 */
export default function ComingSoonDetailSurface({
  artifact = null,
  entryId = null,
}) {
  const detail = composeComingSoonDetail(artifact, entryId);

  if (!detail.found) {
    return (
      <section
        className="v2-cs-page"
        data-coming-soon-surface="detail"
        data-coming-soon-detail-found="false"
      >
        <header className="v2-cs-page-header">
          <h1 className="v2-cs-page-title">{detail.title}</h1>
          <p className="v2-cs-empty" role="status">
            {detail.emptyMessage}
          </p>
        </header>
      </section>
    );
  }

  const metaParts = [
    detail.releaseYear != null ? String(detail.releaseYear) : null,
    detail.runtimeLabel,
    detail.rating,
  ].filter(Boolean);
  const showMeta = metaParts.length > 1 || Boolean(detail.runtimeLabel || detail.rating);

  return (
    <article
      className="v2-cs-detail"
      data-coming-soon-surface="detail"
      data-coming-soon-detail-found="true"
      data-coming-soon-entry={detail.entryId}
      data-coming-soon-classification={detail.classification}
      aria-labelledby="v2-cs-detail-title"
    >
      {detail.hasArtwork ? (
        <div className="v2-cs-detail-art" aria-hidden="true">
          <TheaterVenueImage
            src={detail.backdropUrl || detail.posterUrl}
            alt=""
            loading="eager"
          />
        </div>
      ) : null}

      <header className="v2-cs-detail-header">
        <h1 id="v2-cs-detail-title" className="v2-cs-detail-title">
          {detail.title}
        </h1>
        {detail.kindLabel ? (
          <p className="v2-cs-detail-kind" data-coming-soon-kind={detail.kind}>
            {detail.kindLabel}
          </p>
        ) : null}
        {detail.expectedDateLabel ? (
          <p className="v2-cs-detail-date">Expected {detail.expectedDateLabel}</p>
        ) : null}
        {showMeta ? (
          <p className="v2-cs-detail-meta">{metaParts.join(' · ')}</p>
        ) : null}
      </header>

      <p className="v2-cs-detail-status">{detail.localStatusLabel}</p>

      {detail.theaters.length > 0 ? (
        <ul className="v2-cs-detail-theaters" aria-label="Known Seattle theaters">
          {detail.theaters.map((theater) => (
            <li key={theater.theaterId || theater.name}>{theater.name}</li>
          ))}
        </ul>
      ) : null}

      {detail.overview ? (
        <p className="v2-cs-detail-overview">{detail.overview}</p>
      ) : null}
    </article>
  );
}
