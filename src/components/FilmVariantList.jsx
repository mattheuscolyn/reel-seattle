import { getVariantTypeLabel } from '../utils/plannerFilms.js';

/**
 * Display a list of film variants (Sensory Friendly, IMAX, etc.)
 * 
 * @param {object} props
 * @param {Array<{film: string, filmKey: string, variantType: string, showtimes: object}>} props.variants
 */
export default function FilmVariantList({ variants }) {
  if (!variants || variants.length === 0) return null;

  // Count total showtimes for each variant
  const getShowtimeCount = (variant) => {
    let count = 0;
    Object.values(variant.showtimes || {}).forEach((theaters) => {
      Object.values(theaters).forEach((times) => {
        count += times.length;
      });
    });
    return count;
  };

  return (
    <div className="film-variant-list">
      <div className="film-variant-list-header">
        <span className="film-variant-count">{variants.length} version{variants.length !== 1 ? 's' : ''}</span>
      </div>
      <ul className="film-variant-items">
        {variants.map((variant) => {
          const variantLabel = getVariantTypeLabel(variant.variantType);
          const showtimeCount = getShowtimeCount(variant);
          
          return (
            <li key={variant.filmKey || variant.film} className="film-variant-item">
              <div className="film-variant-info">
                <span className="film-variant-title">{variant.film}</span>
                {variantLabel && (
                  <span className="film-variant-type-badge">{variantLabel}</span>
                )}
              </div>
              <div className="film-variant-meta">
                <span className="film-variant-theaters">
                  {showtimeCount} showtime{showtimeCount !== 1 ? 's' : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
