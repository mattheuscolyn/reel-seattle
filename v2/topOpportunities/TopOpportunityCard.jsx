import {
  buildAdditionalListingsLabel,
  buildPositionLabel,
  buildShowingContextLabel,
  buildSupportingFactsLabel,
  canGoNext,
  canGoPrevious,
} from './topOpportunityFormat.js';
import OpportunityImageStage from './OpportunityImageStage.jsx';
import { externalTicketLinkProps } from '../ticket/externalTicketUrl.js';

/**
 * One dominant Top Opportunity — sharp wide stage with protected title band (I-03R2).
 *
 * @param {{
 *   selection: object,
 *   index: number,
 *   length: number,
 *   onPrevious: () => void,
 *   onNext: () => void,
 * }} props
 */
export default function TopOpportunityCard({
  selection,
  index,
  length,
  onPrevious,
  onNext,
}) {
  const film = selection.film;
  const opportunity = selection.representativeOpportunity;
  const showingLabel = buildShowingContextLabel(selection);
  const supportingLabel = buildSupportingFactsLabel(selection);
  const additionalLabel = buildAdditionalListingsLabel(selection);
  const positionLabel = buildPositionLabel(index, length);
  const showControls = length > 1;
  const prevEnabled = canGoPrevious(index, length);
  const nextEnabled = canGoNext(index, length);
  const ticketLink = externalTicketLinkProps(opportunity.ticketUrl);

  return (
    <article
      className={`v2-feature${showControls ? ' v2-feature-has-controls' : ''}`}
      aria-labelledby="v2-top-film-title"
      aria-roledescription="slide"
      aria-label={`${film.title}, ${positionLabel}`}
    >
      <OpportunityImageStage
        title={film.title}
        posterUrl={film.posterUrl}
        backdropUrl={film.backdropUrl ?? null}
      />

      <div className="v2-feature-chrome">
        <div className="v2-feature-topbar">
          <p className="v2-feature-reason">{selection.selectionReasonLabel}</p>
        </div>

        <div className="v2-feature-copy">
          <h3 id="v2-top-film-title" className="v2-feature-title">
            {film.title}
          </h3>
          {showingLabel ? (
            <p className="v2-feature-showing">{showingLabel}</p>
          ) : null}
          {supportingLabel ? (
            <p className="v2-feature-supporting">{supportingLabel}</p>
          ) : null}
          {additionalLabel ? (
            <p className="v2-feature-additional">{additionalLabel}</p>
          ) : null}
          {ticketLink ? (
            <p className="v2-feature-ticket">
              <a className="v2-feature-ticket-link" {...ticketLink}>
                Tickets
                <span className="v2-visually-hidden"> (opens in a new tab)</span>
              </a>
            </p>
          ) : null}
        </div>
      </div>

      {showControls ? (
        <div
          className="v2-feature-arrows"
          role="group"
          aria-label="Featured opportunity navigation"
        >
          <button
            type="button"
            className="v2-feature-arrow v2-feature-arrow-prev"
            onClick={onPrevious}
            disabled={!prevEnabled}
            aria-label="Previous featured opportunity"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="v2-feature-arrow v2-feature-arrow-next"
            onClick={onNext}
            disabled={!nextEnabled}
            aria-label="Next featured opportunity"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}
