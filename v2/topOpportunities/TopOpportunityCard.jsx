import {
  buildAdditionalListingsLabel,
  formatLocalDateLabel,
} from './topOpportunityFormat.js';

/**
 * @param {{
 *   selection: object,
 *   detailsOpen: boolean,
 *   onToggleDetails: () => void,
 * }} props
 */
export default function TopOpportunityCard({
  selection,
  detailsOpen,
  onToggleDetails,
}) {
  const film = selection.film;
  const opportunity = selection.representativeOpportunity;
  const dateLabel = formatLocalDateLabel(opportunity.localDate);
  const additionalLabel = buildAdditionalListingsLabel(selection);
  const formatLabel =
    Array.isArray(opportunity.formatLabels) && opportunity.formatLabels.length > 0
      ? opportunity.formatLabels.join(', ')
      : null;
  const posterUrl =
    typeof film.posterUrl === 'string' && film.posterUrl.trim()
      ? film.posterUrl.trim()
      : null;

  return (
    <article className="v2-top-card" aria-labelledby="v2-top-film-title">
      <div className="v2-top-card-media" aria-hidden={posterUrl ? undefined : true}>
        {posterUrl ? (
          <img
            className="v2-top-poster"
            src={posterUrl}
            alt=""
            width={320}
            height={480}
          />
        ) : (
          <div className="v2-top-poster-fallback" role="img" aria-label={`${film.title} poster unavailable`}>
            <span className="v2-top-poster-fallback-title">{film.title}</span>
          </div>
        )}
      </div>

      <div className="v2-top-card-body">
        <p className="v2-top-reason">{selection.selectionReasonLabel}</p>
        <h3 id="v2-top-film-title" className="v2-top-title">
          {film.title}
        </h3>

        <dl className="v2-top-meta">
          <div>
            <dt>Theater</dt>
            <dd>{opportunity.theaterName}</dd>
          </div>
          <div>
            <dt>Showing</dt>
            <dd>
              {[dateLabel, opportunity.timeDisplay].filter(Boolean).join(' · ')}
            </dd>
          </div>
          {formatLabel ? (
            <div>
              <dt>Format</dt>
              <dd>{formatLabel}</dd>
            </div>
          ) : null}
          {typeof film.runtimeMin === 'number' ? (
            <div>
              <dt>Runtime</dt>
              <dd>{film.runtimeMin} min</dd>
            </div>
          ) : null}
        </dl>

        {additionalLabel ? (
          <p className="v2-top-additional">{additionalLabel}</p>
        ) : (
          <p className="v2-top-additional">One available showing in the current window</p>
        )}

        <div className="v2-top-actions">
          <button
            type="button"
            className="v2-top-details-toggle"
            aria-expanded={detailsOpen}
            aria-controls="v2-top-inline-details"
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'Hide showing details' : 'Showing details'}
          </button>
          {opportunity.ticketUrl ? (
            <a
              className="v2-top-ticket-link"
              href={opportunity.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Tickets
              <span className="v2-visually-hidden"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>

        {detailsOpen ? (
          <div id="v2-top-inline-details" className="v2-top-inline-details">
            <p>
              Representative showing for {film.title} — not ranked as the best
              performance. Film Detail is not available in this slice.
            </p>
            <ul>
              <li>
                Local date/time: {opportunity.localDate} {opportunity.localTime}
              </li>
              <li>Theater id: {opportunity.theaterId}</li>
              <li>Selection basis: {selection.selectionReasonLabel}</li>
              {selection.supportingFacts?.listingCountLabel ? (
                <li>{selection.supportingFacts.listingCountLabel}</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
}
