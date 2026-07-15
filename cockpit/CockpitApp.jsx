import { isAllowedCockpitHostname } from './isAllowedCockpitHostname.js';

function resolveHostname() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.hostname;
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
      <p className="cockpit-local-badge" role="status">
        Local development tool
      </p>
      <p className="cockpit-brand">Reel Seattle</p>
      <h1>Developer Data Cockpit</h1>
      <h2>Pipeline Health</h2>
      <p className="cockpit-note">
        Data loading will be added in a later task.
      </p>
    </main>
  );
}
