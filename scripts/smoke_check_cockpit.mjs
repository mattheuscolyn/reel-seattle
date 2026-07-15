#!/usr/bin/env node
/**
 * Smoke-check the isolated developer cockpit Vite server.
 * Starts `npm run cockpit`, verifies UI modules + allowlisted data routes + lazy showtimes boundary.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COCKPIT_URL = 'http://127.0.0.1:5174/';
const REPORT_URL = new URL('/data/pipeline_report.json', COCKPIT_URL);
const THEATERS_URL = new URL('/data/theaters.json', COCKPIT_URL);
const SHOWTIMES_URL = new URL('/data/showtimes_current.json', COCKPIT_URL);
const UNSUPPORTED_DATA_URL = new URL('/data/newly_added_current.json', COCKPIT_URL);
const READY_TIMEOUT_MS = 45_000;
const POLL_MS = 250;

const REQUIRED_MODULE_SNIPPETS = [
  'Reel Seattle',
  'Developer Data Cockpit',
  'Pipeline Health',
  'Theater Registry',
  'Showtime Inspection',
  'Local development tool',
  'Load showtimes for selection',
  'Apply selection',
  'Showtime ID',
  'First seen',
  'Duplicate ID observation',
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

function readRequestLog(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const tempDir = mkdtempSync(join(tmpdir(), 'reel-cockpit-smoke-'));
const requestLogPath = join(tempDir, 'data-requests.log');

const child = spawn('npm', ['run', 'cockpit'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  env: {
    ...process.env,
    FORCE_COLOR: '0',
    COCKPIT_DATA_REQUEST_LOG: requestLogPath,
  },
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

  // Warm UI modules that should load without showtimes_current.json.
  const modulePaths = [
    '/CockpitApp.jsx',
    '/PipelineHealthView.jsx',
    '/TheaterRegistryView.jsx',
    '/ShowtimesInspectionView.jsx',
    '/showtimesInspectionFormat.js',
    '/showtimesCurrentLoader.js',
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

  // Pipeline + theaters (allowed) — expected for other sections / inspection controls.
  const reportResponse = await fetch(REPORT_URL);
  if (!reportResponse.ok) {
    fail(`pipeline report endpoint HTTP ${reportResponse.status}`);
  }
  const report = await reportResponse.json();

  const theatersResponse = await fetch(THEATERS_URL);
  if (!theatersResponse.ok) {
    fail(`theaters endpoint HTTP ${theatersResponse.status}`);
  }
  const theaters = await theatersResponse.json();

  // Lazy-load boundary: showtimes must not have been requested yet by shell/module warm-up.
  await delay(300);
  const earlyLog = readRequestLog(requestLogPath);
  if (earlyLog.includes('/data/showtimes_current.json')) {
    fail(
      'showtimes_current.json was requested before an explicit smoke fetch (lazy-load boundary broken)',
    );
  }

  const showtimesResponse = await fetch(SHOWTIMES_URL);
  if (!showtimesResponse.ok) {
    fail(`showtimes endpoint HTTP ${showtimesResponse.status}`);
  }
  const showtimesContentType = showtimesResponse.headers.get('content-type') || '';
  if (!showtimesContentType.includes('application/json')) {
    fail(`showtimes content-type was ${showtimesContentType}`);
  }
  const showtimes = await showtimesResponse.json();
  if (!Array.isArray(showtimes.showtimes) || showtimes.showtimes.length === 0) {
    fail('showtimes artifact missing showtimes array');
  }

  const lateLog = readRequestLog(requestLogPath);
  if (!lateLog.includes('/data/showtimes_current.json')) {
    fail('request log missing showtimes_current.json after explicit fetch');
  }

  const unsupported = await fetch(UNSUPPORTED_DATA_URL);
  if (unsupported.status !== 404) {
    fail(
      `unsupported path ${UNSUPPORTED_DATA_URL.pathname} returned HTTP ${unsupported.status}`,
    );
  }
  const unsupportedBody = await unsupported.text();
  if (unsupportedBody.includes('<html') || unsupportedBody.includes('<!doctype')) {
    fail('unsupported /data path returned HTML');
  }

  const onDiskShowtimes = JSON.parse(
    readFileSync(join(ROOT, 'public/data/showtimes_current.json'), 'utf8'),
  );
  if (showtimes.generated_at !== onDiskShowtimes.generated_at) {
    fail('served showtimes_current.json does not match committed artifact');
  }

  const sample = onDiskShowtimes.showtimes[0];
  if (!sample?.theater_id || !sample?.date || !sample?.film_title) {
    fail('could not pick a dynamic sample showtime');
  }
  const theater = (theaters.theaters || []).find((entry) => entry.id === sample.theater_id);
  if (!theater?.name) {
    fail(`registry missing sample theater ${sample.theater_id}`);
  }

  console.log('smoke_check_cockpit: OK');
  console.log(`  ${COCKPIT_URL}`);
  console.log(`  served ${REPORT_URL.pathname} (status=${report.status})`);
  console.log(`  served ${THEATERS_URL.pathname} (${theaters.theaters.length} theaters)`);
  console.log(
    `  served ${SHOWTIMES_URL.pathname} after explicit fetch (${showtimes.showtimes.length} showtimes)`,
  );
  console.log(
    `  dynamic slice sample: ${theater.name} / ${sample.date} / ${sample.film_title}`,
  );
  console.log(`  blocked ${UNSUPPORTED_DATA_URL.pathname} with HTTP ${unsupported.status}`);
  console.log('  lazy-load: no showtimes request before explicit fetch');
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
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
}
