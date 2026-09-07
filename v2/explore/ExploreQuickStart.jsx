import { QUICK_START } from './exploreQuickStart.js';

function QuickIcon({ name }) {
  const common = {
    width: 22,
    height: 22,
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
    case 'showtimes':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
          <path d="M8 13.5h8M8 16.5h5" />
        </svg>
      );
    case 'today':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
          <path d="m11 14 1.2 1.2L15.5 12" />
        </svg>
      );
    case 'weekend':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
          <path d="M8 13.5h3.2M13.2 13.5H16M8 16.5h3.2M13.2 16.5H16" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Compact Quick Start shortcut row — temporal Showtimes launches only.
 */
export default function ExploreQuickStart({ onSelect }) {
  return (
    <section className="v2-quick" aria-labelledby="v2-quick-heading">
      <h2 id="v2-quick-heading" className="v2-section-caps">
        Quick Start
      </h2>
      <ul className="v2-quick-row" role="list">
        {QUICK_START.map((item) => (
          <li key={item.id} className="v2-quick-item">
            <button
              type="button"
              className="v2-quick-button"
              data-quick-start={item.id}
              onClick={() => onSelect?.(item.id)}
            >
              <span className="v2-quick-icon">
                <QuickIcon name={item.icon} />
              </span>
              <span className="v2-quick-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { QUICK_START };
