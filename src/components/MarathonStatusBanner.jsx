import { usePipelineReport } from '../hooks/usePipelineReport.js';
import { buildMarathonStatusMessage } from '../utils/pipelineReport.js';

export default function MarathonStatusBanner() {
  const { report, loading, error } = usePipelineReport();

  if (loading) {
    return null;
  }

  const status = buildMarathonStatusMessage(error ? null : report);
  if (!status) {
    return null;
  }

  return (
    <aside
      className={`marathon-status-banner marathon-status-banner--${status.variant}`}
      role="status"
      aria-live="polite"
    >
      {status.message}
    </aside>
  );
}
