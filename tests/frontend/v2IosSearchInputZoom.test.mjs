/**
 * iOS Safari zooms focused inputs whose computed font-size is below 16px.
 * Guard consumer-facing type=search controls with a shared mobile CSS floor.
 * Does not disable user zoom via hostile viewport meta.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const V2_HTML = readFileSync(join(ROOT, 'v2/index.html'), 'utf8');
const ROOT_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

const CONSUMER_SEARCH_SOURCES = [
  ['v2/explore/ExploreSearch.jsx', 'v2-explore-search-input'],
  ['v2/surfaces/SearchResultsSurface.jsx', 'v2-search-results-input'],
  ['v2/allMovies/AllMoviesSurface.jsx', 'v2-am-search-input'],
  ['v2/planner/BuildPlanFilmManageSurface.jsx', 'v2-bp-manage-search-input'],
  ['v2/planner/BuildPlanShowtimeManageSurface.jsx', 'v2-bp-manage-search-input'],
  ['v2/planner/BuildPlanTheaterManageSurface.jsx', 'v2-theater-search-input'],
];

function cssBlock(selector) {
  const start = CSS.indexOf(selector);
  assert.ok(start >= 0, `missing selector ${selector}`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  return CSS.slice(start, close + 1);
}

test('consumer-facing search controls remain type=search with known classes', () => {
  for (const [relPath, className] of CONSUMER_SEARCH_SOURCES) {
    const source = readFileSync(join(ROOT, relPath), 'utf8');
    assert.match(
      source,
      new RegExp(`className=["'\`][^"'\`]*${className}`),
      `${relPath} missing class ${className}`,
    );
    assert.match(source, /type=["']search["']/, `${relPath} must use type=search`);
  }
});

test('shared mobile CSS gives shell search inputs a 16px minimum', () => {
  assert.match(
    CSS,
    /@media\s*\(\s*max-width:\s*48rem\s*\)\s*\{[\s\S]*?\.v2-shell\s+input\[type=['"]search['"]\]\s*\{[\s\S]*?font-size:\s*1rem;/,
  );
  assert.match(
    CSS,
    /\.v2-shell\s+input\[type=['"]search['"]\]/,
    'fix must be a shared shell rule, not only per-class patches',
  );
  // Guardrail must not introduce hostile viewport CSS (comments may mention the anti-pattern).
  assert.doesNotMatch(
    CSS,
    /content:\s*['"][^'"]*(?:maximum-scale|user-scalable\s*=\s*no)/i,
  );
});

test('All Movies search remains at least 16px in base styles', () => {
  const block = cssBlock('.v2-am-search-input {');
  assert.match(block, /font-size:\s*1rem;/);
});

test('viewport metadata does not disable user zoom', () => {
  for (const [label, html] of [
    ['v2/index.html', V2_HTML],
    ['index.html', ROOT_HTML],
  ]) {
    assert.match(
      html,
      /<meta\s+name=["']viewport["']\s+content=["']width=device-width,\s*initial-scale=1\.0["']\s*\/?>/i,
      `${label} missing ordinary responsive viewport`,
    );
    assert.doesNotMatch(html, /maximum-scale/i, `${label} must not set maximum-scale`);
    assert.doesNotMatch(
      html,
      /user-scalable\s*=\s*no/i,
      `${label} must not set user-scalable=no`,
    );
  }
});

test('fix is CSS-only and does not rely on JS focus handling for zoom', () => {
  for (const [relPath] of CONSUMER_SEARCH_SOURCES) {
    const source = readFileSync(join(ROOT, relPath), 'utf8');
    assert.doesNotMatch(
      source,
      /fontSize:\s*['"]16px['"]|style=\{\{[^}]*fontSize/,
      `${relPath} should not use inline fontSize zoom workarounds`,
    );
  }
});
