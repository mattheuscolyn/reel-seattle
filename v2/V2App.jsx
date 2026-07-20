import { useState } from 'react';
import DestinationPlaceholder from './DestinationPlaceholder.jsx';
import PrimaryNav from './PrimaryNav.jsx';
import {
  INITIAL_DESTINATION_ID,
  resolveDestinationId,
} from './destinations.js';
import { isAllowedV2Hostname } from './isAllowedV2Hostname.js';

function resolveHostname() {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.hostname;
}

function LocalOnlyBadge() {
  return (
    <p className="v2-local-badge" role="status">
      Local-only v2 shell · not deployed to GitHub Pages
    </p>
  );
}

export default function V2App() {
  const hostname = resolveHostname();
  const [activeDestinationId, setActiveDestinationId] = useState(
    INITIAL_DESTINATION_ID,
  );

  if (!isAllowedV2Hostname(hostname)) {
    return (
      <main className="v2-blocked">
        <h1>v2 shell blocked</h1>
        <p>
          The Reel Seattle v2 application shell is a local development prototype
          and only runs on localhost.
        </p>
      </main>
    );
  }

  const destinationId = resolveDestinationId(activeDestinationId);

  return (
    <div className="v2-shell">
      <div className="v2-top">
        <header className="v2-header">
          <LocalOnlyBadge />
          <p className="v2-brand">Reel Seattle</p>
          <p className="v2-subtitle">v2 application shell</p>
        </header>
        <PrimaryNav
          activeDestinationId={destinationId}
          onSelectDestination={setActiveDestinationId}
        />
      </div>

      <main className="v2-main" id="v2-main">
        <DestinationPlaceholder destinationId={destinationId} />
      </main>
    </div>
  );
}
