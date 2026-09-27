/**
 * Theater venue image with graceful placeholder fallback (WS-TIMG).
 * Never leaves a broken-image state in the UI.
 */

import { useState } from 'react';

/**
 * @param {{
 *   src?: string | null,
 *   alt?: string,
 *   venueName?: string | null,
 *   className?: string,
 *   fallbackClassName?: string,
 *   loading?: 'lazy' | 'eager',
 * }} props
 */
export function TheaterVenueImage({
  src = null,
  alt = '',
  venueName = null,
  className = '',
  fallbackClassName = 'v2-shelf-poster-fallback',
  loading = 'lazy',
}) {
  const [failed, setFailed] = useState(false);
  const usable = typeof src === 'string' && src.trim().length > 0 && !failed;
  const label = typeof venueName === 'string' ? venueName.trim() : '';

  if (!usable) {
    return (
      <span className={`${fallbackClassName} v2-venue-fallback`} aria-hidden="true">
        <span className="v2-venue-fallback-screen" />
        {label ? <span className="v2-venue-fallback-name">{label}</span> : null}
      </span>
    );
  }

  return (
    <img
      className={className || undefined}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}
