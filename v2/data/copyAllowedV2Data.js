/**
 * Copy allowlisted v2 data JSON into a static build output (dist-v2/data/).
 * Shared by the Vite build plugin and unit tests — no shell / platform deps.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  listV2DataArtifacts,
  resolveV2DataArtifactSource,
  validateV2DataAllowlist,
} from './allowedDataRoutes.js';

/**
 * @param {{
 *   outDir: string,
 *   artifacts?: ReturnType<typeof listV2DataArtifacts>,
 *   fs?: {
 *     existsSync?: typeof existsSync,
 *     mkdirSync?: typeof mkdirSync,
 *     cpSync?: typeof cpSync,
 *   },
 * }} options
 * @returns {{
 *   dataDir: string,
 *   copied: { route: string, destRelative: string, bytes?: number }[],
 *   skippedOptional: string[],
 * }}
 */
export function copyAllowedV2DataArtifacts(options) {
  const outDir = options?.outDir;
  if (typeof outDir !== 'string' || !outDir.trim()) {
    throw new Error('copyAllowedV2DataArtifacts requires outDir');
  }

  const integrity = validateV2DataAllowlist({ requireSourcesExist: false });
  if (!integrity.ok) {
    throw new Error(
      `v2 data allowlist invalid:\n- ${integrity.errors.join('\n- ')}`,
    );
  }

  const fsApi = options.fs ?? {};
  const exists = fsApi.existsSync ?? existsSync;
  const mkdir = fsApi.mkdirSync ?? mkdirSync;
  const copy = fsApi.cpSync ?? cpSync;

  const artifacts = options.artifacts ?? listV2DataArtifacts();
  const dataDir = join(outDir, 'data');
  mkdir(dataDir, { recursive: true });

  /** @type {{ route: string, destRelative: string }[]} */
  const copied = [];
  /** @type {string[]} */
  const skippedOptional = [];

  for (const artifact of artifacts) {
    const source = resolveV2DataArtifactSource(artifact);
    const fileName = basename(artifact.route);
    const dest = join(dataDir, fileName);
    const destRelative = `data/${fileName}`;

    if (!exists(source)) {
      if (artifact.required) {
        throw new Error(
          `Required v2 data artifact missing for build: ${artifact.route}\n` +
            `Expected source: ${source}`,
        );
      }
      skippedOptional.push(artifact.route);
      continue;
    }

    copy(source, dest);
    copied.push({ route: artifact.route, destRelative });
  }

  return { dataDir, copied, skippedOptional };
}
