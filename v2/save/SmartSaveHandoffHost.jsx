/**
 * App-level host for Smart Save → Planner handoff sheets.
 */

import { useEffect, useRef, useState } from 'react';
import SavedFilmChooseShowtimeSheet from '../planner/SavedFilmChooseShowtimeSheet.jsx';
import SmartSaveDirectAddSheet from './SmartSaveDirectAddSheet.jsx';
import {
  SMART_SAVE_HANDOFF_MODE,
  declineSmartSaveHandoff,
  subscribeSmartSaveHandoff,
} from './smartSaveHandoffController.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: object) => void,
 *   onPlansChanged?: () => void,
 *   navigationKey?: string | null,
 * }} props
 */
export default function SmartSaveHandoffHost({
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail = null,
  onPlansChanged = null,
  navigationKey = null,
}) {
  const [handoff, setHandoff] = useState(null);
  const storage = getBrowserStorage();
  const prevNavigationKeyRef = useRef(navigationKey);

  useEffect(() => {
    return subscribeSmartSaveHandoff((payload) => {
      if (!payload || payload.mode === SMART_SAVE_HANDOFF_MODE.none) return;
      setHandoff(payload);
    });
  }, []);

  // Drop any open prompt when the user navigates so it cannot stick to the
  // wrong film/surface. Treat navigate-away as decline while still saved.
  useEffect(() => {
    if (prevNavigationKeyRef.current === navigationKey) return;
    prevNavigationKeyRef.current = navigationKey;
    setHandoff((current) => {
      if (current?.filmRef) {
        declineSmartSaveHandoff(storage, current.filmRef);
      }
      return null;
    });
  }, [navigationKey, storage]);

  const close = () => setHandoff(null);

  const closeChoose = () => {
    if (handoff?.filmRef) {
      declineSmartSaveHandoff(storage, handoff.filmRef);
    }
    close();
  };

  const isDirect =
    handoff?.mode === SMART_SAVE_HANDOFF_MODE.directAdd && handoff.opportunity;
  const isChoose =
    handoff?.mode === SMART_SAVE_HANDOFF_MODE.chooseShowtime && handoff.filmKey;

  return (
    <>
      <SmartSaveDirectAddSheet
        open={Boolean(isDirect)}
        handoff={isDirect ? handoff : null}
        onClose={close}
        storage={storage}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        onPlansChanged={onPlansChanged}
        onAdded={() => close()}
      />
      <SavedFilmChooseShowtimeSheet
        filmKey={isChoose ? handoff.filmKey : null}
        row={
          isChoose
            ? {
                title: handoff.title,
                filmId: handoff.film?.filmId ?? null,
                posterUrl: handoff.film?.posterUrl ?? null,
              }
            : null
        }
        open={Boolean(isChoose)}
        onClose={closeChoose}
        storage={storage}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        onOpenFilmDetail={onOpenFilmDetail}
        onPlansChanged={onPlansChanged}
        onAdded={() => close()}
      />
    </>
  );
}
