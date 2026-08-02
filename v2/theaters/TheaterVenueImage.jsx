/**
 * Theater venue image with graceful placeholder fallback (WS-TIMG).
 * Never leaves a broken-image state in the UI.
 */

import { useState } from 'react';

/**
 * @param {{
 *   src?: string | null,
 *   alt?: string,
 *   className?: string,
 *   fallbackClassName?: string,
 *   loading?: 'lazy' | 'eager',
 * }} props
 */
export function TheaterVenueImage({
  src = null,
  alt = '',
  className = '',
  fallbackClassName = 'v2-shelf-poster-fallback',
  loading = 'lazy',
}) {
  const [failed, setFailed] = useState(false);
  const usable = typeof src === 'string' && src.trim().length > 0 && !failed;

  if (!usable) {
    return <span className={fallbackClassName} aria-hidden="true" />;
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
