import { filmsForKeys } from './exploreCatalog.js';
import { COLLECTION_IDS } from './exploreIds.js';

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2" />
      <path d="M6.1 6.1A18 18 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 4.2-.8" />
    </svg>
  );
}

function recentTitles(films) {
  return films
    .slice(0, 2)
    .map((f) => f.title)
    .filter(Boolean);
}

/**
 * Your Film Activity — Seen + Not interested summaries (device-local).
 */
export default function ExploreFilmActivity({
  homeData,
  seenKeys,
  dismissedKeys,
  onManage,
  onOpenSeen,
  onOpenNotInterested,
}) {
  const seenFilms = filmsForKeys(homeData, seenKeys);
  const notInterestedFilms = filmsForKeys(homeData, dismissedKeys);
  const seenCount = Array.isArray(seenKeys) ? seenKeys.length : 0;
  const notInterestedCount = Array.isArray(dismissedKeys)
    ? dismissedKeys.length
    : 0;
  const seenRecent = recentTitles(seenFilms);
  const notRecent = recentTitles(notInterestedFilms);

  return (
    <section className="v2-activity" aria-labelledby="v2-activity-heading">
      <div className="v2-section-row">
        <h2 id="v2-activity-heading" className="v2-section-caps">
          Your Film Activity
        </h2>
        <button
          type="button"
          className="v2-section-action"
          aria-label="Manage film activity"
          onClick={() => onManage?.(COLLECTION_IDS.filmActivity)}
        >
          Manage
        </button>
      </div>

      <div className="v2-activity-grid">
        <button
          type="button"
          className="v2-activity-card v2-activity-card-seen"
          aria-label={`Seen, ${seenCount} films`}
          onClick={onOpenSeen}
        >
          <span className="v2-activity-card-top">
            <span className="v2-activity-icon" aria-hidden="true">
              <EyeIcon />
            </span>
            <span className="v2-activity-count">{seenCount}</span>
          </span>
          <span className="v2-activity-label">Seen</span>
          <span className="v2-activity-desc">Films you’ve watched</span>
          <span className="v2-activity-foot">
            {seenRecent.length > 0
              ? `Recent: ${seenRecent.join(' · ')}`
              : 'Nothing marked Seen yet'}
          </span>
        </button>

        <button
          type="button"
          className="v2-activity-card v2-activity-card-hidden"
          aria-label={`Not interested, ${notInterestedCount} films`}
          onClick={onOpenNotInterested}
        >
          <span className="v2-activity-card-top">
            <span className="v2-activity-icon" aria-hidden="true">
              <EyeOffIcon />
            </span>
            <span className="v2-activity-count">{notInterestedCount}</span>
          </span>
          <span className="v2-activity-label">Not interested</span>
          <span className="v2-activity-desc">We’ll stop surfacing these</span>
          <span className="v2-activity-foot">
            {notRecent.length > 0
              ? `Recent: ${notRecent.join(' · ')}`
              : 'Nothing marked Not interested yet'}
          </span>
        </button>
      </div>

      <p className="v2-activity-note" role="note">
        Seen films can still appear for special opportunities. Activity stays on
        this device.
      </p>
    </section>
  );
}
