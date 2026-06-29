import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import DataStatePanel from '../components/DataStatePanel.jsx';
import RecentlyAddedList from '../components/RecentlyAddedList.jsx';
import { useRecentlyAdded } from '../hooks/useRecentlyAdded.js';
import { useShowtimesData } from '../hooks/useShowtimesData.js';
import {
  buildRecentlyAddedSection,
  formatRecentlyAddedTotalLabel,
  formatRecentlyAddedSubtitle,
} from '../utils/recentlyAddedDisplay.js';
import { daysBackFromArtifact } from '../utils/recentlyAddedAdapter.js';

export default function RecentlyAddedPage() {
  const { artifact, loading: recentlyAddedLoading, error: recentlyAddedError } = useRecentlyAdded();
  const { rows, loading: showtimesLoading, error: showtimesError } = useShowtimesData();

  const loading = recentlyAddedLoading || showtimesLoading;
  const error = recentlyAddedError || showtimesError;

  const section = useMemo(() => {
    if (!artifact || !rows.length) return null;
    return buildRecentlyAddedSection(artifact, rows);
  }, [artifact, rows]);

  const subtitle = formatRecentlyAddedSubtitle(
    section?.daysBack ?? (artifact ? daysBackFromArtifact(artifact) : null),
  );
  const totalLabel = section ? formatRecentlyAddedTotalLabel(section.films.length) : null;

  return (
    <div className="page-content">
      <header className="page-hero">
        <h1 className="main-header page-title">Recently added</h1>
        <p className="page-subtitle">{subtitle}</p>
        {totalLabel ? (
          <p className="recently-added-page-total" aria-live="polite">
            {totalLabel}
          </p>
        ) : null}
        <p className="recently-added-page-back">
          <Link className="recently-added-back-link" to="/">
            ← Back to showtimes
          </Link>
        </p>
      </header>

      {loading ? (
        <DataStatePanel
          variant="loading"
          title="Loading recently added"
          message="Fetching newly announced films and matching showtimes…"
        />
      ) : error ? (
        <DataStatePanel
          variant="error"
          title="Could not load recently added"
          message={error}
        />
      ) : !section || section.films.length === 0 ? (
        <DataStatePanel
          variant="empty"
          title="No recently added films"
          message="No newly announced films are currently showing. Check back after the next data refresh."
        />
      ) : (
        <section className="recently-added recently-added--full" aria-label="Recently added movies">
          <RecentlyAddedList films={section.films} />
        </section>
      )}
    </div>
  );
}
