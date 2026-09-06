import { COLLECTION_IDS } from '../destinations.js';
import {
  pacificDateString,
  resolveWeekendRange,
} from '../explore/exploreCatalog.js';
import { captureHomeRestore } from '../navigation/navState.js';
import { createDefaultShowtimesBrowseUi } from '../showtimes/showtimesBrowseModel.js';
import { IconCalendar, IconHome } from '../icons.jsx';

const ICON_PROPS = {
  width: 22,
  height: 22,
  'aria-hidden': true,
  focusable: false,
};

/** 2×2 grid — All showtimes (mockup Option 2). */
function IconBrowseGrid(props) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </svg>
  );
}

/**
 * Home Browse Showtimes launcher — mockup Option 2 card strip.
 * Neutral peer-level actions; no selected/active chip state.
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
    {
      id: 'all',
      labelLines: ['All', 'showtimes'],
      icon: <IconBrowseGrid {...ICON_PROPS} />,
      onActivate: handleAll,
    },
    {
      id: 'today',
      labelLines: ['Today'],
      icon: <IconCalendar {...ICON_PROPS} />,
      onActivate: handleToday,
    },
    {
      id: 'weekend',
      labelLines: ['This weekend'],
      icon: <IconCalendar {...ICON_PROPS} />,
      onActivate: handleWeekend,
    },
    {
      id: 'theaters',
      labelLines: ['Theaters'],
      icon: <IconHome {...ICON_PROPS} />,
      onActivate: handleTheaters,
    },
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
            <span className="v2-home-browse-icon">{entry.icon}</span>
            <span className="v2-home-browse-label">
              {entry.labelLines.join('\n')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
