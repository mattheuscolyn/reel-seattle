#!/usr/bin/env node
/**
 * Smoke-check a generic static server against `dist-v2` (no Vite data middleware).
 *
 * Proves T-V2-LAUNCH-DATA-01: allowlisted JSON is packaged into the build and
 * loadable without development-only serving.
 *
 * Prefer: npm run build:v2 && npm run smoke:v2:static
 * Or set SKIP_V2_BUILD=1 when dist-v2 is already fresh.
 */
import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import {
  listV2DataArtifacts,
  EXCLUDED_V2_DATA_PATHS,
} from '../v2/data/allowedDataRoutes.js';
import { buildHomeData } from '../v2/adapters/buildHomeData.js';
import { generateLivePlannerResults } from '../v2/planner/generateLivePlannerResults.js';
import { createLiveBuildPlanFormState } from '../v2/planner/createLiveBuildPlanFormState.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist-v2');
const HOST = '127.0.0.1';
const PORT = 4187;
const BASE = `http://${HOST}:${PORT}`;

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

function fail(message) {
  console.error(`smoke_check_v2_static: ${message}`);
  process.exit(1);
}

function runBuild() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', ['run', 'build:v2'], {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`build:v2 exited with code ${code}`));
    });
  });
}

function startStaticServer() {
  const rootNormalized = normalize(DIST + sep);
  const server = createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      if (relativePath.includes('..') || relativePath.includes('\0')) {
        res.writeHead(400).end('Bad path');
        return;
      }
      const filePath = resolve(DIST, relativePath);
      if (
        normalize(filePath) !== normalize(DIST) &&
        !normalize(filePath).startsWith(rootNormalized)
      ) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => resolvePromise(server));
  });
}

function assertDistDataArtifacts() {
  const dataDir = join(DIST, 'data');
  if (!existsSync(dataDir)) fail('dist-v2/data/ missing after build');

  const forbidden = [
    'showtimes_history.csv',
    '.env',
    'credentials.json',
  ];
  for (const name of forbidden) {
    if (existsSync(join(dataDir, name))) {
      fail(`forbidden artifact copied into dist-v2/data/: ${name}`);
    }
  }

  /** @type {Record<string, object>} */
  const loaded = {};
  for (const artifact of listV2DataArtifacts()) {
    const name = artifact.route.slice('/data/'.length);
    const full = join(dataDir, name);
    if (!existsSync(full)) {
      if (artifact.required) fail(`required data missing in dist: ${name}`);
      console.log(`  optional absent (ok): ${artifact.route}`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      fail(`${name} is not valid JSON: ${error.message}`);
    }
    if (parsed == null || typeof parsed !== 'object') {
      fail(`${name} must parse to a JSON object`);
    }
    const bytes = statSync(full).size;
    if (bytes <= 2) fail(`${name} is empty`);
    loaded[artifact.route] = parsed;
    console.log(
      `  ${relative(DIST, full)} (${bytes} bytes)`,
    );
  }

  const showtimes = loaded['/data/showtimes_current.json'];
  if (!Array.isArray(showtimes?.showtimes) || showtimes.showtimes.length === 0) {
    fail('showtimes_current.json must include a non-empty showtimes array');
  }
  if (!Array.isArray(showtimes?.films)) {
    fail('showtimes_current.json must include a films array');
  }

  for (const excluded of EXCLUDED_V2_DATA_PATHS) {
    const name = excluded.slice('/data/'.length);
    if (existsSync(join(dataDir, name))) {
      fail(`excluded path present in dist-v2/data: ${excluded}`);
    }
  }

  return loaded;
}

async function verifyHttpDataRoutes() {
  for (const artifact of listV2DataArtifacts()) {
    const response = await fetch(`${BASE}${artifact.route}`);
    if (artifact.required && !response.ok) {
      fail(`required ${artifact.route} → HTTP ${response.status}`);
    }
    if (response.ok) {
      const json = await response.json();
      if (json == null || typeof json !== 'object') {
        fail(`${artifact.route} response is not a JSON object`);
      }
      console.log(`  GET ${artifact.route} → 200`);
    } else if (!artifact.required) {
      console.log(`  GET ${artifact.route} → ${response.status} (optional)`);
    }
  }

  const blocked = await fetch(`${BASE}/data/showtimes_history.csv`);
  if (blocked.status !== 404) {
    fail(`showtimes_history.csv should be 404 from static dist, got ${blocked.status}`);
  }
}

async function verifyAppAndPlanner(loaded) {
  const theaters = loaded['/data/theaters.json'] ?? null;
  const newlyAdded = loaded['/data/newly_added_current.json'] ?? null;
  const pipeline = loaded['/data/pipeline_report.json'] ?? null;
  const homeData = buildHomeData({
    showtimesCurrent: loaded['/data/showtimes_current.json'],
    theatersRegistry: theaters,
    newlyAdded,
    pipelineReport: pipeline,
  });
  if (!Array.isArray(homeData.opportunities) || homeData.opportunities.length === 0) {
    fail('HomeData opportunities empty from packaged artifacts');
  }
  console.log(`  HomeData opportunities: ${homeData.opportunities.length}`);

  const form = createLiveBuildPlanFormState();
  const generated = generateLivePlannerResults({
    homeData,
    form,
    sortId: 'best-match',
  });
  if (!generated.ok) {
    fail(`planner generation failed: ${generated.message ?? generated.error}`);
  }
  // Non-zero opportunities is required; plans may be zero on sparse days —
  // only require plans when the engine has enough same-theater candidates.
  console.log(`  planner plans: ${generated.plans.length}`);
  if (homeData.opportunities.length > 50 && generated.plans.length === 0) {
    fail('expected at least one planner result given dense showtimes window');
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    if (/Showtimes aren’t loaded yet|Showtimes aren't loaded yet/i.test(body)) {
      fail('UI shows empty-data failure on static dist-v2');
    }
    if (!/REEL|Explore|Planner|Home/i.test(body)) {
      fail('static app shell did not render expected chrome');
    }
    console.log('  UI: no empty-data failure banner');

    // Network: showtimes must have been requested successfully.
    const showtimesOk = await page.evaluate(async () => {
      const r = await fetch('/data/showtimes_current.json');
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      return {
        ok: true,
        status: r.status,
        count: Array.isArray(j.showtimes) ? j.showtimes.length : 0,
      };
    });
    if (!showtimesOk.ok || showtimesOk.count < 1) {
      fail(`browser fetch showtimes failed: ${JSON.stringify(showtimesOk)}`);
    }
    console.log(`  browser showtimes fetch: ${showtimesOk.count} rows`);
  } finally {
    await browser.close();
  }
}

if (!existsSync(join(ROOT, 'package.json'))) {
  fail('must run from repo root context');
}

try {
  if (process.env.SKIP_V2_BUILD === '1') {
    console.log('smoke_check_v2_static: SKIP_V2_BUILD=1 — using existing dist-v2');
  } else {
    console.log('smoke_check_v2_static: building v2…');
    await runBuild();
  }

  if (!existsSync(join(DIST, 'index.html'))) {
    fail('dist-v2/index.html missing — run npm run build:v2');
  }

  console.log('smoke_check_v2_static: dist-v2/data artifacts');
  const loaded = assertDistDataArtifacts();

  const server = await startStaticServer();
  try {
    await delay(100);
    console.log(`smoke_check_v2_static: static server ${BASE}`);
    await verifyHttpDataRoutes();
    await verifyAppAndPlanner(loaded);
  } finally {
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  }

  console.log(`smoke_check_v2_static: ok (${BASE})`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
