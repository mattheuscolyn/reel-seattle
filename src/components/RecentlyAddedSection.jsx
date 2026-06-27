import { useMemo } from 'react';
import { useRecentlyAdded } from '../hooks/useRecentlyAdded.js';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { buildRecentlyAddedSection } from '../utils/recentlyAddedDisplay.js';
import RecentlyAddedCard from './RecentlyAddedCard.jsx';

/**
 * Recently added films from newly_added_current.json joined to the full showtimes row set.
 * Does not respect active search/date/theater filters on the main list.
 */
export default function RecentlyAddedSection() {
  const { artifact, loading, error } = useRecentlyAdded();
  const { rows } = useShowtimesData();

  const section = useMemo(() => {
    if (!artifact || !rows.length) return null;
    return buildRecentlyAddedSection(artifact, rows);
  }, [artifact, rows]);

  if (loading || error || !section || section.films.length === 0) {
    return null;
  }

  return (
    <section className="recently-added" aria-label="Recently added movies">
      <div className="recently-added-header">
        <div>
          <h2 className="recently-added-title">Recently added</h2>
          <p className="recently-added-subtitle">{section.subtitle}</p>
        </div>
        {section.countLabel ? (
          <div className="recently-added-count" aria-label={`${section.countLabel} recently added`}>
            {section.countLabel}
          </div>
        ) : null}
      </div>
      <div className="recently-added-list">
        {section.films.map((film) => (
          <RecentlyAddedCard key={film.showtime_film_key} film={film} />
        ))}
      </div>
    </section>
  );
}
