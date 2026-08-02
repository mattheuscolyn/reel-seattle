import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALLOWED_V2_DATA_ROUTES,
  EXCLUDED_V2_DATA_PATHS,
  V2_DATA_ARTIFACTS,
  V2_PUBLIC_DATA_ROOT,
  assertSafeV2DataPublicRoute,
  listV2DataArtifacts,
  resolveV2DataArtifactSource,
  validateV2DataAllowlist,
} from '../../v2/data/allowedDataRoutes.js';
import { copyAllowedV2DataArtifacts } from '../../v2/data/copyAllowedV2Data.js';
import { resolveV2DataUrl } from '../../v2/data/v2DataUrl.js';

test('v2 data allowlist integrity: routes, sources, no duplicates, no escape', () => {
  const result = validateV2DataAllowlist({ requireSourcesExist: true });
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('\n'));

  const routes = listV2DataArtifacts().map((a) => a.route);
  assert.equal(new Set(routes).size, routes.length);

  for (const artifact of V2_DATA_ARTIFACTS) {
    assertSafeV2DataPublicRoute(artifact.route);
    const abs = resolveV2DataArtifactSource(artifact);
    assert.ok(abs.startsWith(V2_PUBLIC_DATA_ROOT));
    assert.equal(ALLOWED_V2_DATA_ROUTES[artifact.route], abs);
  }

  assert.ok(EXCLUDED_V2_DATA_PATHS.includes('/data/leaving_soon_current.json'));
  assert.equal(
    ALLOWED_V2_DATA_ROUTES['/data/leaving_soon_current.json'],
    undefined,
  );
});

test('v2 data allowlist marks showtimes required and enrichment optional', () => {
  const byRoute = Object.fromEntries(
    listV2DataArtifacts().map((a) => [a.route, a]),
  );
  assert.equal(byRoute['/data/showtimes_current.json'].required, true);
  assert.equal(byRoute['/data/theaters.json'].required, false);
  assert.equal(byRoute['/data/newly_added_current.json'].required, false);
  assert.equal(byRoute['/data/pipeline_report.json'].required, false);
  assert.equal(byRoute['/data/film_enrichment_current.json'].required, false);
});

test('resolveV2DataUrl respects Vite BASE_URL (root and subpath)', () => {
  assert.equal(
    resolveV2DataUrl('/data/showtimes_current.json', '/'),
    '/data/showtimes_current.json',
  );
  assert.equal(
    resolveV2DataUrl('/data/showtimes_current.json', '/reel-seattle/'),
    '/reel-seattle/data/showtimes_current.json',
  );
  assert.equal(
    resolveV2DataUrl('/data/theaters.json', '/reel-seattle'),
    '/reel-seattle/data/theaters.json',
  );
});

test('copyAllowedV2DataArtifacts writes allowlisted JSON only into outDir/data', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'v2-data-copy-'));
  try {
    const result = copyAllowedV2DataArtifacts({ outDir });
    assert.ok(existsSync(join(outDir, 'data')));
    assert.ok(result.copied.length >= 1);

    const required = listV2DataArtifacts().filter((a) => a.required);
    for (const artifact of required) {
      const name = artifact.route.slice('/data/'.length);
      const dest = join(outDir, 'data', name);
      assert.ok(existsSync(dest), `missing ${dest}`);
      const parsed = JSON.parse(readFileSync(dest, 'utf8'));
      assert.equal(typeof parsed, 'object');
      assert.ok(parsed !== null);
    }

    // Must not invent excluded / unrelated artifacts.
    assert.equal(
      existsSync(join(outDir, 'data', 'leaving_soon_current.json')),
      false,
    );
    assert.equal(existsSync(join(outDir, 'showtimes_history.csv')), false);
    assert.equal(existsSync(join(outDir, '.env')), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('copyAllowedV2DataArtifacts fails when required source is missing', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'v2-data-copy-miss-'));
  try {
    assert.throws(
      () =>
        copyAllowedV2DataArtifacts({
          outDir,
          artifacts: [
            {
              route: '/data/showtimes_current.json',
              sourceRelative: 'public/data/showtimes_current.json',
              required: true,
            },
          ],
          fs: {
            existsSync: () => false,
            mkdirSync: () => {},
            cpSync: () => {
              throw new Error('should not copy');
            },
          },
        }),
      /Required v2 data artifact missing/,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
