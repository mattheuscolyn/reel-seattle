#!/usr/bin/env node
/**
 * Verify dist-v2 artifacts after `npm run build:v2` (Pages v2 deploy gate).
 * Does not require Vite middleware.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listV2DataArtifacts,
  EXCLUDED_V2_DATA_PATHS,
} from '../v2/data/allowedDataRoutes.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist-v2');

const REQUIRED_FILES = [
  'index.html',
  'CNAME',
  '404.html',
  ...listV2DataArtifacts()
    .filter((a) => a.required)
    .map((a) => a.route.replace(/^\//, '')),
];

const FORBIDDEN_PATHS = [
  'data/showtimes_history.csv',
  'data/daily_logs',
  'data/leaving_soon_current.json',
  'cockpit',
  'cockpit.html',
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(relative(DIST, p).replace(/\\/g, '/'));
  }
  return out;
}

function fail(message) {
  console.error(`check_dist_v2_artifacts: ${message}`);
  process.exit(1);
}

if (!existsSync(DIST)) {
  fail(`missing ${DIST} — run npm run build:v2 first`);
}

const files = new Set(walk(DIST));

for (const req of REQUIRED_FILES) {
  if (!files.has(req) && !existsSync(join(DIST, req))) {
    fail(`required file missing: ${req}`);
  }
}

for (const forbidden of [...FORBIDDEN_PATHS, ...EXCLUDED_V2_DATA_PATHS.map((p) => p.replace(/^\//, ''))]) {
  const abs = join(DIST, forbidden);
  if (existsSync(abs)) {
    fail(`forbidden path shipped in dist-v2: ${forbidden}`);
  }
}

const cnamePath = join(DIST, 'CNAME');
const cname = readFileSync(cnamePath, 'utf8').trim();
if (cname !== 'www.reelseattle.com') {
  fail(`CNAME must be www.reelseattle.com (got ${JSON.stringify(cname)})`);
}

const showtimesPath = join(DIST, 'data/showtimes_current.json');
const showtimes = JSON.parse(readFileSync(showtimesPath, 'utf8'));
const rows = Array.isArray(showtimes?.showtimes)
  ? showtimes.showtimes
  : Array.isArray(showtimes)
    ? showtimes
    : null;
if (!rows || rows.length === 0) {
  fail('showtimes_current.json has no showtimes');
}

const pipelinePath = join(DIST, 'data/pipeline_report.json');
if (existsSync(pipelinePath)) {
  const report = JSON.parse(readFileSync(pipelinePath, 'utf8'));
  if (report?.status && report.status !== 'success' && report.status !== 'partial') {
    fail(`pipeline_report status is ${report.status}`);
  }
}

console.log(
  `check_dist_v2_artifacts: ok (${files.size} files, ${rows.length} showtimes, CNAME=${cname})`,
);
