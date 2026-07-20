import {
  PRIMARY_DESTINATIONS,
  resolveDestinationId,
} from './destinations.js';

/**
 * @param {{
 *   activeDestinationId: string,
 *   onSelectDestination: (id: string) => void,
 * }} props
 */
export default function PrimaryNav({ activeDestinationId, onSelectDestination }) {
  const activeId = resolveDestinationId(activeDestinationId);

  return (
    <nav className="v2-nav" aria-label="Primary">
      <ul className="v2-nav-list" role="list">
        {PRIMARY_DESTINATIONS.map((destination) => {
          const isActive = destination.id === activeId;
          return (
            <li key={destination.id} className="v2-nav-item">
              <button
                type="button"
                className={
                  isActive ? 'v2-nav-button v2-nav-button-active' : 'v2-nav-button'
                }
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectDestination(destination.id)}
              >
                <span className="v2-nav-label">{destination.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
