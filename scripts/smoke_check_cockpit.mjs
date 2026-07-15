#!/usr/bin/env node
/**
 * Smoke-check the isolated developer cockpit Vite server.
 * Starts `npm run cockpit`, verifies UI modules + allowed data routes, then stops.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COCKPIT_URL = 'http://127.0.0.1:5174/';
const REPORT_URL = new URL('/data/pipeline_report.json', COCKPIT_URL);
const THEATERS_URL = new URL('/data/theaters.json', COCKPIT_URL);
const UNSUPPORTED_DATA_URL = new URL('/data/showtimes_current.json', COCKPIT_URL);
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 250;

const REQUIRED_MODULE_SNIPPETS = [
  'Reel Seattle',
  'Developer Data Cockpit',
  'Pipeline Health',
  'Theater Registry',
  'Local development tool',
  'Generated',
  'Per-source health',
  'Statuses are displayed exactly as emitted',
  'Enabled',
  'Disabled',
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

  if (!html.includes('/main.jsx') && !html.includes('main.jsx')) {
    fail('cockpit HTML did not reference main.jsx');
  }

  const modulePaths = [
    '/CockpitApp.jsx',
    '/PipelineHealthView.jsx',
    '/pipelineHealthFormat.js',
    '/TheaterRegistryView.jsx',
    '/theaterRegistryFormat.js',
    '/isAllowedCockpitHostname.js',
  ];

  const moduleSources = [];
  for (const modulePath of modulePaths) {
    const moduleResponse = await fetch(new URL(modulePath, COCKPIT_URL));
    if (!moduleResponse.ok) {
      fail(`failed to fetch ${modulePath} (${moduleResponse.status})`);
    }
    moduleSources.push(await moduleResponse.text());
  }
  const combinedUi = moduleSources.join('\n');

  for (const snippet of REQUIRED_MODULE_SNIPPETS) {
    if (!combinedUi.includes(snippet)) {
      fail(`missing expected cockpit copy: ${JSON.stringify(snippet)}`);
    }
  }

  const reportResponse = await fetch(REPORT_URL);
  if (!reportResponse.ok) {
    fail(`pipeline report endpoint HTTP ${reportResponse.status}`);
  }
  const report = await reportResponse.json();
  const reportOnDisk = JSON.parse(
    readFileSync(join(ROOT, 'public/data/pipeline_report.json'), 'utf8'),
  );
  if (report.generated_at !== reportOnDisk.generated_at) {
    fail('served pipeline report does not match committed artifact');
  }

  const theatersResponse = await fetch(THEATERS_URL);
  if (!theatersResponse.ok) {
    fail(`theaters registry endpoint HTTP ${theatersResponse.status}`);
  }
  const contentType = theatersResponse.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    fail(`theaters endpoint content-type was ${contentType}, expected JSON`);
  }

  let theaters;
  try {
    theaters = await theatersResponse.json();
  } catch (error) {
    fail(`theaters registry JSON parse failed: ${error.message}`);
  }

  const theatersOnDisk = JSON.parse(
    readFileSync(join(ROOT, 'public/data/theaters.json'), 'utf8'),
  );
  if (!Array.isArray(theaters.theaters) || theaters.theaters.length === 0) {
    fail('served theaters registry missing theaters array');
  }
  if (theaters.updated_at !== theatersOnDisk.updated_at) {
    fail('served theaters.json does not match committed public/data/theaters.json');
  }
  if (theaters.theaters.length !== theatersOnDisk.theaters.length) {
    fail('served theaters count does not match committed artifact');
  }

  const sampleTheater = theaters.theaters[0];
  if (!sampleTheater?.name || !sampleTheater?.source) {
    fail('first theater missing name/source for dynamic smoke assertion');
  }
  if (!combinedUi.includes('Theater Registry')) {
    fail('UI missing Theater Registry heading');
  }
  // Dynamic committed-data checks against UI modules (format/view include field labels).
  if (!combinedUi.includes('source_external_id')) {
    fail('registry UI missing source_external_id column');
  }

  const unsupported = await fetch(UNSUPPORTED_DATA_URL);
  if (unsupported.status !== 404) {
    fail(
      `unsupported path ${UNSUPPORTED_DATA_URL.pathname} returned HTTP ${unsupported.status}, expected 404`,
    );
  }
  const unsupportedBody = await unsupported.text();
  if (unsupportedBody.includes('<!doctype html') || unsupportedBody.includes('<html')) {
    fail('unsupported /data path returned HTML instead of a plain 404');
  }
  try {
    JSON.parse(unsupportedBody);
    fail('unsupported /data path unexpectedly returned JSON');
  } catch {
    // Expected: not JSON.
  }

  console.log('smoke_check_cockpit: OK');
  console.log(`  ${COCKPIT_URL}`);
  console.log(`  served ${REPORT_URL.pathname} (status=${report.status})`);
  console.log(
    `  served ${THEATERS_URL.pathname} (${theaters.theaters.length} theaters; sample=${sampleTheater.name} / ${sampleTheater.source})`,
  );
  console.log(`  blocked ${UNSUPPORTED_DATA_URL.pathname} with HTTP ${unsupported.status}`);
  for (const snippet of REQUIRED_MODULE_SNIPPETS) {
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
