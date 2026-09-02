/**
 * Compact poster card — expands inline; does not navigate to Film Detail.
 */
export default function FilmShelfCard({
  film,
  expanded = false,
  controlsId,
  onToggle,
}) {
  const meta =
    film.metaLabel && film.genre && !String(film.metaLabel).includes(film.genre)
      ? `${film.metaLabel}`
      : film.metaLabel;
  const secondary = film.genre && (!meta || !String(meta).includes(film.genre))
    ? film.genre
    : null;

  return (
    <button
      type="button"
      className={
        expanded ? 'v2-shelf-card v2-shelf-card-expanded' : 'v2-shelf-card'
      }
      aria-expanded={expanded}
      aria-controls={expanded ? controlsId : undefined}
      onClick={onToggle}
    >
      <div className="v2-shelf-poster">
        {film.posterUrl ? (
          <img src={film.posterUrl} alt="" draggable="false" />
        ) : (
          <div className="v2-shelf-poster-fallback" aria-hidden="true" />
        )}
        {film.badge ? (
          <span className="v2-shelf-badge">{film.badge}</span>
        ) : null}
      </div>
      <span className="v2-shelf-title">{film.title}</span>
      {secondary ? <span className="v2-shelf-genre">{secondary}</span> : null}
      {meta ? <span className="v2-shelf-meta">{meta}</span> : null}
    </button>
  );
}
