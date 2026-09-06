import { COLLECTION_IDS } from '../destinations.js';
import {
  pacificDateString,
  resolveWeekendRange,
} from '../explore/exploreCatalog.js';
import { captureHomeRestore } from '../navigation/navState.js';
import { createDefaultShowtimesBrowseUi } from '../showtimes/showtimesBrowseModel.js';

/**
 * Home Browse Showtimes launcher strip — neutral peer-level entry points.
 * Not a filter state; no option is selected/highlighted.
 *
 * @param {{
 *   expandedShelfId?: string | null,
 *   expandedFilmKey?: string | null,
 *   topOppIndex?: number,
 *   onOpenShowtimesBrowse?: (payload: object) => void,
 *   onOpenCollection?: (payload: object) => void,
 * }} props
 */
export default function BrowseShowtimesStrip({
  expandedShelfId = null,
  expandedFilmKey = null,
  topOppIndex = 0,
  onOpenShowtimesBrowse,
  onOpenCollection,
}) {
  const captureRestore = () =>
    captureHomeRestore({
      expandedShelfId,
      expandedFilmKey,
      topOppIndex,
    });

  const openBrowse = (browseUiPatch = {}) => {
    onOpenShowtimesBrowse?.({
      originPrimary: 'home',
      homeRestore: captureRestore(),
      browseUi: {
        ...createDefaultShowtimesBrowseUi(),
        ...browseUiPatch,
      },
    });
  };

  const handleAll = () => {
    // Broadest built-in browse window ("This week") — distinct from Today.
    openBrowse({ dateMode: 'week' });
  };

  const handleToday = () => {
    openBrowse({ dateMode: 'today' });
  };

  const handleWeekend = () => {
    const weekend = resolveWeekendRange(pacificDateString());
    openBrowse({
      dateSelection: {
        mode: 'range',
        startDate: weekend.start,
        endDate: weekend.end,
      },
    });
  };

  const handleTheaters = () => {
    onOpenCollection?.({
      collectionId: COLLECTION_IDS.theaters,
      originPrimary: 'home',
    });
  };

  const entries = [
    { id: 'all', label: 'All showtimes', onActivate: handleAll },
    { id: 'today', label: 'Today', onActivate: handleToday },
    { id: 'weekend', label: 'This weekend', onActivate: handleWeekend },
    { id: 'theaters', label: 'Theaters', onActivate: handleTheaters },
  ];

  return (
    <section
      className="v2-home-browse"
      aria-labelledby="v2-home-browse-heading"
      data-home-browse-strip="1"
    >
      <h2 id="v2-home-browse-heading" className="v2-home-browse-heading">
        Browse Showtimes
      </h2>
      <div className="v2-home-browse-row" role="list">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="listitem"
            className="v2-home-browse-chip"
            data-browse-entry={entry.id}
            onClick={entry.onActivate}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </section>
  );
}
