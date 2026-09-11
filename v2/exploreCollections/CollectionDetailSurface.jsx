/**
 * Collection detail — upcoming collection-associated listings + remaining members.
 */

import { useMemo } from 'react';
import { IconChevron } from '../icons.jsx';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import { composeCollectionDetail } from './composeCollectionDetail.js';

/**
 * @param {{
 *   row: object,
 *   variant: 'upcoming' | 'also',
 *   onOpenFilm?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 * }} props
 */
function MemberRow({ row, variant, onOpenFilm }) {
  const clickable = row.canOpenFilmDetail && typeof onOpenFilm === 'function';
  const metaLine = [row.directors, row.year != null ? String(row.year) : null]
    .filter(Boolean)
    .join(' · ');
  const content = (
    <>
      <span className="v2-ecol-member-poster">
        <TheaterVenueImage src={row.posterUrl} loading="lazy" />
      </span>
      <span className="v2-ecol-member-copy">
        <span className="v2-ecol-member-title">{row.title}</span>
        {metaLine ? (
          <span className="v2-ecol-member-meta">{metaLine}</span>
        ) : null}
        {row.genreLine ? (
          <span className="v2-ecol-member-genres">{row.genreLine}</span>
        ) : null}
        {variant === 'upcoming' ? (
          <>
            {row.formatLabel ? (
              <span className="v2-ecol-member-format">{row.formatLabel}</span>
            ) : null}
            {row.theaterName ? (
              <span className="v2-ecol-member-theater">{row.theaterName}</span>
            ) : null}
            {row.nextWhenLabel ? (
              <span className="v2-ecol-member-when">{row.nextWhenLabel}</span>
            ) : null}
            {row.moreCount > 0 ? (
              <span className="v2-ecol-member-more">+{row.moreCount} more</span>
            ) : null}
          </>
        ) : (
          <span className="v2-ecol-member-none">{row.noUpcomingLabel}</span>
        )}
      </span>
      {clickable ? (
        <span className="v2-ecol-card-chevron" aria-hidden="true">
          <IconChevron />
        </span>
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className="v2-ecol-member"
        data-film-id={row.filmId ?? ''}
        data-film-key={row.filmKey ?? ''}
        onClick={() =>
          onOpenFilm?.({
            filmKey: row.filmKey,
            filmId: row.filmId,
            opportunityKey: row.opportunityKey,
          })
        }
      >
        {content}
      </button>
    );
  }

  return (
    <div className="v2-ecol-member v2-ecol-member-static" data-unresolved={row.unresolved ? 'true' : 'false'}>
      {content}
    </div>
  );
}

/**
 * @param {{
 *   artifact?: object | null,
 *   collectionId: string,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 * }} props
 */
export default function CollectionDetailSurface({
  artifact = null,
  collectionId,
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
}) {
  const detail = useMemo(
    () =>
      composeCollectionDetail(artifact, collectionId, {
        homeData,
        enrichmentIndex,
      }),
    [artifact, collectionId, homeData, enrichmentIndex],
  );

  if (!detail.found) {
    return (
      <section className="v2-ecol-page" data-ecol-section-root="detail">
        <header className="v2-ecol-page-header">
          <h1 className="v2-ecol-page-title">Collection</h1>
          <p className="v2-ecol-empty" role="status">
            This collection isn’t available.
          </p>
        </header>
      </section>
    );
  }

  const metaLine = [detail.sourceLabel, detail.typeLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      className="v2-ecol-page"
      aria-labelledby="v2-ecol-detail-title"
      data-ecol-section-root="detail"
      data-collection-id={detail.collectionId}
    >
      <header className="v2-ecol-page-header" data-ecol-section="header">
        <h1 id="v2-ecol-detail-title" className="v2-ecol-page-title">
          {detail.title}
        </h1>
        {metaLine ? <p className="v2-ecol-detail-meta">{metaLine}</p> : null}
      </header>

      <div className="v2-ecol-hero" data-ecol-section="image">
        <TheaterVenueImage src={detail.imageUrl} loading="eager" />
      </div>

      {detail.description ? (
        <p className="v2-ecol-detail-desc" data-ecol-section="description">
          {detail.description}
        </p>
      ) : null}

      {detail.sourceUrl ? (
        <a
          className="v2-ecol-source-link"
          href={detail.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-ecol-section="sourceLink"
        >
          {detail.sourceLinkLabel}
        </a>
      ) : null}

      <div className="v2-ecol-stats" data-ecol-section="stats">
        <div className="v2-ecol-stat">
          <span className="v2-ecol-stat-value">{detail.upcomingCount}</span>
          <span className="v2-ecol-stat-label">upcoming</span>
        </div>
        <div className="v2-ecol-stat">
          <span className="v2-ecol-stat-value">{detail.memberCount}</span>
          <span className="v2-ecol-stat-label">
            {detail.memberCount === 1 ? 'film' : 'films'}
          </span>
        </div>
        {detail.dateRangeLabel ? (
          <div className="v2-ecol-stat v2-ecol-stat-range">
            <span className="v2-ecol-stat-value v2-ecol-stat-range-value">
              {detail.dateRangeLabel}
            </span>
            <span className="v2-ecol-stat-label">dates</span>
          </div>
        ) : null}
      </div>

      <section className="v2-ecol-section" data-ecol-section="upcoming">
        <h2 className="v2-section-caps">Upcoming</h2>
        {detail.upcoming.length === 0 ? (
          <p className="v2-ecol-empty" role="status">
            No upcoming screenings
          </p>
        ) : (
          <ul className="v2-ecol-member-list" role="list">
            {detail.upcoming.map((row) => (
              <li key={row.listingKey}>
                <MemberRow
                  row={row}
                  variant="upcoming"
                  onOpenFilm={onOpenFilmDetail}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.alsoInCollection.length > 0 ? (
        <section className="v2-ecol-section" data-ecol-section="also">
          <h2 className="v2-section-caps">Also in this collection</h2>
          <ul className="v2-ecol-member-list" role="list">
            {detail.alsoInCollection.map((row) => (
              <li key={row.listingKey}>
                <MemberRow
                  row={row}
                  variant="also"
                  onOpenFilm={onOpenFilmDetail}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
