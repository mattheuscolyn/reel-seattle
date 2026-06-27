import { useShowtimesData } from '../hooks/useShowtimesData.js';
import { buildCurrentWindowSummary } from '../utils/showtimesSummary.js';

export default function CurrentWindowSummary() {
  const { rows, loading, error, sourceInfo } = useShowtimesData();
  const summary = buildCurrentWindowSummary({
    sourceInfo,
    rowCount: rows.length,
    loading,
    error,
  });

  if (!summary) return null;

  return (
    <p
      className={`current-window-summary${summary.loading ? ' current-window-summary--loading' : ''}`}
      aria-live="polite"
    >
      {summary.text}
    </p>
  );
}
