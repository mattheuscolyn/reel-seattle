import { resolveFilm, selectBestOpportunity, opportunityFormatLabel } from '../filmDetail/filmDetailModel.js';
import { formatLocalDateLabel } from '../topOpportunities/topOpportunityFormat.js';
import { externalTicketLinkProps } from '../ticket/externalTicketUrl.js';

/**
 * Modest Opportunity Detail scaffold — not final design.
 * Ticket action uses public ticketUrl only (no sourceUrl / homepage fallback).
 */
export default function OpportunityDetailSurface({
  homeData,
  filmKey,
  opportunityKey,
  onBack,
}) {
  const film = resolveFilm(homeData, filmKey);
  const opportunity =
    selectBestOpportunity(homeData, filmKey, opportunityKey) ??
    (Array.isArray(homeData?.opportunities)
      ? homeData.opportunities.find((o) => o.opportunityKey === opportunityKey)
      : null);

  const formatLabel = opportunityFormatLabel(opportunity);
  const ticketLink = externalTicketLinkProps(opportunity?.ticketUrl);

  return (
    <section className="v2-opp" aria-labelledby="v2-opp-title">
      <button type="button" className="v2-film-detail-back" onClick={onBack}>
        ← Back
      </button>
      <p className="v2-destination-eyebrow">Opportunity · scaffold</p>
      <h1 id="v2-opp-title">{film?.title ?? 'Opportunity'}</h1>

      {!opportunity ? (
        <p className="v2-fd-muted" role="status">
          This opportunity is unavailable or stale.
        </p>
      ) : (
        <div className="v2-opp-card">
          <p className="v2-opp-theater">{opportunity.theaterName}</p>
          <p className="v2-opp-when">
            {[
              formatLocalDateLabel(opportunity.localDate),
              opportunity.timeDisplay,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {formatLabel ? <p className="v2-opp-format">{formatLabel}</p> : null}
          {opportunity.auditorium ? (
            <p className="v2-opp-meta">{opportunity.auditorium}</p>
          ) : null}
          {ticketLink ? (
            <p className="v2-opp-ticket">
              <a {...ticketLink}>
                Theater ticket page
                <span className="v2-visually-hidden"> (opens in a new tab)</span>
              </a>
              <span className="v2-opp-ticket-note">
                {' '}
                — opens the theater or source site. Reel Seattle does not sell
                tickets.
              </span>
            </p>
          ) : (
            <p className="v2-opp-ticket-note">
              No ticket link in the current data. Reel Seattle does not process
              purchases.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
