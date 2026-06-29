#!/usr/bin/env node
/**
 * Lightweight frontend smoke checks on production build output.
 * Validates dist artifacts and bundled JS runtime expectations (no browser needed).
 *
 * Run after: npm run build
 * Complements scripts/check_dist_artifacts.mjs (deploy guard / size budget).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const ASSETS_DIR = join(DIST, 'assets');

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'data/showtimes_current.json',
  'data/pipeline_report.json',
  'data/newly_added_current.json',
  'data/theaters.json',
  'marathon/index.html',
];

const FORBIDDEN_PATHS = ['data/showtimes_history.csv', 'data/daily_logs'];

const BUNDLE_MUST_INCLUDE = [
  'showtimes_current.json',
  'pipeline_report.json',
  '/planner',
  '/double-feature',
  '/marathon',
];

const BUNDLE_MUST_NOT_INCLUDE = ['showtimes_history.csv', 'papaparse', 'PapaParse'];

function fail(message) {
  console.error(`smoke_check_frontend: ${message}`);
  process.exit(1);
}

function assertValidJson(relativePath) {
  try {
    JSON.parse(readFileSync(join(DIST, relativePath), 'utf8'));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function readBundledJs() {
  if (!existsSync(ASSETS_DIR)) {
    fail('dist/assets/ is missing — run npm run build first');
  }

  const jsFiles = readdirSync(ASSETS_DIR).filter((name) => name.endsWith('.js'));
  if (jsFiles.length === 0) {
    fail('no JS bundles found in dist/assets/');
  }

  return jsFiles
    .map((name) => readFileSync(join(ASSETS_DIR, name), 'utf8'))
    .join('\n');
}

if (!existsSync(DIST)) {
  fail('dist/ not found — run npm run build first');
}

for (const relativePath of REQUIRED_FILES) {
  const fullPath = join(DIST, relativePath);
  if (!existsSync(fullPath)) {
    fail(`missing required file: dist/${relativePath}`);
  }
  if (relativePath.endsWith('.json')) {
    assertValidJson(relativePath);
  }
}

for (const relativePath of FORBIDDEN_PATHS) {
  if (existsSync(join(DIST, relativePath))) {
    fail(`forbidden artifact present: dist/${relativePath}`);
  }
}

const bundle = readBundledJs();

for (const needle of BUNDLE_MUST_INCLUDE) {
  if (!bundle.includes(needle)) {
    fail(`built JS missing expected reference: ${needle}`);
  }
}

for (const needle of BUNDLE_MUST_NOT_INCLUDE) {
  if (bundle.toLowerCase().includes(needle.toLowerCase())) {
    fail(`built JS must not reference: ${needle}`);
  }
}

console.log('smoke_check_frontend: OK');
console.log(`  checked ${REQUIRED_FILES.length} required dist files`);
console.log(`  checked bundled JS for ${BUNDLE_MUST_INCLUDE.length} expected references`);
console.log(`  checked bundled JS for ${BUNDLE_MUST_NOT_INCLUDE.length} forbidden references`);
