/**
 * Canonical format / experience keys and source-tag normalization.
 * Aligns with Canonical Mockup Images/reel-seattle-formats-experiences-source-of-truth.md §12.
 *
 * Important non-mappings (do not invent equivalence):
 * - Dolby Atmos alone → not dolby-cinema
 * - generic non-AMC "XL" → not xl-amc
 * - generic "3D" → not reald-3d
 */

/** @typedef {'35mm'|'70mm'|'imax'|'imax-70mm'|'dolby-cinema'|'xl-amc'|'reald-3d'} FormatCanonicalId */
/** @typedef {'open-caption'|'audio-description'|'live-score'} ExperienceCanonicalId */

export const FORMAT_CANONICAL_IDS = Object.freeze([
  '70mm',
  'imax',
  'xl-amc',
  'reald-3d',
  'dolby-cinema',
  'imax-70mm',
  '35mm',
]);

/** Landing mockup order (formats). */
export const FORMAT_LANDING_ORDER = FORMAT_CANONICAL_IDS;

export const EXPERIENCE_CANONICAL_IDS = Object.freeze([
  'open-caption',
  'audio-description',
  'live-score',
]);

/**
 * Exact / known slug aliases → canonical format id.
 * Ambiguous tokens are intentionally omitted.
 * @type {Readonly<Record<string, FormatCanonicalId>>}
 */
const FORMAT_ALIAS_TO_CANONICAL = Object.freeze({
  '35mm': '35mm',
  '35-mm': '35mm',
  '70mm': '70mm',
  '70-mm': '70mm',
  '70mm-film': '70mm',
  imax: 'imax',
  'imax-at-amc': 'imax',
  'imax-with-laser': 'imax',
  'imax-laser': 'imax',
  'imax-3d': 'imax',
  'imax-70mm': 'imax-70mm',
  'imax-70-mm': 'imax-70mm',
  '15-70-imax': 'imax-70mm',
  '15/70-imax': 'imax-70mm',
  '15/70': 'imax-70mm',
  'dolby-cinema': 'dolby-cinema',
  'dolby-cinema-at-amc': 'dolby-cinema',
  'xl-amc': 'xl-amc',
  'xl-at-amc': 'xl-amc',
  'reald-3d': 'reald-3d',
  reald3d: 'reald-3d',
});

/**
 * Phrase aliases matched against collapsed whitespace (casefold).
 * Longer / more specific phrases first.
 * @type {readonly [string, FormatCanonicalId][]}
 */
const FORMAT_PHRASE_ALIASES = Object.freeze([
  ['imax 70mm', 'imax-70mm'],
  ['imax 70 mm', 'imax-70mm'],
  ['15/70 imax', 'imax-70mm'],
  ['15/70', 'imax-70mm'],
  ['dolby cinema', 'dolby-cinema'],
  ['dolby cinema at amc', 'dolby-cinema'],
  ['xl at amc', 'xl-amc'],
  ['reald 3d', 'reald-3d'],
  ['real d 3d', 'reald-3d'],
  ['70mm film', '70mm'],
  ['35mm film', '35mm'],
  ['imax with laser', 'imax'],
  ['imax laser', 'imax'],
]);

/**
 * @type {Readonly<Record<string, ExperienceCanonicalId>>}
 */
const EXPERIENCE_ALIAS_TO_CANONICAL = Object.freeze({
  'open-caption': 'open-caption',
  'open-captions': 'open-caption',
  oc: 'open-caption',
  'audio-description': 'audio-description',
  'audio-described': 'audio-description',
  'descriptive-video': 'audio-description',
  ad: 'audio-description',
  'live-score': 'live-score',
  'live-orchestra': 'live-score',
  'film-with-orchestra': 'live-score',
  'live-to-picture': 'live-score',
});

/**
 * @type {readonly [string, ExperienceCanonicalId][]}
 */
const EXPERIENCE_PHRASE_ALIASES = Object.freeze([
  ['open captions', 'open-caption'],
  ['open caption', 'open-caption'],
  ['audio description', 'audio-description'],
  ['audio described', 'audio-description'],
  ['descriptive video', 'audio-description'],
  ['live score', 'live-score'],
  ['live orchestra', 'live-score'],
  ['film with orchestra', 'live-score'],
  ['live to picture', 'live-score'],
]);

/**
 * Display labels for browse filter keys (normalizeBrowseFormat facing keys).
 * @type {Readonly<Record<FormatCanonicalId | ExperienceCanonicalId, string>>}
 */
export const CANONICAL_BROWSE_LABEL = Object.freeze({
  '35mm': '35mm',
  '70mm': '70mm',
  imax: 'IMAX',
  'imax-70mm': 'IMAX 70mm',
  'dolby-cinema': 'Dolby Cinema',
  'xl-amc': 'XL at AMC',
  'reald-3d': 'RealD 3D',
  'open-caption': 'Open Captions',
  'audio-description': 'Audio Description',
  'live-score': 'Live Score',
});

/**
 * @param {unknown} raw
 * @returns {string}
 */
function collapseKey(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function slugify(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalize a source format tag to a canonical format id, or null.
 * Does not map Dolby Atmos → Dolby Cinema, generic 3D → RealD, or bare XL → XL at AMC.
 *
 * @param {unknown} raw
 * @param {{ exhibitorHint?: string | null }} [opts]
 * @returns {FormatCanonicalId | null}
 */
export function normalizeCanonicalFormat(raw, opts = {}) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const collapsed = collapseKey(trimmed);
  for (const [phrase, id] of FORMAT_PHRASE_ALIASES) {
    if (collapsed === phrase) return id;
  }

  const slug = slugify(trimmed);
  if (slug && FORMAT_ALIAS_TO_CANONICAL[slug]) {
    return FORMAT_ALIAS_TO_CANONICAL[slug];
  }

  // Bare "xl" only when exhibitor context is unambiguously AMC.
  if (slug === 'xl' || collapsed === 'xl') {
    const hint = collapseKey(opts.exhibitorHint ?? '');
    if (hint.includes('amc')) return 'xl-amc';
    return null;
  }

  // Explicitly reject false equivalences.
  if (
    slug === 'dolby-atmos' ||
    collapsed === 'dolby atmos' ||
    slug === '3d' ||
    collapsed === '3d'
  ) {
    return null;
  }

  return null;
}

/**
 * Normalize a source experience tag to a canonical experience id, or null.
 * Ambiguous short codes ("AD", "OC") only map when the token is an exact alias
 * in accessibility context — we accept documented aliases from the source of truth.
 *
 * @param {unknown} raw
 * @returns {ExperienceCanonicalId | null}
 */
export function normalizeCanonicalExperience(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const collapsed = collapseKey(trimmed);
  for (const [phrase, id] of EXPERIENCE_PHRASE_ALIASES) {
    if (collapsed === phrase) return id;
  }

  const slug = slugify(trimmed);
  if (slug && EXPERIENCE_ALIAS_TO_CANONICAL[slug]) {
    return EXPERIENCE_ALIAS_TO_CANONICAL[slug];
  }

  return null;
}

/**
 * Map any opportunity formatLabels entry to format and/or experience ids.
 * @param {unknown} raw
 * @param {{ exhibitorHint?: string | null }} [opts]
 * @returns {{ formatId: FormatCanonicalId | null, experienceId: ExperienceCanonicalId | null }}
 */
export function classifyFormatLabel(raw, opts = {}) {
  return {
    formatId: normalizeCanonicalFormat(raw, opts),
    experienceId: normalizeCanonicalExperience(raw),
  };
}

/**
 * Browse filter key used by showtimesBrowseModel.normalizeBrowseFormat.
 * @param {FormatCanonicalId | ExperienceCanonicalId} canonicalId
 * @returns {string}
 */
export function canonicalToBrowseFormatKey(canonicalId) {
  const label = CANONICAL_BROWSE_LABEL[canonicalId];
  if (!label) return String(canonicalId).toLowerCase();
  return label.toLowerCase();
}

/**
 * Whether an opportunity matches a canonical format or experience id.
 * @param {object} opportunity
 * @param {FormatCanonicalId | ExperienceCanonicalId} canonicalId
 * @returns {boolean}
 */
export function opportunityMatchesCanonical(opportunity, canonicalId) {
  const labels = Array.isArray(opportunity?.formatLabels)
    ? opportunity.formatLabels
    : [];
  const exhibitorHint =
    typeof opportunity?.theaterName === 'string' ? opportunity.theaterName : null;
  for (const raw of labels) {
    const { formatId, experienceId } = classifyFormatLabel(raw, {
      exhibitorHint,
    });
    if (formatId === canonicalId || experienceId === canonicalId) return true;
  }
  return false;
}
