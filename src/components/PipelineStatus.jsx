import { useState } from 'react';
import { usePipelineReport } from '../hooks/usePipelineReport.js';
import { buildHeadline, PIPELINE_STATUS_UNAVAILABLE } from '../utils/pipelineReport.js';

export default function PipelineStatus() {
  const { report, loading, error } = usePipelineReport();
  const [detailsExpanded, setDetailsExpanded] = useState(false);

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
    <aside
      className={`pipeline-status${detailsExpanded ? ' pipeline-status--expanded' : ''}`}
      aria-label="Showtimes data status"
    >
      <div className="pipeline-status-compact-row">
        <div className="pipeline-status-summary">{report.summaryLine}</div>
        <button
          type="button"
          className="pipeline-status-toggle"
          aria-expanded={detailsExpanded}
          onClick={() => setDetailsExpanded((open) => !open)}
        >
          {detailsExpanded ? 'Hide' : 'Details'}
        </button>
      </div>
      <div className="pipeline-status-details">
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
              {source.warnings.length > 0 || source.errors.length > 0 ? (
                <div className="pipeline-status-source-diagnostics">
                  {source.warnings.map((warning, index) => (
                    <div
                      key={`warning-${index}`}
                      className="pipeline-status-source-note pipeline-status-source-note--warning"
                    >
                      <span className="pipeline-status-source-note-label">Warning:</span> {warning}
                    </div>
                  ))}
                  {source.warningsOverflow > 0 ? (
                    <div className="pipeline-status-source-note pipeline-status-source-note--more">
                      +{source.warningsOverflow} more warning
                      {source.warningsOverflow === 1 ? '' : 's'}
                    </div>
                  ) : null}
                  {source.errors.map((errorMessage, index) => (
                    <div
                      key={`error-${index}`}
                      className="pipeline-status-source-note pipeline-status-source-note--error"
                    >
                      <span className="pipeline-status-source-note-label">Error:</span>{' '}
                      {errorMessage}
                    </div>
                  ))}
                  {source.errorsOverflow > 0 ? (
                    <div className="pipeline-status-source-note pipeline-status-source-note--more">
                      +{source.errorsOverflow} more error
                      {source.errorsOverflow === 1 ? '' : 's'}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
