#!/usr/bin/env node
/**
 * Smoke-check the isolated v2 Vite shell.
 * Starts `npm run v2`, verifies entry HTML + canonical destinations module.
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const V2_URL = 'http://127.0.0.1:5175/';
const READY_TIMEOUT_MS = 45_000;
const POLL_MS = 250;

const CANONICAL_LABELS = ['Home', 'Explore', 'Planner', 'Profile'];
const REJECTED_LABELS = ['Movies', 'Theaters', 'Me'];

function fail(message) {
  console.error(`smoke_check_v2: ${message}`);
  process.exit(1);
}

async function waitForV2(child) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode != null) {
      fail(`v2 process exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(V2_URL);
      if (response.ok) {
        return response;
      }
    } catch {
      // Server not ready yet.
    }
    await delay(POLL_MS);
  }
  fail(`timed out waiting for ${V2_URL}`);
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode != null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());

    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      }).once('exit', () => resolve());
      setTimeout(() => resolve(), 5_000).unref();
      return;
    }

    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode == null) {
        child.kill('SIGKILL');
      }
    }, 3_000).unref();
  });
}

const child = spawn('npm', ['run', 'v2'], {
  cwd: ROOT,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const response = await waitForV2(child);
  const html = await response.text();
  if (!html.includes('Reel Seattle — v2 shell (local only)')) {
    fail('index HTML title marker missing');
  }
  if (!html.includes('/main.jsx')) {
    fail('v2 main entry script missing from index.html');
  }

  const destinationsResponse = await fetch(new URL('/destinations.js', V2_URL));
  if (!destinationsResponse.ok) {
    fail(`failed to fetch destinations.js: ${destinationsResponse.status}`);
  }
  const destinationsSource = await destinationsResponse.text();

  for (const label of CANONICAL_LABELS) {
    if (
      !destinationsSource.includes(`label: '${label}'`) &&
      !destinationsSource.includes(`label: "${label}"`)
    ) {
      fail(`canonical label missing from destinations.js: ${label}`);
    }
  }

  for (const rejected of REJECTED_LABELS) {
    if (
      destinationsSource.includes(`label: '${rejected}'`) ||
      destinationsSource.includes(`label: "${rejected}"`)
    ) {
      fail(`rejected primary label present: ${rejected}`);
    }
  }

  if (!destinationsSource.includes("INITIAL_DESTINATION_ID = 'home'")) {
    fail('INITIAL_DESTINATION_ID is not home');
  }

  const appResponse = await fetch(new URL('/V2App.jsx', V2_URL));
  if (!appResponse.ok) {
    fail(`failed to fetch V2App.jsx: ${appResponse.status}`);
  }
  const appSource = await appResponse.text();
  if (!appSource.includes('isAllowedV2Hostname')) {
    fail('V2App missing localhost hostname guard');
  }
  if (!appSource.includes('Local-only v2 shell')) {
    fail('V2App missing local-only status badge copy');
  }

  const showtimesData = await fetch(new URL('/data/showtimes_current.json', V2_URL));
  if (!showtimesData.ok) {
    fail(`showtimes_current.json not served: ${showtimesData.status}`);
  }
  const showtimesJson = await showtimesData.json();
  if (!Array.isArray(showtimesJson.showtimes)) {
    fail('showtimes_current.json missing showtimes array');
  }

  const newlyAddedData = await fetch(new URL('/data/newly_added_current.json', V2_URL));
  if (!newlyAddedData.ok) {
    fail(`newly_added_current.json not served: ${newlyAddedData.status}`);
  }

  const leavingSoon = await fetch(new URL('/data/leaving_soon_current.json', V2_URL));
  if (leavingSoon.status !== 404) {
    fail(`leaving_soon_current.json should be unsupported (404), got ${leavingSoon.status}`);
  }

  const homeStatusResponse = await fetch(new URL('/HomeDataStatus.jsx', V2_URL));
  if (!homeStatusResponse.ok) {
    fail(`failed to fetch HomeDataStatus.jsx: ${homeStatusResponse.status}`);
  }
  const homeStatusSource = await homeStatusResponse.text();
  if (!homeStatusSource.includes('Development data status (I-02)')) {
    fail('HomeDataStatus missing I-02 development status label');
  }

  console.log(`smoke_check_v2: ok (${V2_URL})`);
} catch (error) {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await stopProcess(child);
}
