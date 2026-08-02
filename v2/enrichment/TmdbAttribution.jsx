import { TMDB_ATTRIBUTION } from './tmdbAttributionCopy.js';

/**
 * Compact TMDB attribution — one authoritative placement (T-ENR-10).
 * Visually subordinate; no endorsement language.
 *
 * @param {{
 *   compact?: boolean,
 *   className?: string,
 * }} [props]
 */
export default function TmdbAttribution({ compact = false, className = '' }) {
  const classes = [
    'v2-tmdb-attribution',
    compact ? 'v2-tmdb-attribution-compact' : null,
    className || null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={classes} aria-label="Film metadata attribution">
      <a
        className="v2-tmdb-attribution-logo-link"
        href={TMDB_ATTRIBUTION.homeLinkHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          className="v2-tmdb-attribution-logo"
          src={TMDB_ATTRIBUTION.logoSrc}
          alt={TMDB_ATTRIBUTION.logoAlt}
          width={100}
          height={14}
          loading="lazy"
          decoding="async"
        />
      </a>
      {!compact ? (
        <p className="v2-tmdb-attribution-heading">{TMDB_ATTRIBUTION.heading}</p>
      ) : null}
      <p className="v2-tmdb-attribution-body">{TMDB_ATTRIBUTION.body}</p>
      <p className="v2-tmdb-attribution-link-row">
        <a
          href={TMDB_ATTRIBUTION.homeLinkHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {TMDB_ATTRIBUTION.homeLinkLabel}
        </a>
      </p>
    </aside>
  );
}
