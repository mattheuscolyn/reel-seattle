import { normalizePosterUrl } from '../utils/posterUtils.js';

export default function PosterImage({ src, alt, className }) {
  const url = normalizePosterUrl(src);
  if (!url) {
    const label = alt ? `Poster unavailable for ${alt}` : 'Poster unavailable';
    return (
      <div className={`${className} poster-placeholder`} role="img" aria-label={label}>
        <span className="poster-placeholder-icon" aria-hidden="true">
          🎬
        </span>
        <span className="poster-placeholder-label" aria-hidden="true">
          No poster
        </span>
      </div>
    );
  }
  return <img className={className} src={url} alt={alt} />;
}
