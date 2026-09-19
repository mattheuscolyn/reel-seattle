/**
 * Compact showtimes_current.json for deployment copies only.
 * Source under public/data/ stays pretty (indent=2) for Git review.
 * Deployed copies must parse to the same object.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SHOWTIMES_CURRENT_BASENAME = 'showtimes_current.json';

/**
 * @param {string} sourcePath
 * @param {string} destPath
 * @param {{
 *   readFileSync?: typeof readFileSync,
 *   writeFileSync?: typeof writeFileSync,
 *   mkdirSync?: typeof mkdirSync,
 * }} [fsApi]
 */
export function copyShowtimesCurrentCompact(sourcePath, destPath, fsApi = {}) {
  const read = fsApi.readFileSync ?? readFileSync;
  const write = fsApi.writeFileSync ?? writeFileSync;
  const mkdir = fsApi.mkdirSync ?? mkdirSync;

  const parsed = JSON.parse(read(sourcePath, 'utf8'));
  mkdir(dirname(destPath), { recursive: true });
  write(destPath, `${JSON.stringify(parsed)}\n`, 'utf8');
  return parsed;
}

/**
 * @param {string} relPath posix-style path relative to public/
 */
export function isShowtimesCurrentPublicRelPath(relPath) {
  const normalized = String(relPath ?? '').replace(/\\/g, '/');
  return (
    normalized === `data/${SHOWTIMES_CURRENT_BASENAME}` ||
    normalized.endsWith(`/${SHOWTIMES_CURRENT_BASENAME}`)
  );
}
