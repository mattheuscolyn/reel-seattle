import {
  buildSuggestedStarts,
  SUGGESTED_STARTS_VIEW_ALL_ID,
} from './exploreSuggestedStarts.js';

/**
 * Suggested Starts — date-scope discovery cards.
 */
export default function ExploreSuggestedStarts({ onSelect, onViewAll }) {
  const items = buildSuggestedStarts();

  return (
    <section className="v2-suggested" aria-labelledby="v2-suggested-heading">
      <div className="v2-section-row">
        <h2 id="v2-suggested-heading" className="v2-section-caps">
          Suggested Starts
        </h2>
        <button
          type="button"
          className="v2-section-action"
          aria-label="View all suggested starts"
          onClick={() => onViewAll?.(SUGGESTED_STARTS_VIEW_ALL_ID)}
        >
          View all
        </button>
      </div>
      <ul className="v2-suggested-row" role="list">
        {items.map((item) => (
          <li key={item.id} className="v2-suggested-item">
            <button
              type="button"
              className={`v2-suggested-card v2-suggested-card-${item.tone}`}
              aria-label={item.ariaLabel}
              onClick={() => onSelect?.(item.id)}
            >
              <span className="v2-suggested-card-bg" aria-hidden="true" />
              <span className="v2-suggested-card-copy">
                <span className="v2-suggested-card-title">{item.title}</span>
                <span className="v2-suggested-card-sub">{item.subtitle}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
