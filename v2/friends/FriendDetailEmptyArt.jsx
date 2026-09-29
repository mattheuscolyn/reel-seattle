import { IconFilm, IconSparkle } from '../icons.jsx';

/**
 * Isolated placeholder for the mutual-saves empty state.
 * Not permanent artwork — replace once a real illustration is chosen.
 */
export default function FriendDetailEmptyArt() {
  return (
    <div className="v2-fd-empty-art" aria-hidden="true" data-friend-empty-art="placeholder">
      <span className="v2-fd-empty-card v2-fd-empty-card-back">
        <IconFilm width={22} height={22} />
      </span>
      <span className="v2-fd-empty-card v2-fd-empty-card-front">
        <IconSparkle width={16} height={16} />
      </span>
    </div>
  );
}
