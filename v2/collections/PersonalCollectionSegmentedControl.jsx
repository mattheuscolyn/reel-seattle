import { useEffect, useRef } from 'react';
import {
  IconBookmark,
  IconCheckCircle,
  IconCloseCircle,
} from '../icons.jsx';
import { COLLECTION_IDS } from '../explore/exploreIds.js';
import { collectionIdFromPersonalSegment } from './personalCollectionModel.js';

const SEGMENTS = [
  {
    id: 'saved',
    label: 'Saved',
    collectionId: COLLECTION_IDS.saved,
    Icon: IconBookmark,
  },
  {
    id: 'seen',
    label: 'Seen',
    collectionId: COLLECTION_IDS.seen,
    Icon: IconCheckCircle,
  },
  {
    id: 'not-interested',
    label: 'Not Interested',
    collectionId: COLLECTION_IDS.hidden,
    Icon: IconCloseCircle,
  },
];

/**
 * Shared Saved / Seen / Not Interested segmented control.
 */
export default function PersonalCollectionSegmentedControl({
  activeSegmentId = 'saved',
  onSelectSegment,
}) {
  const tabRefs = useRef(/** @type {Record<string, HTMLButtonElement | null>} */ ({}));

  useEffect(() => {
    const node = tabRefs.current[activeSegmentId];
    if (node && document.activeElement?.getAttribute?.('role') === 'tab') {
      node.focus();
    }
  }, [activeSegmentId]);

  const selectByIndex = (index) => {
    const next = SEGMENTS[index];
    if (!next) return;
    onSelectSegment?.(next.id, collectionIdFromPersonalSegment(next.id));
  };

  return (
    <div
      className="v2-pfc-segments"
      role="tablist"
      aria-label="Personal film collections"
      onKeyDown={(event) => {
        const current = SEGMENTS.findIndex((s) => s.id === activeSegmentId);
        if (current < 0) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          selectByIndex((current + 1) % SEGMENTS.length);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          selectByIndex((current - 1 + SEGMENTS.length) % SEGMENTS.length);
        } else if (event.key === 'Home') {
          event.preventDefault();
          selectByIndex(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          selectByIndex(SEGMENTS.length - 1);
        }
      }}
    >
      {SEGMENTS.map(({ id, label, Icon }) => {
        const active = activeSegmentId === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`v2-pfc-tab-${id}`}
            ref={(node) => {
              tabRefs.current[id] = node;
            }}
            aria-selected={active}
            aria-controls="v2-pfc-panel"
            tabIndex={active ? 0 : -1}
            className={
              active ? 'v2-pfc-segment v2-pfc-segment-active' : 'v2-pfc-segment'
            }
            onClick={() =>
              onSelectSegment?.(id, collectionIdFromPersonalSegment(id))
            }
          >
            <Icon width={15} height={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
