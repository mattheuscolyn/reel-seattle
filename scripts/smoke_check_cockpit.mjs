#!/usr/bin/env node
/**
 * Smoke-check the isolated developer cockpit Vite server.
 * Starts `npm run cockpit`, fetches http://127.0.0.1:5174/, asserts shell copy, then stops.
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const COCKPIT_URL = 'http://127.0.0.1:5174/';
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 250;

const REQUIRED_SNIPPETS = [
  'Reel Seattle',
  'Developer Data Cockpit',
  'Pipeline Health',
  'Local development tool',
  'Data loading will be added in a later task',
];

function fail(message) {
  console.error(`smoke_check_cockpit: ${message}`);
  process.exit(1);
}

async function waitForCockpit(child) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode != null) {
      fail(`cockpit process exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(COCKPIT_URL);
      if (response.ok) {
        return response;
      }
    } catch {
      // Server not ready yet.
    }
    await delay(POLL_MS);
  }
  fail(`timed out waiting for ${COCKPIT_URL}`);
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode != null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());

    // On Windows, npm spawns a shell tree; kill the whole tree when possible.
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

const child = spawn('npm', ['run', 'cockpit'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  env: { ...process.env, FORCE_COLOR: '0' },
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const response = await waitForCockpit(child);
  const html = await response.text();

  // Vite serves the HTML shell; React content is mounted client-side.
  // Assert the entry document, then fetch the JSX module text for UI copy.
  if (!html.includes('/main.jsx') && !html.includes('main.jsx')) {
    fail('cockpit HTML did not reference main.jsx');
  }

  const moduleResponse = await fetch(new URL('/CockpitApp.jsx', COCKPIT_URL));
  if (!moduleResponse.ok) {
    fail(`failed to fetch CockpitApp.jsx (${moduleResponse.status})`);
  }
  const moduleSource = await moduleResponse.text();

  for (const snippet of REQUIRED_SNIPPETS) {
    if (!moduleSource.includes(snippet)) {
      fail(`missing expected cockpit copy: ${JSON.stringify(snippet)}`);
    }
  }

  const hostnameModule = await fetch(new URL('/isAllowedCockpitHostname.js', COCKPIT_URL));
  if (!hostnameModule.ok) {
    fail(`failed to fetch isAllowedCockpitHostname.js (${hostnameModule.status})`);
  }
  const hostnameSource = await hostnameModule.text();
  if (!hostnameSource.includes('localhost') || !hostnameSource.includes('127.0.0.1')) {
    fail('localhost guard module missing expected hostnames');
  }

  console.log('smoke_check_cockpit: OK');
  console.log(`  ${COCKPIT_URL}`);
  for (const snippet of REQUIRED_SNIPPETS) {
    console.log(`  found: ${snippet}`);
  }
} catch (error) {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await stopProcess(child);
}
