/**
 * Explore → Special Events. Chronological event-engagement list.
 */

import { useEffect, useMemo } from 'react';
import { IconChevron } from '../icons.jsx';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import {
  LIST_RESTORE_ATTR,
  restoreListPosition,
} from '../navigation/listPositionRestore.js';
import { composeSpecialEventsPage } from './specialEventsModel.js';

/**
 * @param {{
 *   row: object,
 *   onOpen: (row: object) => void,
 * }} props
 */
function SpecialEventRow({ row, onOpen }) {
  const className = row.hasPoster
    ? 'v2-se-row v2-se-row-has-poster'
    : 'v2-se-row v2-se-row-text';

  return (
    <button
      type="button"
      className={className}
      data-special-event-engagement={row.engagementId}
      data-special-event-types={row.types.join(',')}
      data-special-event-has-poster={row.hasPoster ? 'true' : 'false'}
      aria-label={[
        row.filmTitle,
        row.eventDescription,
        row.nextWhenLabel,
        row.nextTheaterName,
        row.moreLabel,
      ]
        .filter(Boolean)
        .join('. ')}
      {...{ [LIST_RESTORE_ATTR]: row.engagementId }}
      onClick={() => onOpen(row)}
    >
      {row.hasPoster ? (
        <span className="v2-se-row-poster" aria-hidden="true">
          <TheaterVenueImage src={row.posterUrl} alt="" loading="lazy" />
        </span>
      ) : null}
      <span className="v2-se-row-copy">
        <span className="v2-se-row-title">{row.filmTitle}</span>
        <span className="v2-se-row-event">{row.eventDescription}</span>
        <span className="v2-se-row-when">{row.nextWhenLabel}</span>
        <span className="v2-se-row-theater">{row.nextTheaterName}</span>
        {row.formatLabels.length > 0 ? (
          <span className="v2-se-row-formats">{row.formatLabels.join(' · ')}</span>
        ) : null}
        {row.moreLabel ? (
          <span className="v2-se-row-more">{row.moreLabel}</span>
        ) : null}
      </span>
      <span className="v2-se-row-chevron" aria-hidden="true">
        <IconChevron />
      </span>
    </button>
  );
}

/**
 * @param {{
 *   homeData?: object | null,
 *   loadStatus?: string,
 *   enrichmentIndex?: object | null,
 *   listRestore?: object | null,
 *   onListRestoreConsumed?: () => void,
 *   onOpenEngagement?: (row: object) => void,
 * }} props
 */
export default function SpecialEventsSurface({
  homeData = null,
  loadStatus = 'ready',
  enrichmentIndex = null,
  listRestore = null,
  onListRestoreConsumed,
  onOpenEngagement,
}) {
  const presentation = useMemo(
    () =>
      composeSpecialEventsPage(homeData, {
        loadStatus,
        enrichmentIndex,
      }),
    [homeData, loadStatus, enrichmentIndex],
  );

  useEffect(() => {
    if (!listRestore) return undefined;
    const frame = requestAnimationFrame(() => {
      restoreListPosition(listRestore, { itemAttr: LIST_RESTORE_ATTR });
      onListRestoreConsumed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [listRestore, onListRestoreConsumed, presentation.visibleCount]);

  return (
    <section
      className="v2-se-page"
      aria-labelledby="v2-se-page-title"
      data-special-events-surface="list"
      data-special-events-state={presentation.state}
    >
      <header className="v2-se-page-header">
        <h1 id="v2-se-page-title" className="v2-se-page-title">
          {presentation.pageTitle}
        </h1>
        <p className="v2-se-page-tagline">{presentation.pageTagline}</p>
        {presentation.countLabel ? (
          <p className="v2-se-page-count">{presentation.countLabel}</p>
        ) : null}
      </header>

      {presentation.emptyMessage && presentation.sections.length === 0 ? (
        <p className="v2-se-empty" role="status">
          {presentation.emptyMessage}
        </p>
      ) : (
        presentation.sections.map((section) => (
          <section
            key={section.id}
            className="v2-se-section"
            data-special-events-section={section.id}
            aria-labelledby={`v2-se-section-${section.id}`}
          >
            <h2
              id={`v2-se-section-${section.id}`}
              className="v2-se-section-heading"
            >
              {section.label}
            </h2>
            <ul className="v2-se-list" role="list">
              {section.engagements.map((row) => (
                <li key={row.engagementId}>
                  <SpecialEventRow
                    row={row}
                    onOpen={(item) => onOpenEngagement?.(item)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
