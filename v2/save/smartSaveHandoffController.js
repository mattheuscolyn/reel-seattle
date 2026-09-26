/**
 * Orchestrate Smart Save handoff after a save toggle.
 */

import { evaluateSmartSaveHandoff, SMART_SAVE_HANDOFF_MODE } from './smartSaveHandoffModel.js';
import {
  clearSmartSaveHandoffDismissal,
  dismissSmartSaveHandoff,
  isSmartSaveHandoffDismissed,
} from './smartSaveHandoffDismissals.js';

/** @type {Set<(payload: object) => void>} */
const listeners = new Set();

/**
 * @param {(payload: object) => void} listener
 */
export function subscribeSmartSaveHandoff(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * @param {object | null} payload
 */
export function emitSmartSaveHandoff(payload) {
  if (!payload || payload.mode === SMART_SAVE_HANDOFF_MODE.none) return;
  for (const listener of [...listeners]) {
    try {
      listener(payload);
    } catch {
      // Host failures must never undo a successful Save.
    }
  }
}

/**
 * After a successful save toggle: clear dismissal on unsave, or evaluate handoff
 * on not-saved → saved.
 *
 * @param {{
 *   storage?: Storage | null,
 *   filmRef?: object | null,
 *   becameSaved?: boolean,
 *   becameUnsaved?: boolean,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   now?: Date,
 *   emit?: boolean,
 * }} params
 */
export function processSmartSaveHandoffAfterToggle({
  storage = null,
  filmRef = null,
  becameSaved = false,
  becameUnsaved = false,
  homeData = null,
  enrichmentIndex = null,
  timeFormatId = '12h',
  now = new Date(),
  emit = true,
} = {}) {
  if (becameUnsaved) {
    clearSmartSaveHandoffDismissal(storage, filmRef);
    return {
      mode: SMART_SAVE_HANDOFF_MODE.none,
      reason: 'unsaved',
      filmKey: null,
      opportunities: [],
      opportunity: null,
    };
  }

  if (!becameSaved) {
    return {
      mode: SMART_SAVE_HANDOFF_MODE.none,
      reason: 'not_transition',
      filmKey: null,
      opportunities: [],
      opportunity: null,
    };
  }

  const dismissed = isSmartSaveHandoffDismissed(storage, filmRef);
  const evaluation = evaluateSmartSaveHandoff({
    homeData,
    filmRef,
    storage,
    enrichmentIndex,
    timeFormatId,
    now,
    dismissed,
  });

  if (emit) emitSmartSaveHandoff(evaluation);
  return evaluation;
}

/**
 * User declined the prompt — suppress while film remains saved.
 *
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 */
export function declineSmartSaveHandoff(storage, filmRef) {
  return dismissSmartSaveHandoff(storage, filmRef);
}

export { SMART_SAVE_HANDOFF_MODE };
