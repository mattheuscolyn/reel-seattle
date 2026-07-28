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
    case 'ticket':
      return (
        <svg {...common}>
          <path d="M4 9V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V9a1.5 1.5 0 0 0 0 3v2.5A1.5 1.5 0 0 1 18.5 16h-13A1.5 1.5 0 0 1 4 14.5V12a1.5 1.5 0 0 0 0-3Z" />
          <path d="M9 8v8" />
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
    case 'week':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
          <circle cx="12" cy="11" r="2.2" />
        </svg>
      );
    case 'imax':
      return (
        <span className="v2-quick-imax" aria-hidden="true">
          IMAX
        </span>
      );
    case 'reel':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Compact Quick Start shortcut row.
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
