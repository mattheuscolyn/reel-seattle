import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_V2_DATA_ROUTES,
  EXCLUDED_V2_DATA_PATHS,
  listV2DataArtifacts,
  validateV2DataAllowlist,
} from '../../v2/data/allowedDataRoutes.js';
import { loadHomeData } from '../../v2/data/loadHomeData.js';

test('v2 data allowlist includes Home artifacts including Leaving Soon', () => {
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/showtimes_current.json']);
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/theaters.json']);
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/newly_added_current.json']);
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/opening_this_week_current.json']);
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/leaving_soon_current.json']);
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/pipeline_report.json']);
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/film_enrichment_current.json']);
  assert.equal(
    EXCLUDED_V2_DATA_PATHS.includes('/data/leaving_soon_current.json'),
    false,
  );
  assert.equal(validateV2DataAllowlist().ok, true);
  assert.ok(listV2DataArtifacts().some((a) => a.required));
});

test('loadHomeData builds HomeData through injectable fetch', async () => {
  const showtimes = {
    generated_at: '2026-06-26T12:00:00-07:00',
    timezone: 'America/Los_Angeles',
    theaters: [],
    films: [],
    showtimes: [],
  };
  const theaters = { theaters: [] };
  const newlyAdded = { entries: [] };
  const pipeline = { status: 'success', sources: {}, messages: [] };

  const fetchImpl = async (url) => {
    const body =
      url.includes('showtimes_current')
        ? showtimes
        : url.includes('theaters')
          ? theaters
          : url.includes('newly_added')
            ? newlyAdded
            : url.includes('pipeline_report')
              ? pipeline
              : null;
    if (!body) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  };

  const result = await loadHomeData({ fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.homeData.counts.films, 0);
  assert.equal(result.homeData.leavingSoonExcluded, false);
  assert.equal(result.homeData.leavingSoon.status, 'unavailable');
  assert.equal(result.homeData.sourceHealth.status, 'success');
});

test('loadHomeData fails clearly when showtimes cannot load', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  const result = await loadHomeData({ fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 500/);
});
