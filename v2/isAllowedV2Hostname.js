/**
 * Hostnames allowed to render the v2 application shell.
 * Exact match only (no subdomain wildcards). Ports are not part of hostname.
 */
export const ALLOWED_V2_HOSTNAMES = Object.freeze(
  new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
    'www.reelseattle.com',
    'reelseattle.com',
  ]),
);

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAllowedV2Hostname(hostname) {
  if (typeof hostname !== 'string') return false;
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  return ALLOWED_V2_HOSTNAMES.has(normalized);
}
