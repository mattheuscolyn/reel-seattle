/**
 * Compact poster card — expands inline; does not navigate to Film Detail.
 */
export default function FilmShelfCard({
  film,
  expanded = false,
  controlsId,
  onToggle,
}) {
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
      </div>
      <span className="v2-shelf-title">{film.title}</span>
      {film.genre ? <span className="v2-shelf-genre">{film.genre}</span> : null}
      <span className="v2-shelf-meta">{film.metaLabel}</span>
    </button>
  );
}
