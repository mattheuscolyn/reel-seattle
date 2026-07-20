#!/usr/bin/env node
/**
 * Verify production dist/ artifacts after `npm run build`.
 * Blocks shipping repo-only CSVs (history, announcements) or daily_logs/ to GitHub Pages.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

const REQUIRED_FILES = [
  '404.html',
  'data/showtimes_current.json',
  'data/pipeline_report.json',
  'data/newly_added_current.json',
  'data/theaters.json',
  'marathon/index.html',
];

const FORBIDDEN_PATHS = [
  'data/showtimes_history.csv',
  'data/movies_announcements.csv',
  'data/newly_announced.csv',
  'data/leaving_soon_current.json',
  'data/daily_logs',
  'data/source_catalog',
  'source_catalog/amc_movie_products.json',
  'source_catalog/amc_release_observations.json',
];

/**
 * Stable cockpit entry paths that must never ship in the public Pages build.
 * The developer cockpit uses a separate Vite config and must stay out of dist/.
 */
const FORBIDDEN_COCKPIT_PATHS = [
  'cockpit',
  'cockpit/index.html',
  'cockpit.html',
  'dev-cockpit',
  'dev-cockpit/index.html',
];

/**
 * Stable v2 prototype entry paths that must never ship in the public Pages build.
 * The isolated v2 shell uses a separate Vite config and must stay out of dist/.
 */
const FORBIDDEN_V2_PATHS = [
  'v2',
  'v2/index.html',
  'v2.html',
  'dist-v2',
  'dist-v2/index.html',
];

/** Total bytes under dist/data/ must stay well below accidental history CSV size (~75 MB). */
const MAX_DATA_DIR_BYTES = 5 * 1024 * 1024;

function fail(message) {
  console.error(`check_dist_artifacts: ${message}`);
  process.exit(1);
}

function dirSizeBytes(dirPath) {
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += dirSizeBytes(fullPath);
    } else {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function assertValidJson(relativePath) {
  const fullPath = join(DIST, relativePath);
  try {
    JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

if (!existsSync(DIST)) {
  fail('dist/ not found — run npm run build first');
}

const PUBLIC_HISTORY_COPY = join(ROOT, 'public/data/showtimes_history.csv');
if (existsSync(PUBLIC_HISTORY_COPY)) {
  fail(
    'obsolete public/data/showtimes_history.csv exists — remove it; canonical history is data/history/showtimes_history.csv',
  );
}

const PUBLIC_DAILY_LOGS = join(ROOT, 'public/data/daily_logs');
if (existsSync(PUBLIC_DAILY_LOGS)) {
  fail(
    'obsolete public/data/daily_logs/ exists — remove it; scrape JSON logs belong in data/daily_logs/',
  );
}

const CANONICAL_THEATERS = join(ROOT, 'data/theaters.json');
const PUBLIC_THEATERS = join(ROOT, 'public/data/theaters.json');
if (existsSync(CANONICAL_THEATERS) && existsSync(PUBLIC_THEATERS)) {
  const canonicalBytes = readFileSync(CANONICAL_THEATERS);
  const publicBytes = readFileSync(PUBLIC_THEATERS);
  if (!canonicalBytes.equals(publicBytes)) {
    fail(
      'public/data/theaters.json is out of sync with data/theaters.json — run python daily_processor.py',
    );
  }
}

for (const rel of REQUIRED_FILES) {
  const fullPath = join(DIST, rel);
  if (!existsSync(fullPath)) {
    fail(`missing required file: dist/${rel}`);
  }
  if (rel.endsWith('.json')) {
    assertValidJson(rel);
  }
}

for (const rel of FORBIDDEN_PATHS) {
  const fullPath = join(DIST, rel);
  if (existsSync(fullPath)) {
    fail(`forbidden artifact present: dist/${rel}`);
  }
}

for (const rel of FORBIDDEN_COCKPIT_PATHS) {
  const fullPath = join(DIST, rel);
  if (existsSync(fullPath)) {
    fail(`forbidden cockpit artifact present: dist/${rel}`);
  }
}

for (const rel of FORBIDDEN_V2_PATHS) {
  const fullPath = join(DIST, rel);
  if (existsSync(fullPath)) {
    fail(`forbidden v2 artifact present: dist/${rel}`);
  }
}

const distIndexHtml = join(DIST, 'index.html');
if (existsSync(distIndexHtml)) {
  const indexHtml = readFileSync(distIndexHtml, 'utf8');
  if (indexHtml.includes('Developer Data Cockpit') || indexHtml.includes('vite.cockpit.config')) {
    fail('dist/index.html appears to include the developer cockpit entry');
  }
  if (
    indexHtml.includes('v2 shell (local only)') ||
    indexHtml.includes('vite.v2.config') ||
    indexHtml.includes('Local-only v2 shell')
  ) {
    fail('dist/index.html appears to include the isolated v2 shell entry');
  }
}

const dataDir = join(DIST, 'data');
if (!existsSync(dataDir)) {
  fail('dist/data/ directory is missing');
}

const dataSize = dirSizeBytes(dataDir);
if (dataSize >= MAX_DATA_DIR_BYTES) {
  fail(
    `dist/data/ is ${formatBytes(dataSize)} (budget: ${formatBytes(MAX_DATA_DIR_BYTES)})`,
  );
}

console.log('check_dist_artifacts: OK');
console.log(`  dist/data/ size: ${formatBytes(dataSize)} (budget ${formatBytes(MAX_DATA_DIR_BYTES)})`);
for (const rel of REQUIRED_FILES) {
  const size = statSync(join(DIST, rel)).size;
  console.log(`  dist/${rel}: ${formatBytes(size)}`);
}

const dataEntries = readdirSync(dataDir, { withFileTypes: true })
  .map((entry) => {
    const rel = join('data', entry.name);
    const full = join(dataDir, entry.name);
    if (entry.isDirectory()) {
      return `${rel}/ (${formatBytes(dirSizeBytes(full))})`;
    }
    return `${rel} (${formatBytes(statSync(full).size)})`;
  })
  .sort();
console.log('  dist/data/ contents:');
for (const line of dataEntries) {
  console.log(`    ${line}`);
}
