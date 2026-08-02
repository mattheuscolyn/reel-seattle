import { HOME_QUICK_PATH_ROWS } from '../fixtures/homeLandingMockupPresentation.js';
import { ExploreRowIcon, IconChevron } from '../icons.jsx';

/**
 * Quick Paths — canonical Home mockup directory (formerly Explore More).
 * Rows route through existing Explore destinations where available.
 */
export default function ExploreMore({ onSelectRow }) {
  return (
    <section className="v2-explore" aria-labelledby="v2-explore-heading">
      <h2 id="v2-explore-heading" className="v2-explore-heading">
        Quick Paths
      </h2>
      <ul className="v2-explore-list" role="list">
        {HOME_QUICK_PATH_ROWS.map((row) => (
          <li key={row.id} className="v2-explore-item">
            <button
              type="button"
              className="v2-explore-row"
              onClick={() => onSelectRow?.(row.id)}
            >
              <span className="v2-explore-row-icon" aria-hidden="true">
                <ExploreRowIcon name={row.icon} />
              </span>
              <span className="v2-explore-row-copy">
                <span className="v2-explore-row-label">{row.label}</span>
                <span className="v2-explore-row-desc">{row.description}</span>
              </span>
              <span className="v2-explore-row-chevron" aria-hidden="true">
                <IconChevron />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
