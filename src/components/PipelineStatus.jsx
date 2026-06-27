import { usePipelineReport } from '../hooks/usePipelineReport.js';
import { buildHeadline, PIPELINE_STATUS_UNAVAILABLE } from '../utils/pipelineReport.js';

export default function PipelineStatus() {
  const { report, loading, error } = usePipelineReport();

  if (loading) {
    return (
      <aside className="pipeline-status pipeline-status--loading" aria-live="polite">
        Loading data status…
      </aside>
    );
  }

  if (error || !report) {
    return (
      <aside className="pipeline-status pipeline-status--unavailable" aria-live="polite">
        {error || PIPELINE_STATUS_UNAVAILABLE}
      </aside>
    );
  }

  const headline = buildHeadline(report);

  return (
    <aside className="pipeline-status" aria-label="Showtimes data status">
      <div className="pipeline-status-summary">{report.summaryLine}</div>
      {headline ? <div className="pipeline-status-headline">{headline}</div> : null}
      {report.generatedAtDisplay ? (
        <div className="pipeline-status-meta">Report generated {report.generatedAtDisplay}</div>
      ) : null}
      <ul className="pipeline-status-sources">
        {report.sources.map((source) => (
          <li
            key={source.key}
            className={`pipeline-status-source pipeline-status-source--${source.statusClass}`}
          >
            <span className="pipeline-status-source-label">{source.label}</span>
            <span className="pipeline-status-source-status">{source.statusLabel}</span>
            {source.detail ? (
              <span className="pipeline-status-source-detail"> — {source.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
