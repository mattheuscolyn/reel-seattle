import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areCockpitSectionsIndependent,
  buildTheaterRegistryRows,
  buildTheaterRegistrySummary,
  formatAliases,
  formatEnabledLabel,
} from '../../cockpit/theaterRegistryFormat.js';

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
    {
      id: 'amc-kitsap-8',
      name: 'AMC Kitsap 8',
      aliases: [],
      source: 'amc',
      source_external_id: null,
      enabled: false,
      type: 'chain',
      city: 'Bremerton',
      timezone: 'America/Los_Angeles',
    },
    {
      id: 'the-beacon',
      name: 'The Beacon',
      aliases: ['Beacon'],
      source: 'beacon',
      enabled: true,
      type: 'indie',
      city: 'Seattle',
      neighborhood: 'Columbia City',
      timezone: 'America/Los_Angeles',
    },
    {
      id: 'mystery-house',
      name: 'Mystery House',
      aliases: [],
      source: 'nwff',
      source_external_id: '42',
      enabled: true,
      type: 'arthouse',
      timezone: 'America/Los_Angeles',
    },
  ],
};

test('registry summary calculates total, enabled, and disabled counts', () => {
  const summary = buildTheaterRegistrySummary(sampleRegistry);
  assert.equal(summary.total, 4);
  assert.equal(summary.enabledCount, 3);
  assert.equal(summary.disabledCount, 1);
});

test('source counts retain unknown source values', () => {
  const summary = buildTheaterRegistrySummary(sampleRegistry);
  assert.equal(summary.bySource.amc, 2);
  assert.equal(summary.bySource.beacon, 1);
  assert.equal(summary.bySource.nwff, 1);
});

test('type counts retain unknown type values', () => {
  const summary = buildTheaterRegistrySummary(sampleRegistry);
  assert.equal(summary.byType.chain, 2);
  assert.equal(summary.byType.indie, 1);
  assert.equal(summary.byType.arthouse, 1);
});

test('missing fields render as em dash rather than misleading values', () => {
  const rows = buildTheaterRegistryRows({
    theaters: [
      {
        id: 'sparse',
        name: 'Sparse Cinema',
        aliases: [],
        source: 'siff',
        source_external_id: null,
        enabled: true,
        type: 'rep',
      },
    ],
  });

  assert.equal(rows[0].sourceExternalId, '—');
  assert.equal(rows[0].city, '—');
  assert.equal(rows[0].neighborhood, '—');
  assert.equal(rows[0].aliasesDisplay, 'None');
  assert.notEqual(rows[0].sourceExternalId, '0');
  assert.notEqual(rows[0].sourceExternalId, '');
});

test('disabled theaters remain included in displayed rows', () => {
  const rows = buildTheaterRegistryRows(sampleRegistry);
  assert.equal(rows.length, 4);
  const kitsap = rows.find((row) => row.id === 'amc-kitsap-8');
  assert.ok(kitsap);
  assert.equal(kitsap.enabledLabel, 'No');
  assert.equal(kitsap.isDisabled, true);
});

test('format helpers for enabled and aliases', () => {
  assert.equal(formatEnabledLabel(true), 'Yes');
  assert.equal(formatEnabledLabel(false), 'No');
  assert.equal(formatEnabledLabel(null), '—');
  assert.equal(formatAliases([]), 'None');
  assert.equal(formatAliases(['Beacon', ' The Beacon ']), 'Beacon, The Beacon');
});

test('pipeline and registry failures stay independent at the section-state level', () => {
  assert.equal(
    areCockpitSectionsIndependent(
      { loading: false, error: 'pipeline boom', data: null },
      {
        loading: false,
        error: null,
        data: sampleRegistry,
      },
    ),
    true,
  );
  assert.equal(
    areCockpitSectionsIndependent(
      { loading: false, error: null, data: { status: 'success' } },
      { loading: false, error: 'registry boom', data: null },
    ),
    true,
  );
});
