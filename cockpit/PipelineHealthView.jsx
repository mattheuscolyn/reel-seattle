import {
  buildSourceHealthRows,
  formatEmittedStatus,
  formatMissingScalar,
  formatTimestamp,
  listDiagnostics,
} from './pipelineHealthFormat.js';
import { PIPELINE_REPORT_REPO_PATH } from './pipelineReportLoader.js';

function DiagnosticList({ label, items }) {
  const messages = listDiagnostics(items);

  return (
    <div className="cockpit-diagnostics">
      <h4>{label}</h4>
      {messages.length === 0 ? (
        <p className="cockpit-empty">None</p>
      ) : (
        <ul>
          {messages.map((message, index) => (
            <li key={`${label}-${index}`}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceSection({ source }) {
  return (
    <section className="cockpit-source" aria-labelledby={`source-${source.key}`}>
      <h3 id={`source-${source.key}`}>
        {source.label} <span className="cockpit-source-key">({source.key})</span>
      </h3>
      <dl className="cockpit-dl">
        <div>
          <dt>status</dt>
          <dd>
            <code>{source.status}</code>
          </dd>
        </div>
        <div>
          <dt>showtime_count</dt>
          <dd>{source.showtimeCount}</dd>
        </div>
        <div>
          <dt>film_count</dt>
          <dd>{source.filmCount}</dd>
        </div>
        <div>
          <dt>theater_count</dt>
          <dd>{source.theaterCount}</dd>
        </div>
        <div>
          <dt>last_successful_run</dt>
          <dd>{source.lastSuccessfulRun}</dd>
        </div>
      </dl>
      <DiagnosticList label="warnings" items={source.warnings} />
      <DiagnosticList label="errors" items={source.errors} />
    </section>
  );
}

/**
 * Read-only Pipeline Health presentation for a loaded pipeline_report.json.
 * Displays emitted statuses as-is; does not reinterpret health.
 */
export default function PipelineHealthView({ report }) {
  const generated = formatTimestamp(report?.generated_at);
  const sources = buildSourceHealthRows(report);
  const messages = listDiagnostics(report?.messages);
  const totals = report?.totals && typeof report.totals === 'object' ? report.totals : {};
  const windowRange =
    report?.window && typeof report.window === 'object' ? report.window : {};

  return (
    <div className="cockpit-health">
      <section className="cockpit-summary" aria-labelledby="report-summary-heading">
        <h2 id="report-summary-heading">Report summary</h2>
        <dl className="cockpit-dl">
          <div>
            <dt>status</dt>
            <dd>
              <code>{formatEmittedStatus(report?.status)}</code>
            </dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>
              <span>{generated.raw}</span>
              {generated.readable ? (
                <span className="cockpit-secondary"> ({generated.readable})</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>window.start_date</dt>
            <dd>{formatMissingScalar(windowRange.start_date)}</dd>
          </div>
          <div>
            <dt>window.end_date</dt>
            <dd>{formatMissingScalar(windowRange.end_date)}</dd>
          </div>
          <div>
            <dt>totals.showtime_count</dt>
            <dd>{formatMissingScalar(totals.showtime_count)}</dd>
          </div>
          <div>
            <dt>totals.film_count</dt>
            <dd>{formatMissingScalar(totals.film_count)}</dd>
          </div>
          <div>
            <dt>totals.theater_count</dt>
            <dd>{formatMissingScalar(totals.theater_count)}</dd>
          </div>
        </dl>
      </section>

      <section className="cockpit-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Per-source health</h2>
        {sources.length === 0 ? (
          <p className="cockpit-empty">No sources in report.</p>
        ) : (
          sources.map((source) => <SourceSection key={source.key} source={source} />)
        )}
      </section>

      <section className="cockpit-messages" aria-labelledby="messages-heading">
        <h2 id="messages-heading">messages</h2>
        {messages.length === 0 ? (
          <p className="cockpit-empty">None</p>
        ) : (
          <ul>
            {messages.map((message, index) => (
              <li key={`message-${index}`}>{message}</li>
            ))}
          </ul>
        )}
      </section>

      <aside className="cockpit-semantics-note" aria-label="Status semantics">
        <p>
          Statuses are displayed exactly as emitted by the pipeline. Warnings and
          errors do not automatically change a source status. This cockpit does
          not reinterpret pipeline health.
        </p>
        <p className="cockpit-secondary">
          Artifact: <code>{PIPELINE_REPORT_REPO_PATH}</code>
        </p>
      </aside>
    </div>
  );
}
