/**
 * Short Detail — Film Detail sibling.
 * Displays program showtimes only via "Screens as part of" (never owns them).
 */

import { useMemo, useState } from 'react';
import { IconChevron, IconShare } from '../icons.jsx';
import { composeShortDetailPresentation } from '../shortsPrograms/composeShortDetailPresentation.js';

/**
 * @param {{
 *   shortsIndex: object | null,
 *   shortId: string | null,
 *   shortsProgramId?: string | null,
 *   homeData?: object | null,
 *   collectionsArtifact?: object | null,
 *   onShare?: (() => void) | null,
 *   shareTitle?: string | null,
 *   shareStatus?: string | null,
 *   onOpenShortsProgram?: (payload: { shortsProgramId: string }) => void,
 *   onOpenShort?: (payload: { shortId: string, shortsProgramId?: string | null }) => void,
 *   onOpenCollection?: (payload: { collectionId: string }) => void,
 * }} props
 */
export default function ShortDetailSurface({
  shortsIndex = null,
  shortId = null,
  shortsProgramId = null,
  homeData = null,
  collectionsArtifact = null,
  onShare = null,
  shareTitle = null,
  shareStatus = null,
  onOpenShortsProgram = null,
  onOpenShort = null,
  onOpenCollection = null,
}) {
  const view = useMemo(
    () =>
      composeShortDetailPresentation({
        index: shortsIndex,
        shortId,
        shortsProgramId,
        homeData,
        collectionsArtifact,
      }),
    [shortsIndex, shortId, shortsProgramId, homeData, collectionsArtifact],
  );

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  if (!view.resolved) {
    return (
      <section
        className="v2-fd v2-fd-empty"
        aria-labelledby="v2-sd-title"
        data-sd-resolved="false"
      >
        <h1 id="v2-sd-title">Short not found</h1>
        <p className="v2-fd-muted" role="status">
          This short is unavailable in the current shorts programs data.
        </p>
      </section>
    );
  }

  const { hero, synopsis, screensAsPartOf, collection, otherShorts, detailRows } =
    view;
  const hasBackdrop = Boolean(hero.backdropUrl);
  const hasPoster = Boolean(hero.posterUrl);
  const backdropStyle = hasBackdrop
    ? {
        backgroundImage: `url("${hero.backdropUrl}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: '72% 28%',
      }
    : hasPoster
      ? {
          backgroundImage: `linear-gradient(180deg, rgba(7,8,13,0.35) 0%, rgba(7,8,13,0.72) 55%, var(--v2-bg) 100%), url("${hero.posterUrl}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center 20%',
        }
      : undefined;
  const synopsisText = synopsisExpanded ? synopsis.full : synopsis.preview;

  return (
    <section
      className="v2-fd v2-sd"
      aria-labelledby="v2-sd-title"
      data-sd-resolved="true"
      data-sd-short-id={view.shortId}
      data-sd-has-short-owned-showtimes={view.hasShortOwnedShowtimes ? 'true' : 'false'}
    >
      <div
        className={
          hasBackdrop || hasPoster
            ? 'v2-fd-hero v2-fd-hero-has-media'
            : 'v2-fd-hero'
        }
        style={backdropStyle}
      >
        {typeof onShare === 'function' ? (
          <button
            type="button"
            className="v2-fd-share"
            aria-label={shareTitle ? `Share ${shareTitle}` : 'Share short'}
            onClick={onShare}
          >
            <IconShare width={22} height={22} aria-hidden="true" />
          </button>
        ) : null}
        {shareStatus ? (
          <span className="v2-visually-hidden" role="status">
            {shareStatus}
          </span>
        ) : null}
        <div className="v2-fd-hero-inner">
          <div className="v2-fd-poster">
            {hasPoster ? (
              <img src={hero.posterUrl} alt="" />
            ) : (
              <div className="v2-fd-poster-fallback" aria-hidden="true">
                <span>{hero.title}</span>
              </div>
            )}
          </div>
          <div className="v2-fd-hero-copy">
            <h1 id="v2-sd-title" className="v2-fd-title">
              {hero.title}
            </h1>
            {hero.metaLine ? <p className="v2-fd-meta">{hero.metaLine}</p> : null}
            {hero.genres ? <p className="v2-fd-genres">{hero.genres}</p> : null}
            {hero.director ? (
              <p className="v2-fd-director">{hero.director}</p>
            ) : null}
          </div>
        </div>
      </div>

      {screensAsPartOf ? (
        <section
          className="v2-fd-section v2-sd-screens"
          aria-labelledby="v2-sd-screens-h"
          data-sd-slot="screens-as-part-of"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-sd-screens-h" className="v2-section-caps">
              Screens as part of
            </h2>
          </div>
          <button
            type="button"
            className="v2-sd-program-card"
            aria-label={`Screens as part of ${screensAsPartOf.title}`}
            onClick={() =>
              onOpenShortsProgram?.({
                shortsProgramId: screensAsPartOf.shortsProgramId,
              })
            }
          >
            <span className="v2-sd-program-thumb" aria-hidden="true">
              {screensAsPartOf.imageUrl ? (
                <img src={screensAsPartOf.imageUrl} alt="" />
              ) : (
                <span className="v2-sd-program-thumb-fallback" />
              )}
            </span>
            <span className="v2-sd-program-copy">
              <span className="v2-sd-program-title">{screensAsPartOf.title}</span>
              <span className="v2-sd-program-kicker">{screensAsPartOf.kicker}</span>
              <span className="v2-sd-program-when">
                {[screensAsPartOf.theaterName, screensAsPartOf.whenLabel]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="v2-sd-program-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        </section>
      ) : null}

      <section
        className="v2-fd-section v2-fd-section-about"
        aria-labelledby="v2-sd-about-h"
        data-fd-slot="synopsis"
      >
        <div className="v2-fd-section-head">
          <h2 id="v2-sd-about-h" className="v2-section-caps">
            What it’s about
          </h2>
        </div>
        {synopsis.available && synopsisText ? (
          <p className="v2-fd-synopsis">{synopsisText}</p>
        ) : (
          <p className="v2-fd-muted" role="status">
            Synopsis is not available in current public data.
          </p>
        )}
        {synopsis.needsMore ? (
          <div className="v2-fd-synopsis-foot">
            <button
              type="button"
              className="v2-fd-link v2-fd-more"
              aria-expanded={synopsisExpanded}
              onClick={() => setSynopsisExpanded((v) => !v)}
            >
              {synopsisExpanded ? 'Less' : 'More'}{' '}
              <span aria-hidden="true">{synopsisExpanded ? '▴' : '▾'}</span>
            </button>
          </div>
        ) : null}
      </section>

      {detailRows.length > 0 ? (
        <section
          className="v2-fd-section"
          aria-labelledby="v2-sd-details-h"
          data-sd-slot="details"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-sd-details-h" className="v2-section-caps">
              Details
            </h2>
          </div>
          <dl className="v2-sd-details">
            {detailRows.map((row) => (
              <div key={row.label} className="v2-sd-details-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {collection ? (
        <section
          className="v2-fd-section"
          aria-labelledby="v2-sd-part-h"
          data-sd-slot="part-of"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-sd-part-h" className="v2-section-caps">
              Part of
            </h2>
          </div>
          <button
            type="button"
            className="v2-sd-collection-card"
            aria-label={collection.title}
            onClick={() =>
              onOpenCollection?.({ collectionId: collection.collectionId })
            }
          >
            <span className="v2-sd-collection-mark" aria-hidden="true">
              {collection.imageUrl ? (
                <img src={collection.imageUrl} alt="" />
              ) : (
                <span>LS</span>
              )}
            </span>
            <span className="v2-sd-collection-copy">
              <span className="v2-sd-collection-title">{collection.title}</span>
              <span className="v2-sd-collection-meta">
                {[collection.venueLabel, collection.dateLabel]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="v2-sd-program-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        </section>
      ) : null}

      {otherShorts.length > 0 ? (
        <section
          className="v2-fd-section v2-fd-section-last"
          aria-labelledby="v2-sd-others-h"
          data-sd-slot="other-shorts"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-sd-others-h" className="v2-section-caps">
              Other shorts in this program
            </h2>
            <span className="v2-fd-link" aria-hidden="true">
              See all ({otherShorts.length + 1})
            </span>
          </div>
          <ul className="v2-sd-other-rail" role="list">
            {otherShorts.map((item) => (
              <li key={item.shortId}>
                <button
                  type="button"
                  className="v2-sd-other-card"
                  onClick={() =>
                    onOpenShort?.({
                      shortId: item.shortId,
                      shortsProgramId: view.shortsProgramId,
                    })
                  }
                >
                  <span className="v2-sd-other-poster" aria-hidden="true">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" />
                    ) : (
                      <span className="v2-sd-other-fallback">{item.title}</span>
                    )}
                  </span>
                  <span className="v2-sd-other-title">{item.title}</span>
                  {item.runtimeLabel ? (
                    <span className="v2-sd-other-meta">{item.runtimeLabel}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
