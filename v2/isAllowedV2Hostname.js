/**
 * Hostnames allowed to render the isolated v2 application shell.
 * Defense in depth — primary protection is exclusion from the Pages build.
 */
export const ALLOWED_V2_HOSTNAMES = Object.freeze([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

/** @param {string} hostname */
export function isAllowedV2Hostname(hostname) {
  if (typeof hostname !== 'string') return false;
  return ALLOWED_V2_HOSTNAMES.includes(hostname);
}
