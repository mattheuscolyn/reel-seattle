/**
 * Lightweight Special Event detail — exact qualifying showtimes + tickets.
 * Film Detail is optional secondary navigation when a film identity exists.
 */

import { useState } from 'react';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import ShowtimeActionSheet from '../showtimes/ShowtimeActionSheet.jsx';
import { externalTicketLinkProps } from '../ticket/externalTicketUrl.js';
import { composeSpecialEventsDetail } from './specialEventsModel.js';

/**
 * @param {{
 *   homeData?: object | null,
 *   engagementId?: string | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 * }} props
 */
export default function SpecialEventsDetailSurface({
  homeData = null,
  engagementId = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
}) {
  const detail = composeSpecialEventsDetail(homeData, engagementId, {
    enrichmentIndex,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeShowtime, setActiveShowtime] = useState(null);

  if (!detail.found) {
    return (
      <section
        className="v2-se-page"
        data-special-events-surface="detail"
        data-special-events-detail-found="false"
      >
        <header className="v2-se-page-header">
          <h1 className="v2-se-page-title">{detail.title}</h1>
          <p className="v2-se-empty" role="status">
            {detail.emptyMessage}
          </p>
        </header>
      </section>
    );
  }

  const openSheet = (showtime) => {
    setActiveShowtime(showtime);
    setSheetOpen(true);
  };

  return (
    <article
      className="v2-se-detail"
      data-special-events-surface="detail"
      data-special-events-detail-found="true"
      data-special-event-engagement={detail.engagementId}
      aria-labelledby="v2-se-detail-title"
    >
      {detail.hasPoster ? (
        <div className="v2-se-detail-art" aria-hidden="true">
          <TheaterVenueImage
            src={detail.posterUrl}
            alt=""
            loading="eager"
          />
        </div>
      ) : null}

      <header className="v2-se-detail-header">
        <h1 id="v2-se-detail-title" className="v2-se-detail-title">
          {detail.filmTitle}
        </h1>
        <p className="v2-se-detail-event">{detail.eventDescription}</p>
      </header>

      <section
        className="v2-se-detail-showtimes"
        aria-labelledby="v2-se-detail-showtimes-heading"
      >
        <h2 id="v2-se-detail-showtimes-heading" className="v2-se-detail-subhead">
          Special-event showtimes
        </h2>
        <ul className="v2-se-detail-list" role="list">
          {detail.showtimes.map((show) => {
            const ticketLink = externalTicketLinkProps(show.ticketUrl);
            return (
              <li
                key={show.opportunityKey}
                className="v2-se-detail-show"
                data-opportunity-key={show.opportunityKey}
              >
                <div className="v2-se-detail-show-copy">
                  <p className="v2-se-detail-show-when">{show.whenLabel}</p>
                  <p className="v2-se-detail-show-theater">{show.theaterName}</p>
                  {show.formatLabels.length > 0 ? (
                    <p className="v2-se-detail-show-formats">
                      {show.formatLabels.join(' · ')}
                    </p>
                  ) : null}
                </div>
                <div className="v2-se-detail-show-actions">
                  {ticketLink ? (
                    <a
                      className="v2-se-detail-ticket"
                      {...ticketLink}
                      aria-label={`Get tickets for ${show.ariaLabel}`}
                    >
                      Get Tickets
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="v2-se-detail-ticket"
                      onClick={() => openSheet(show)}
                      aria-label={`Get tickets for ${show.ariaLabel}`}
                    >
                      Get Tickets
                    </button>
                  )}
                  <button
                    type="button"
                    className="v2-se-detail-more"
                    onClick={() => openSheet(show)}
                    aria-label={`More actions for ${show.ariaLabel}`}
                  >
                    More
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {detail.canOpenFilmDetail ? (
        <button
          type="button"
          className="v2-se-detail-film-link"
          onClick={() =>
            onOpenFilmDetail?.({
              filmKey: detail.filmKey,
              filmId: detail.filmId,
              opportunityKey: detail.showtimes[0]?.opportunityKey ?? null,
            })
          }
        >
          Film details
        </button>
      ) : null}

      <ShowtimeActionSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setActiveShowtime(null);
        }}
        opportunity={
          activeShowtime
            ? (homeData?.opportunities || []).find(
                (o) => o.opportunityKey === activeShowtime.opportunityKey,
              ) ?? null
            : null
        }
        filmKey={detail.filmKey}
        row={activeShowtime}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
      />
    </article>
  );
}
