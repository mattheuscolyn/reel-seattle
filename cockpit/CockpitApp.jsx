import { useEffect, useState } from 'react';
import { isAllowedCockpitHostname } from './isAllowedCockpitHostname.js';
import PipelineHealthView from './PipelineHealthView.jsx';
import {
  loadPipelineReportOnce,
  PIPELINE_REPORT_REPO_PATH,
  PIPELINE_REPORT_URL,
} from './pipelineReportLoader.js';

function resolveHostname() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.hostname;
}

function CockpitHeader() {
  return (
    <header className="cockpit-header">
      <p className="cockpit-local-badge" role="status">
        Local development tool
      </p>
      <p className="cockpit-brand">Reel Seattle</p>
      <h1>Developer Data Cockpit</h1>
      <h2>Pipeline Health</h2>
    </header>
  );
}

export default function CockpitApp() {
  const hostname = resolveHostname();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAllowedCockpitHostname(hostname)) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    loadPipelineReportOnce()
      .then((artifact) => {
        if (!cancelled) {
          setReport(artifact);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setReport(null);
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hostname]);

  if (!isAllowedCockpitHostname(hostname)) {
    return (
      <main className="cockpit-blocked">
        <h1>Cockpit blocked</h1>
        <p>
          The Developer Data Cockpit is a local development tool and only runs on
          localhost.
        </p>
      </main>
    );
  }

  return (
    <main className="cockpit-shell">
      <CockpitHeader />

      {loading ? (
        <p className="cockpit-loading" role="status">
          Loading pipeline report…
        </p>
      ) : null}

      {!loading && error ? (
        <section className="cockpit-error" aria-labelledby="load-error-heading">
          <h2 id="load-error-heading">Unable to load pipeline report</h2>
          <p>{error}</p>
          <p>
            Expected artifact path: <code>{PIPELINE_REPORT_REPO_PATH}</code>
          </p>
          <p>
            Requested URL: <code>{PIPELINE_REPORT_URL}</code>
          </p>
          <p className="cockpit-secondary">
            The cockpit reads the committed local artifact. Refresh the page after
            updating <code>{PIPELINE_REPORT_REPO_PATH}</code>.
          </p>
        </section>
      ) : null}

      {!loading && !error && report ? <PipelineHealthView report={report} /> : null}
    </main>
  );
}
