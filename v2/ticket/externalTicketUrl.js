/**
 * Shared external ticket URL helpers for v2 consumers.
 *
 * Reel Seattle does not sell tickets. Public `ticket_url` values are the only
 * trustworthy destinations. Do not invent, reconstruct, or fall back to theater
 * homepages / calendars / source info pages.
 */

/**
 * Standard attributes for opening an external ticket destination.
 * Matches existing Top Opportunity / Opportunity scaffold conventions.
 */
export const EXTERNAL_TICKET_LINK_RELS = 'noopener noreferrer';
export const EXTERNAL_TICKET_LINK_TARGET = '_blank';

/**
 * Normalize a candidate ticket URL for presentation models and hrefs.
 * Preserves query strings and fragments. Rejects relative and non-http(s) values.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeExternalTicketUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

/**
 * Props for an external ticket anchor when a URL is present.
 * Returns null when the action must be suppressed.
 *
 * @param {unknown} value
 * @returns {{ href: string, target: string, rel: string } | null}
 */
export function externalTicketLinkProps(value) {
  const href = normalizeExternalTicketUrl(value);
  if (!href) return null;
  return {
    href,
    target: EXTERNAL_TICKET_LINK_TARGET,
    rel: EXTERNAL_TICKET_LINK_RELS,
  };
}
