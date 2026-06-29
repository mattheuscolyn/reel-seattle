import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRecentlyAdded } from '../hooks/useRecentlyAdded.js';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { RECENTLY_ADDED_ROUTE } from '../utils/routes.js';
import {
  buildRecentlyAddedSection,
  formatRecentlyAddedTotalLabel,
  formatRecentlyAddedViewAllLabel,
  sliceRecentlyAddedFilms,
} from '../utils/recentlyAddedDisplay.js';
import RecentlyAddedList from './RecentlyAddedList.jsx';

/**
 * Recently added films from newly_added_current.json joined to the full showtimes row set.
 * Does not respect active search/date/theater filters on the main list.
 *
 * @param {{ limit?: number | null; showViewAllLink?: boolean }} props
 */
export default function RecentlyAddedSection({ limit = null, showViewAllLink = false }) {
  const { artifact, loading, error } = useRecentlyAdded();
  const { rows } = useShowtimesData();

  const section = useMemo(() => {
    if (!artifact || !rows.length) return null;
    return buildRecentlyAddedSection(artifact, rows);
  }, [artifact, rows]);

  const visibleFilms = useMemo(() => {
    if (!section) return [];
    return sliceRecentlyAddedFilms(section.films, limit);
  }, [section, limit]);

  const totalCount = section?.films.length ?? 0;
  const isPreviewMode = limit != null;
  const hasMoreThanPreview = limit != null && totalCount > limit;
  const totalLabel = formatRecentlyAddedTotalLabel(totalCount);
  const viewAllLabel = formatRecentlyAddedViewAllLabel(totalCount);

  if (loading || error || !section || totalCount === 0) {
    return null;
  }

  return (
    <section
      className={`recently-added${isPreviewMode ? ' recently-added--preview' : ''}`}
      aria-label="Recently added movies"
    >
      <div className="recently-added-header">
        <div>
          <h2 className="recently-added-title">Recently added</h2>
          <p className="recently-added-subtitle">{section.subtitle}</p>
        </div>
        {totalLabel ? (
          <div className="recently-added-count" aria-label={totalLabel}>
            {totalLabel}
          </div>
        ) : null}
      </div>
      <RecentlyAddedList films={visibleFilms} />
      {showViewAllLink && hasMoreThanPreview && viewAllLabel ? (
        <div className="recently-added-footer">
          <Link className="recently-added-view-all" to={RECENTLY_ADDED_ROUTE}>
            {viewAllLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
