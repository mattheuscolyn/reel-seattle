/**
 * Resolve a canonical HomeData opportunity by opportunityKey.
 */

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} opportunityKey
 * @returns {object | null}
 */
export function resolveHomeOpportunity(homeData, opportunityKey) {
  const key = typeof opportunityKey === 'string' ? opportunityKey.trim() : '';
  if (!key || !homeData) return null;
  return (
    (Array.isArray(homeData.opportunities) ? homeData.opportunities : []).find(
      (opp) => opp?.opportunityKey === key,
    ) ?? null
  );
}
