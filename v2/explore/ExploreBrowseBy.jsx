import { IconChevron } from '../icons.jsx';
import { BROWSE_ROWS } from './exploreBrowseBy.js';

function BrowseIcon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
  };
  switch (name) {
    case 'film':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="M8 5v14M16 5v14" />
        </svg>
      );
    case 'building':
      return (
        <svg {...common}>
          <path d="M4 20V7l8-3 8 3v13" />
          <path d="M9 20v-5h6v5" />
        </svg>
      );
    case 'formats':
      return (
        <svg {...common}>
          <path d="M4 8h16M4 12h16M4 16h10" />
          <path d="m16 14 4 2-4 2v-4Z" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
        </svg>
      );
    case 'timer':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="7" />
          <path d="M12 10v3.5l2 1.5M9 4h6" />
        </svg>
      );
    case 'badge':
      return (
        <svg {...common}>
          <path d="M8 4h8l1.5 3H19v4.5L12 21 5 11.5V7h1.5L8 4Z" />
          <path d="M9.5 11.5h5" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Browse By directory rows.
 */
export default function ExploreBrowseBy({ onSelect }) {
  return (
    <section className="v2-browse" aria-labelledby="v2-browse-heading">
      <h2 id="v2-browse-heading" className="v2-section-caps">
        Browse By
      </h2>
      <ul className="v2-browse-list" role="list">
        {BROWSE_ROWS.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`v2-browse-row v2-browse-row-${row.tone}`}
              onClick={() => onSelect?.(row.id)}
            >
              <span className="v2-browse-icon" aria-hidden="true">
                <BrowseIcon name={row.icon} />
              </span>
              <span className="v2-browse-copy">
                <span className="v2-browse-label">{row.label}</span>
                <span className="v2-browse-desc">{row.description}</span>
              </span>
              <span className="v2-browse-chevron" aria-hidden="true">
                <IconChevron />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { BROWSE_ROWS };
