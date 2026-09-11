/**
 * Canonical Home shelf-detail film result card.
 *
 * Visual hierarchy (optional fields collapse when absent):
 * 1. title (+ optional badge)
 * 2. basic film metadata (year/runtime/genre)
 * 3. shelf-specific metadata (date, availability, format/presentation)
 * 4. theater line
 * 5. synopsis
 *
 * Shared classes: `.v2-shelf-detail-card*`
 */

import {
  IconBookmark,
  IconCalendar,
  IconChevron,
  IconClock,
  IconEyeOff,
  IconPin,
  IconStar,
} from '../icons.jsx';

/**
 * @param {{
 *   film: object,
 *   expanded: boolean,
 *   onToggleExpand: (filmKey: string) => void,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onOpenShowtimes?: (payload: { filmKey: string, theaterId?: string | null, opportunityKey?: string | null }) => void,
 *   filmActionState: (film: object) => { filmRef: object | null, saved: boolean, notInterested: boolean },
 *   onToggleSave: (film: object) => void,
 *   onToggleNotInterested: (film: object) => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 *   expandIdPrefix?: string,
 * }} props
 */
export default function HomeShelfDetailFilmCard({
  film,
  expanded,
  onToggleExpand,
  onOpenFilmDetail,
  onOpenShowtimes,
  filmActionState,
  onToggleSave,
  onToggleNotInterested,
  onStubAction,
  expandIdPrefix = 'v2-shelf-detail-expand',
}) {
  const panelId = `${expandIdPrefix}-${film.filmKey}`;
  const hasShowingMeta = Boolean(
    film.dateLabel ||
      film.availabilityLabel ||
      film.formatLabel ||
      film.theaterName ||
      (expanded && film.timeLabel),
  );

  return (
    <article
      className={
        expanded
          ? 'v2-shelf-detail-card v2-shelf-detail-card-expanded'
          : film.noCurrentShowtimes
            ? 'v2-shelf-detail-card v2-shelf-detail-card-muted'
            : 'v2-shelf-detail-card'
      }
    >
      <button
        type="button"
        className="v2-shelf-detail-card-main"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggleExpand(film.filmKey)}
      >
        <span className="v2-shelf-detail-card-poster">
          {film.posterUrl ? (
            <img src={film.posterUrl} alt="" draggable="false" />
          ) : (
            <span className="v2-shelf-poster-fallback" aria-hidden="true" />
          )}
        </span>
        <span className="v2-shelf-detail-card-copy">
          {film.badge ? (
            <span className="v2-shelf-detail-card-badge">{film.badge}</span>
          ) : null}
          <span className="v2-shelf-detail-card-title">{film.title}</span>
          {film.metaLine ? (
            <span className="v2-shelf-detail-card-meta">{film.metaLine}</span>
          ) : null}
          {hasShowingMeta ? (
            <span className="v2-shelf-detail-card-showing">
              {film.dateLabel ? (
                <span className="v2-shelf-detail-card-fact">
                  <IconCalendar width={12} height={12} aria-hidden="true" />
                  {film.dateLabel}
                </span>
              ) : null}
              {film.availabilityLabel ? (
                <span className="v2-shelf-detail-card-availability">
                  {film.availabilityLabel}
                </span>
              ) : null}
              {film.formatLabel ? (
                <span className="v2-shelf-detail-card-format">
                  {film.formatLabel}
                </span>
              ) : null}
              {film.theaterName ? (
                <span className="v2-shelf-detail-card-fact">
                  <IconPin width={12} height={12} aria-hidden="true" />
                  {film.theaterName}
                </span>
              ) : null}
              {expanded && film.timeLabel ? (
                <span className="v2-shelf-detail-card-fact">
                  <IconClock aria-hidden="true" />
                  {film.timeLabel}
                </span>
              ) : null}
            </span>
          ) : null}
          {film.synopsis ? (
            <span className="v2-shelf-detail-card-synopsis">{film.synopsis}</span>
          ) : null}
        </span>
        <span className="v2-shelf-detail-card-chevron" aria-hidden="true">
          {expanded ? '⌃' : <IconChevron />}
        </span>
      </button>

      {expanded ? (
        <div
          id={panelId}
          className="v2-shelf-detail-card-expand"
          role="region"
          aria-label={`Quick details for ${film.title}`}
        >
          {(film.whySeeIt || film.alsoPlaying) && (
            <div className="v2-shelf-detail-card-panels">
              {film.whySeeIt ? (
                <div className="v2-shelf-detail-card-panel">
                  <p className="v2-shelf-detail-card-panel-label">Why see it</p>
                  <p className="v2-shelf-detail-card-why">
                    <IconStar width={14} height={14} aria-hidden="true" />
                    <span>{film.whySeeIt}</span>
                  </p>
                </div>
              ) : null}
              {film.alsoPlaying ? (
                <div className="v2-shelf-detail-card-panel">
                  <p className="v2-shelf-detail-card-panel-label">Also playing at</p>
                  <button
                    type="button"
                    className="v2-shelf-detail-card-also"
                    onClick={() =>
                      onStubAction?.(
                        `also-${film.filmKey}`,
                        film.alsoPlaying.theaterName,
                      )
                    }
                  >
                    <span className="v2-shelf-detail-card-also-copy">
                      <span className="v2-shelf-detail-card-also-theater">
                        {film.alsoPlaying.theaterName}
                      </span>
                      <span className="v2-shelf-detail-card-also-detail">
                        {film.alsoPlaying.detailLabel}
                      </span>
                    </span>
                    <IconChevron aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <div className="v2-shelf-detail-card-actions">
            {(() => {
              const { filmRef, saved, notInterested } = filmActionState(film);
              const canAct = Boolean(filmRef);
              return (
                <>
                  <button
                    type="button"
                    className={
                      saved
                        ? 'v2-shelf-detail-card-action is-active'
                        : 'v2-shelf-detail-card-action'
                    }
                    aria-pressed={saved}
                    disabled={!canAct}
                    onClick={() => onToggleSave(film)}
                  >
                    <IconBookmark width={16} height={16} aria-hidden="true" />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className={
                      notInterested
                        ? 'v2-shelf-detail-card-action is-active'
                        : 'v2-shelf-detail-card-action'
                    }
                    aria-pressed={notInterested}
                    disabled={!canAct}
                    onClick={() => onToggleNotInterested(film)}
                  >
                    <IconEyeOff width={16} height={16} aria-hidden="true" />
                    Not interested
                  </button>
                </>
              );
            })()}
            {film.hasUpcomingShowtimes ? (
              <button
                type="button"
                className="v2-shelf-detail-card-more"
                onClick={() =>
                  onOpenShowtimes?.({
                    filmKey: film.filmKey,
                    theaterId: film.theaterId ?? null,
                    opportunityKey: film.opportunityKey ?? null,
                  })
                }
              >
                Showtimes
                <IconChevron aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="v2-shelf-detail-card-more"
              onClick={() =>
                onOpenFilmDetail?.({
                  filmKey: film.filmKey,
                  filmId: film.filmId ?? null,
                  opportunityKey: film.opportunityKey ?? null,
                })
              }
            >
              More details
              <IconChevron aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
