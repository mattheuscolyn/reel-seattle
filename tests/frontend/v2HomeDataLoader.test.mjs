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
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/coming_soon_current.json']);
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

function emptyShowtimesBody() {
  return {
    generated_at: '2026-06-26T12:00:00-07:00',
    timezone: 'America/Los_Angeles',
    theaters: [],
    films: [],
    showtimes: [],
  };
}

function bodyForHomeUrl(url) {
  const path = String(url);
  if (path.includes('showtimes_current')) return emptyShowtimesBody();
  if (path.includes('theaters.json')) return { theaters: [] };
  if (path.includes('newly_added')) return { entries: [] };
  if (path.includes('pipeline_report')) {
    return { status: 'success', sources: {}, messages: [] };
  }
  return {};
}

test('loadHomeData starts independent artifacts concurrently', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const release = [];
  const seen = [];

  const fetchImpl = (url) =>
    new Promise((resolve) => {
      seen.push(String(url));
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      release.push(() => {
        inFlight -= 1;
        const body = bodyForHomeUrl(url);
        resolve({
          ok: body != null,
          status: body != null ? 200 : 404,
          json: async () => body ?? {},
        });
      });
    });

  const resultPromise = loadHomeData({ fetchImpl });
  assert.ok(
    maxInFlight >= 7,
    `expected showtimes and optional artifacts to overlap, max in flight was ${maxInFlight}`,
  );
  assert.equal(seen.length, 7);
  for (const done of release) done();

  const result = await resultPromise;
  assert.equal(result.ok, true);
  assert.equal(result.homeData.sourceHealth.status, 'success');
  assert.deepEqual(result.loadErrors, []);
});

test('loadHomeData does not wait on optional artifacts when showtimes fail', async () => {
  let optionalStarted = 0;
  const fetchImpl = (url) => {
    if (String(url).includes('showtimes_current')) {
      return Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({}),
      });
    }
    optionalStarted += 1;
    return new Promise(() => {});
  };

  const result = await Promise.race([
    loadHomeData({ fetchImpl }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('loadHomeData waited on optional artifacts')), 500);
    }),
  ]);

  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 503/);
  assert.ok(optionalStarted >= 5);
});

test('optional artifact failures stay recoverable and ordered', async () => {
  const fetchImpl = async (url) => {
    const path = String(url);
    if (path.includes('showtimes_current')) {
      return {
        ok: true,
        status: 200,
        json: async () => emptyShowtimesBody(),
      };
    }
    if (path.includes('newly_added')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ entries: [] }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const result = await loadHomeData({ fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.loadErrors.length, 5);
  assert.match(result.loadErrors[0], /pipeline_report/);
  assert.match(result.loadErrors[1], /theaters\.json/);
  assert.match(result.loadErrors[2], /opening_this_week/);
  assert.match(result.loadErrors[3], /leaving_soon/);
  assert.match(result.loadErrors[4], /collections_current/);
  assert.equal(
    result.loadErrors.some((error) => error.includes('newly_added')),
    false,
  );
});

test('includePipelineReport false skips the pipeline request', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    const body = bodyForHomeUrl(url);
    return {
      ok: body != null,
      status: body != null ? 200 : 404,
      json: async () => body ?? {},
    };
  };

  const result = await loadHomeData({
    fetchImpl,
    includePipelineReport: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.homeData.sourceHealth, null);
  assert.equal(
    seen.some((url) => url.includes('pipeline_report')),
    false,
  );
});
