import {
  buildAmcCatalogHealthSummary,
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

function CatalogHealthSection({ catalog }) {
  if (!catalog) {
    return (
      <section className="cockpit-source" aria-labelledby="amc-catalog-health-heading">
        <h3 id="amc-catalog-health-heading">AMC source catalog</h3>
        <p className="cockpit-empty">
          No <code>amc_source_catalog</code> section in this report (catalog stage
          may not have run yet).
        </p>
      </section>
    );
  }

  const products = catalog.productsSummary || {};
  const releases = catalog.releasesSummary || {};

  return (
    <section className="cockpit-source" aria-labelledby="amc-catalog-health-heading">
      <h3 id="amc-catalog-health-heading">
        AMC source catalog{' '}
        <span className="cockpit-source-key">(amc_source_catalog)</span>
      </h3>
      <dl className="cockpit-dl">
        <div>
          <dt>status</dt>
          <dd>
            <code>{catalog.status}</code>
          </dd>
        </div>
        <div>
          <dt>outcome</dt>
          <dd>
            <code>{catalog.outcome}</code>
          </dd>
        </div>
        <div>
          <dt>build_attempted / build_succeeded</dt>
          <dd>
            {String(catalog.buildAttempted)} / {String(catalog.buildSucceeded)}
          </dd>
        </div>
        <div>
          <dt>soft_failure</dt>
          <dd>{String(catalog.softFailure)}</dd>
        </div>
        <div>
          <dt>artifacts_written_this_run</dt>
          <dd>{String(catalog.artifactsWrittenThisRun)}</dd>
        </div>
        <div>
          <dt>artifacts_retained_from_prior</dt>
          <dd>{String(catalog.artifactsRetainedFromPrior)}</dd>
        </div>
        <div>
          <dt>last_successful_build_at</dt>
          <dd>
            <code>{catalog.lastSuccessfulBuildAt.raw}</code>
            {catalog.lastSuccessfulBuildAt.readable ? (
              <span className="cockpit-secondary">
                {' '}
                ({catalog.lastSuccessfulBuildAt.readable})
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>products</dt>
          <dd>
            total {formatMissingScalar(products.total)} · active{' '}
            {formatMissingScalar(products.active)} · inactive{' '}
            {formatMissingScalar(products.inactive)}
          </dd>
        </div>
        <div>
          <dt>releases</dt>
          <dd>
            total {formatMissingScalar(releases.total)} · singleton{' '}
            {formatMissingScalar(releases.singleton_groups)} · multi-product{' '}
            {formatMissingScalar(releases.multi_product_groups)}
          </dd>
        </div>
        <div>
          <dt>message</dt>
          <dd>{catalog.message}</dd>
        </div>
      </dl>
      <DiagnosticList label="warnings" items={catalog.warnings} />
      <DiagnosticList label="errors" items={catalog.errors} />
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
  const catalog = buildAmcCatalogHealthSummary(report);
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

      <section className="cockpit-sources" aria-labelledby="catalog-health-heading">
        <h2 id="catalog-health-heading">AMC catalog health</h2>
        <CatalogHealthSection catalog={catalog} />
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
          errors do not automatically change a source status. Catalog{' '}
          <code>stale</code> means prior valid artifacts were retained after a
          soft failure — not a fresh successful rewrite. This cockpit does not
          reinterpret pipeline health.
        </p>
        <p className="cockpit-secondary">
          Artifact: <code>{PIPELINE_REPORT_REPO_PATH}</code>
        </p>
      </aside>
    </div>
  );
}
