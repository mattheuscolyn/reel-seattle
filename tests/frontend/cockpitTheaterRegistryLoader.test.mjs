import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetTheaterRegistryCacheForTests,
  assertTheaterRegistryShape,
  fetchTheaterRegistry,
  loadTheaterRegistryOnce,
  THEATERS_REGISTRY_URL,
} from '../../cockpit/theaterRegistryLoader.js';
import {
  installFetchMock,
  jsonFetchResponse,
} from './helpers/mockFetch.mjs';

const sampleRegistry = {
  schema_version: '1.0.0',
  updated_at: '2026-06-26',
  theaters: [
    {
      id: 'amc-pacific-place-11',
      name: 'AMC Pacific Place 11',
      aliases: [],
      source: 'amc',
      source_external_id: null,
      enabled: true,
      type: 'chain',
      city: 'Seattle',
      neighborhood: 'Downtown',
      timezone: 'America/Los_Angeles',
    },
  ],
};

test('fetchTheaterRegistry returns parsed registry for a successful response', async () => {
  const restore = installFetchMock(async (url) => {
    assert.equal(url, THEATERS_REGISTRY_URL);
    return jsonFetchResponse(sampleRegistry);
  });

  try {
    const registry = await fetchTheaterRegistry();
    assert.equal(registry.schema_version, '1.0.0');
    assert.equal(registry.theaters.length, 1);
  } finally {
    restore();
  }
});

test('fetchTheaterRegistry rejects a non-OK response', async () => {
  const restore = installFetchMock(async () =>
    jsonFetchResponse(null, { ok: false, status: 404 }),
  );

  try {
    await assert.rejects(
      () => fetchTheaterRegistry(),
      /Unable to load theater registry: HTTP 404/,
    );
  } finally {
    restore();
  }
});

test('fetchTheaterRegistry rejects an invalid top-level shape without theaters array', async () => {
  const restore = installFetchMock(async () =>
    jsonFetchResponse({ schema_version: '1.0.0', updated_at: '2026-06-26' }),
  );

  try {
    await assert.rejects(
      () => fetchTheaterRegistry(),
      /must include a theaters array/,
    );
  } finally {
    restore();
  }
});

test('assertTheaterRegistryShape rejects non-objects and missing theaters', () => {
  assert.throws(() => assertTheaterRegistryShape(null), /JSON object/);
  assert.throws(() => assertTheaterRegistryShape([]), /JSON object/);
  assert.throws(
    () => assertTheaterRegistryShape({ theaters: null }),
    /theaters array/,
  );
});

test('loadTheaterRegistryOnce caches a successful artifact', async () => {
  __resetTheaterRegistryCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return sampleRegistry;
  };

  await loadTheaterRegistryOnce(fetchMock);
  const cached = await loadTheaterRegistryOnce(fetchMock);
  assert.equal(calls, 1);
  assert.equal(cached, sampleRegistry);
});
