import { IconCalendar, IconChevron, IconEye } from '../icons.jsx';

/**
 * Reusable personal-collection film row.
 */
export default function PersonalCollectionFilmRow({
  row,
  onOpenFilm,
  onRemove,
}) {
  if (!row) return null;

  const open = () => {
    const key =
      row.origin === 'snapshot'
        ? (typeof row.filmId === 'string' && row.filmId.trim()) ||
          (typeof row.filmKey === 'string' && row.filmKey.trim()) ||
          null
        : (typeof row.filmKey === 'string' && row.filmKey.trim()) ||
          (typeof row.filmId === 'string' && row.filmId.trim()) ||
          null;
    if (!key) return;
    onOpenFilm?.({
      filmKey: key,
      opportunityKey: row.nextOpportunityKey ?? null,
    });
  };

  return (
    <li className="v2-pfc-row">
      <div className="v2-pfc-row-inner">
        <button
          type="button"
          className="v2-pfc-row-main"
          onClick={open}
          aria-label={`Open ${row.title}`}
        >
          <span className="v2-pfc-row-poster">
            {row.posterUrl ? (
              <img src={row.posterUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="v2-shelf-poster-fallback" aria-hidden="true" />
            )}
          </span>
          <span className="v2-pfc-row-copy">
            <span className="v2-pfc-row-title">{row.title}</span>
            {row.showtimeLine ? (
              <span className="v2-pfc-row-showtime">{row.showtimeLine}</span>
            ) : null}
            {row.metaLine ? (
              <span className="v2-pfc-row-meta">{row.metaLine}</span>
            ) : null}
            {row.tags?.length ? (
              <span className="v2-pfc-row-tags">
                {row.tags.map((tag) => (
                  <span
                    key={`${row.rowKey}-${tag.label}`}
                    className={
                      tag.tone === 'accent'
                        ? 'v2-pfc-tag v2-pfc-tag-accent'
                        : 'v2-pfc-tag'
                    }
                  >
                    {tag.label}
                  </span>
                ))}
              </span>
            ) : null}
            {row.statusLine ? (
              <span className="v2-pfc-row-status">
                <IconCalendar width={13} height={13} aria-hidden="true" />
                {row.statusLine}
              </span>
            ) : null}
          </span>
        </button>

        {row.showWatchingBadge ? (
          <span
            className="v2-pfc-watching-badge"
            role="status"
            aria-label="Watching for showtimes"
          >
            <IconEye width={13} height={13} aria-hidden="true" />
            Watching
          </span>
        ) : null}

        {row.showRemove && typeof onRemove === 'function' ? (
          <button
            type="button"
            className="v2-pfc-row-remove"
            aria-label={`${row.removeLabel || 'Remove'} ${row.title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove(row);
            }}
          >
            {row.removeLabel || 'Remove'}
          </button>
        ) : null}

        <button
          type="button"
          className="v2-pfc-row-chevron-btn"
          aria-label={`Open ${row.title}`}
          onClick={open}
        >
          <IconChevron aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
