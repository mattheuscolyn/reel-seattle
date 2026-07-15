#!/usr/bin/env node
/**
 * Smoke-check the isolated developer cockpit Vite server.
 * Starts `npm run cockpit`, verifies shell modules + live pipeline_report.json, then stops.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COCKPIT_URL = 'http://127.0.0.1:5174/';
const REPORT_URL = new URL('/data/pipeline_report.json', COCKPIT_URL);
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 250;

const REQUIRED_MODULE_SNIPPETS = [
  'Reel Seattle',
  'Developer Data Cockpit',
  'Pipeline Health',
  'Local development tool',
  'Generated',
  'Per-source health',
  'Statuses are displayed exactly as emitted',
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

  if (!html.includes('/main.jsx') && !html.includes('main.jsx')) {
    fail('cockpit HTML did not reference main.jsx');
  }

  const appResponse = await fetch(new URL('/CockpitApp.jsx', COCKPIT_URL));
  if (!appResponse.ok) {
    fail(`failed to fetch CockpitApp.jsx (${appResponse.status})`);
  }
  const appSource = await appResponse.text();

  const viewResponse = await fetch(new URL('/PipelineHealthView.jsx', COCKPIT_URL));
  if (!viewResponse.ok) {
    fail(`failed to fetch PipelineHealthView.jsx (${viewResponse.status})`);
  }
  const viewSource = await viewResponse.text();

  const formatResponse = await fetch(new URL('/pipelineHealthFormat.js', COCKPIT_URL));
  if (!formatResponse.ok) {
    fail(`failed to fetch pipelineHealthFormat.js (${formatResponse.status})`);
  }
  const formatSource = await formatResponse.text();
  const combinedUi = `${appSource}\n${viewSource}\n${formatSource}`;

  for (const snippet of REQUIRED_MODULE_SNIPPETS) {
    if (!combinedUi.includes(snippet)) {
      fail(`missing expected cockpit copy: ${JSON.stringify(snippet)}`);
    }
  }

  if (combinedUi.includes('Data loading will be added in a later task')) {
    fail('placeholder copy should be removed now that pipeline loading exists');
  }

  const labelHints = ['AMC', 'SIFF', 'Beacon'];
  if (!labelHints.some((hint) => combinedUi.includes(hint))) {
    fail('UI/format modules missing known source labels');
  }
  if (!formatSource.includes("'amc'") && !formatSource.includes('"amc"')) {
    fail('format module missing amc source key');
  }

  const hostnameModule = await fetch(new URL('/isAllowedCockpitHostname.js', COCKPIT_URL));
  if (!hostnameModule.ok) {
    fail(`failed to fetch isAllowedCockpitHostname.js (${hostnameModule.status})`);
  }
  const hostnameSource = await hostnameModule.text();
  if (!hostnameSource.includes('localhost') || !hostnameSource.includes('127.0.0.1')) {
    fail('localhost guard module missing expected hostnames');
  }

  const reportResponse = await fetch(REPORT_URL);
  if (!reportResponse.ok) {
    fail(`pipeline report endpoint HTTP ${reportResponse.status}`);
  }

  let report;
  try {
    report = await reportResponse.json();
  } catch (error) {
    fail(`pipeline report JSON parse failed: ${error.message}`);
  }

  const onDisk = JSON.parse(
    readFileSync(join(ROOT, 'public/data/pipeline_report.json'), 'utf8'),
  );

  if (report.status == null || typeof report.status !== 'string') {
    fail('served pipeline report missing status');
  }
  if (!report.sources || typeof report.sources !== 'object') {
    fail('served pipeline report missing sources');
  }
  if (!report.sources.amc && !report.sources.siff && !report.sources.beacon) {
    fail('served pipeline report has no known sources');
  }
  if (report.generated_at !== onDisk.generated_at) {
    fail('served pipeline report does not match committed public/data/pipeline_report.json');
  }
  if (report.totals?.showtime_count !== onDisk.totals?.showtime_count) {
    fail('served totals.showtime_count does not match committed artifact');
  }

  const sourceKeys = Object.keys(report.sources);
  if (!sourceKeys.some((key) => ['amc', 'siff', 'beacon'].includes(key))) {
    fail('no known source key in served report');
  }

  if (!viewSource.includes('totals.showtime_count')) {
    fail('PipelineHealthView missing totals.showtime_count field label');
  }

  console.log('smoke_check_cockpit: OK');
  console.log(`  ${COCKPIT_URL}`);
  console.log(`  served ${REPORT_URL.pathname} (status=${report.status})`);
  console.log(`  sources: ${sourceKeys.join(', ')}`);
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
