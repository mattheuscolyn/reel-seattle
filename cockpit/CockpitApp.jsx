import { useEffect, useState } from 'react';
import AmcSourceCatalogView from './AmcSourceCatalogView.jsx';
import FilmIdentityReviewView from './FilmIdentityReviewView.jsx';
import { isAllowedCockpitHostname } from './isAllowedCockpitHostname.js';
import PipelineHealthView from './PipelineHealthView.jsx';
import ShowtimesInspectionView from './ShowtimesInspectionView.jsx';
import TheaterRegistryView from './TheaterRegistryView.jsx';
import {
  loadPipelineReportOnce,
  PIPELINE_REPORT_REPO_PATH,
  PIPELINE_REPORT_URL,
} from './pipelineReportLoader.js';
import {
  loadTheaterRegistryOnce,
  THEATERS_REGISTRY_REPO_PATH,
  THEATERS_REGISTRY_URL,
} from './theaterRegistryLoader.js';

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
    </header>
  );
}

function PipelineHealthSection() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
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
  }, []);

  return (
    <section className="cockpit-section" aria-labelledby="pipeline-health-heading">
      <h2 id="pipeline-health-heading">Pipeline Health</h2>

      {loading ? (
        <p className="cockpit-loading" role="status">
          Loading pipeline report…
        </p>
      ) : null}

      {!loading && error ? (
        <div className="cockpit-error" role="alert">
          <h3>Unable to load pipeline report</h3>
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
        </div>
      ) : null}

      {!loading && !error && report ? <PipelineHealthView report={report} /> : null}
    </section>
  );
}

function TheaterRegistrySection() {
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadTheaterRegistryOnce()
      .then((artifact) => {
        if (!cancelled) {
          setRegistry(artifact);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRegistry(null);
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
  }, []);

  return (
    <section className="cockpit-section" aria-labelledby="theater-registry-heading">
      <h2 id="theater-registry-heading">Theater Registry</h2>

      {loading ? (
        <p className="cockpit-loading" role="status">
          Loading theater registry…
        </p>
      ) : null}

      {!loading && error ? (
        <div className="cockpit-error" role="alert">
          <h3>Unable to load theater registry</h3>
          <p>{error}</p>
          <p>
            Expected artifact path: <code>{THEATERS_REGISTRY_REPO_PATH}</code>
          </p>
          <p>
            Requested URL: <code>{THEATERS_REGISTRY_URL}</code>
          </p>
          <p className="cockpit-secondary">
            The cockpit reads the committed synchronized public artifact. Refresh
            after updating <code>{THEATERS_REGISTRY_REPO_PATH}</code>.
          </p>
        </div>
      ) : null}

      {!loading && !error && registry ? (
        <TheaterRegistryView registry={registry} />
      ) : null}
    </section>
  );
}

export default function CockpitApp() {
  const hostname = resolveHostname();

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
      <PipelineHealthSection />
      <TheaterRegistrySection />
      <AmcSourceCatalogView />
      <ShowtimesInspectionView />
      <FilmIdentityReviewView />
    </main>
  );
}
