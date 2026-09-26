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
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
        </svg>
      );
  }
}

/**
 * Compact Quick Start shortcut row.
 * Items come from buildQuickStartItems — same visual treatment for all.
 *
 * @param {{
 *   items?: object[],
 *   onSelect?: (item: object) => void,
 * }} props
 */
export default function ExploreQuickStart({ items = [], onSelect }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <section className="v2-quick" aria-labelledby="v2-quick-heading">
      <h2 id="v2-quick-heading" className="v2-section-caps">
        Quick Start
      </h2>
      <ul className="v2-quick-row" role="list">
        {list.map((item) => (
          <li key={item.id} className="v2-quick-item">
            <button
              type="button"
              className="v2-quick-button"
              data-quick-start={item.id}
              onClick={() => onSelect?.(item)}
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
