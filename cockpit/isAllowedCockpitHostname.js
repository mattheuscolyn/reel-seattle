/**
 * Hostnames allowed to render the developer data cockpit.
 * Defense in depth — primary protection is exclusion from the Pages build.
 */
export const ALLOWED_COCKPIT_HOSTNAMES = Object.freeze([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

/** @param {string} hostname */
export function isAllowedCockpitHostname(hostname) {
  if (typeof hostname !== 'string') return false;
  return ALLOWED_COCKPIT_HOSTNAMES.includes(hostname);
}
