/**
 * Evidence-based collection / festival display-title peeling.
 * Presentation only — never changes identity keys or raw source titles.
 *
 * Mirrors reel_seattle.collections.identity_title:
 * only known collection titles / aliases may be removed.
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asDisplayText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const SEP = String.raw`\s*[:–—-]\s*`;
const PRESENTS_SEP = String.raw`(?:${SEP}|\s+)`;

/**
 * Formal "Brand Film Festival YYYY" collection titles often appear on listings
 * as the shorter "Brand YYYY" form. Derive that alias from the collection title
 * itself — never from an arbitrary listing string alone.
 *
 * @param {string} collectionTitle
 * @returns {string | null}
 */
export function filmFestivalYearAlias(collectionTitle) {
  const text = asDisplayText(collectionTitle);
  if (!text) return null;
  const match = text.match(/^(.+?)\s+Film Festival\s+(\d{4})$/i);
  if (!match) return null;
  const brand = match[1].trim();
  const year = match[2];
  if (!brand || brand.length < 4) return null;
  return `${brand} ${year}`;
}

/**
 * Conservative prefixes: collection title, explicit aliases, and structural
 * Film Festival year abbreviation derived from the collection title.
 *
 * @param {string | null | undefined} title
 * @param {Iterable<string> | null | undefined} [aliases]
 * @returns {string[]}
 */
export function collectionPrefixCandidates(title, aliases = null) {
  /** @type {string[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string | null | undefined} raw
   */
  function push(raw) {
    const text = asDisplayText(raw);
    if (!text) return;
    const folded = text.toLowerCase();
    if (seen.has(folded)) return;
    seen.add(folded);
    out.push(text);
  }

  push(title);
  if (aliases) {
    for (const alias of aliases) push(alias);
  }

  const formal = asDisplayText(title);
  if (formal) {
    for (const sep of [': ', ' — ', ' – ', ' - ']) {
      const idx = formal.indexOf(sep);
      if (idx < 0) continue;
      const head = formal.slice(0, idx).trim();
      if (head && head.length >= 4) push(head);
      break;
    }
    push(filmFestivalYearAlias(formal));
  }

  return out;
}

/**
 * @param {string} title
 * @param {string} prefix
 * @returns {string | null}
 */
function prefixMatch(title, prefix) {
  const text = title.trim();
  const pref = prefix.trim();
  if (!text || !pref) return null;
  const separator = /presents$/i.test(pref.replace(/\s+$/, ''))
    ? PRESENTS_SEP
    : SEP;
  const pattern = new RegExp(
    `^${escapeRegExp(pref)}${separator}(?<body>.+)$`,
    'i',
  );
  const match = text.match(pattern);
  const body = asDisplayText(match?.groups?.body);
  return body;
}

/**
 * @param {string} value
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string | null | undefined} rawTitle
 * @param {Iterable<string> | null | undefined} prefixes
 * @returns {string | null} remainder after a known prefix, or null
 */
export function stripKnownCollectionPrefix(rawTitle, prefixes) {
  const text = asDisplayText(rawTitle);
  if (!text || !prefixes) return null;
  const ordered = [...new Set(
    [...prefixes]
      .map((p) => asDisplayText(p))
      .filter(Boolean),
  )].sort((a, b) => b.length - a.length);

  for (const prefix of ordered) {
    const remainder = prefixMatch(text, prefix);
    if (remainder) return remainder;
  }
  return null;
}

/**
 * Resolve a presentation title using explicit collection membership evidence.
 * Preserves the raw title when prefixes are missing or do not match.
 *
 * @param {string | null | undefined} rawTitle
 * @param {{
 *   collectionTitle?: string | null,
 *   titlePrefixAliases?: Iterable<string> | null,
 *   identityTitleCandidate?: string | null,
 *   prefixes?: Iterable<string> | null,
 * }} [evidence]
 * @returns {string | null}
 */
export function collectionAwareDisplayTitle(rawTitle, evidence = {}) {
  const identity = asDisplayText(evidence?.identityTitleCandidate);
  if (identity) return identity;

  const raw = asDisplayText(rawTitle);
  if (!raw) return null;

  const prefixes = evidence?.prefixes
    ? [...evidence.prefixes]
    : collectionPrefixCandidates(
        evidence?.collectionTitle,
        evidence?.titlePrefixAliases,
      );

  if (!prefixes.length) return raw;

  return stripKnownCollectionPrefix(raw, prefixes) ?? raw;
}

/**
 * Index collections artifact for listing → display-title evidence joins.
 *
 * @param {object | null | undefined} artifact
 */
export function indexCollectionDisplayTitleEvidence(artifact) {
  /** @type {Map<string, object>} */
  const collectionById = new Map();
  for (const row of Array.isArray(artifact?.collections)
    ? artifact.collections
    : []) {
    const id = asDisplayText(row?.collectionId);
    if (!id) continue;
    collectionById.set(id, row);
  }

  /** @type {Map<string, { membership: object, collection: object, prefixes: string[] }>} */
  const byListingKey = new Map();

  for (const membership of Array.isArray(artifact?.memberships)
    ? artifact.memberships
    : []) {
    const collectionId = asDisplayText(membership?.collectionId);
    const collection = collectionId
      ? collectionById.get(collectionId)
      : null;
    if (!collection) continue;

    const prefixes = collectionPrefixCandidates(
      collection.title,
      collection.titlePrefixAliases,
    );
    const evidence = { membership, collection, prefixes };

    const source = asDisplayText(membership?.source)?.toLowerCase();
    const sourceFilmId = asDisplayText(membership?.sourceFilmId);
    if (source && sourceFilmId) {
      byListingKey.set(`${source}|id|${sourceFilmId}`, evidence);
    }
    const listingKey = asDisplayText(membership?.sourceListingKey)?.toLowerCase();
    if (listingKey) {
      byListingKey.set(listingKey, evidence);
    }
  }

  return {
    collectionById,
    byListingKey,
    /**
     * @param {{
     *   source?: string | null,
     *   sourceFilmId?: string | null,
     *   sourceListingKey?: string | null,
     *   collectionIds?: Iterable<string> | null,
     * }} listing
     */
    evidenceForListing(listing) {
      const source = asDisplayText(listing?.source)?.toLowerCase();
      const sourceFilmId = asDisplayText(listing?.sourceFilmId);
      if (source && sourceFilmId) {
        const hit = byListingKey.get(`${source}|id|${sourceFilmId}`);
        if (hit) return hit;
      }
      const listingKey = asDisplayText(listing?.sourceListingKey)?.toLowerCase();
      if (listingKey) {
        const hit = byListingKey.get(listingKey);
        if (hit) return hit;
      }

      // Fall back to collection_ids stamped on showtimes when membership
      // listing keys are incomplete but the collection title still applies.
      const collectionIds = listing?.collectionIds;
      if (!collectionIds) return null;
      for (const id of collectionIds) {
        const collection = collectionById.get(asDisplayText(id) ?? '');
        if (!collection) continue;
        return {
          membership: null,
          collection,
          prefixes: collectionPrefixCandidates(
            collection.title,
            collection.titlePrefixAliases,
          ),
        };
      }
      return null;
    },
  };
}

/**
 * @param {string | null | undefined} rawTitle
 * @param {ReturnType<typeof indexCollectionDisplayTitleEvidence> | null | undefined} index
 * @param {{
 *   source?: string | null,
 *   sourceFilmId?: string | null,
 *   sourceListingKey?: string | null,
 *   collectionIds?: Iterable<string> | null,
 * }} listing
 * @returns {string | null}
 */
export function displayTitleForCollectionListing(rawTitle, index, listing) {
  const raw = asDisplayText(rawTitle);
  if (!raw) return null;
  if (!index) return raw;
  const evidence = index.evidenceForListing(listing);
  if (!evidence) return raw;
  return collectionAwareDisplayTitle(raw, {
    collectionTitle: evidence.collection?.title,
    titlePrefixAliases: evidence.collection?.titlePrefixAliases,
    identityTitleCandidate: evidence.membership?.identityTitleCandidate,
    prefixes: evidence.prefixes,
  });
}
