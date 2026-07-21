import {
  buildAdditionalListingsLabel,
  buildPositionLabel,
  buildShowingContextLabel,
  buildSupportingFactsLabel,
  canGoNext,
  canGoPrevious,
} from './topOpportunityFormat.js';
import OpportunityImageStage from './OpportunityImageStage.jsx';

/**
 * One dominant Top Opportunity — wide image-led frame with overlaid copy (I-03R).
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

  return (
    <article
      className="v2-feature"
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
          <p className="v2-feature-kicker">Top Opportunity</p>
          <p className="v2-feature-position" aria-live="polite">
            {positionLabel}
          </p>
        </div>

        {showControls ? (
          <div className="v2-feature-arrows">
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

        <div className="v2-feature-copy">
          <p className="v2-feature-reason">{selection.selectionReasonLabel}</p>
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
          {opportunity.ticketUrl ? (
            <p className="v2-feature-ticket">
              <a
                className="v2-feature-ticket-link"
                href={opportunity.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Tickets
                <span className="v2-visually-hidden"> (opens in a new tab)</span>
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
