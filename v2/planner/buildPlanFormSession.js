/**
 * In-progress Build a Plan form session.
 * Shared by BuildPlanSurface and film-manage so remounts keep selections.
 *
 * Source inputs are also written to sessionStorage so a same-tab refresh
 * restores the draft. Leaving the Build a Plan tree no longer wipes the draft;
 * an abandoned draft expires with the browser tab/session.
 */

import { normalizeLockedShowtimes } from './lockedShowtimes.js';
import { normalizePlanSize } from './planSize.js';
import { normalizeBuildPlanTimeWindowFields } from './buildPlanTimeWindow.js';
import {
  clearBuildPlanDraftStorage,
  getBuildPlanDraftStorage,
  readBuildPlanDraft,
  writeBuildPlanDraft,
} from './buildPlanDraftPersistence.js';

let sessionForm = null;
let sessionListeners = new Set();
let persistDraft = true;

function notify() {
  for (const listener of sessionListeners) {
    try {
      listener(sessionForm);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {Storage | null | undefined} [explicit]
 * @returns {Storage | null}
 */
function resolveStorage(explicit) {
  if (explicit !== undefined) return explicit ?? null;
  return getBuildPlanDraftStorage();
}

/**
 * @param {object | null | undefined} form
 * @returns {object | null}
 */
function normalizeSessionForm(form) {
  if (!form || typeof form !== 'object') return form ?? null;
  const withTime = normalizeBuildPlanTimeWindowFields(form);
  return {
    ...withTime,
    planSize: normalizePlanSize(withTime.planSize),
    lockedShowtimes: normalizeLockedShowtimes(withTime.lockedShowtimes),
  };
}

function persistIfEnabled(storage) {
  if (!persistDraft || !sessionForm) return;
  writeBuildPlanDraft(resolveStorage(storage), sessionForm);
}

/**
 * @param {() => object} createFn
 * @param {{ persist?: boolean, storage?: Storage | null }} [options]
 * @returns {object}
 */
export function ensureBuildPlanFormSession(createFn, options = {}) {
  if (typeof options.persist === 'boolean') persistDraft = options.persist;
  if (!sessionForm) {
    if (persistDraft) {
      const stored = readBuildPlanDraft(resolveStorage(options.storage));
      if (stored.ok && stored.form) {
        sessionForm = normalizeSessionForm(stored.form);
        return sessionForm;
      }
    }
    sessionForm = normalizeSessionForm(createFn());
    persistIfEnabled(options.storage);
  }
  return sessionForm;
}

/** @returns {object | null} */
export function getBuildPlanFormSession() {
  return sessionForm;
}

/**
 * @param {object | ((prev: object) => object)} next
 * @param {{ persist?: boolean, storage?: Storage | null }} [options]
 * @returns {object | null}
 */
export function setBuildPlanFormSession(next, options = {}) {
  if (typeof options.persist === 'boolean') persistDraft = options.persist;
  if (typeof next === 'function') {
    sessionForm = normalizeSessionForm(next(sessionForm));
  } else {
    sessionForm = normalizeSessionForm(next);
  }
  persistIfEnabled(options.storage);
  notify();
  return sessionForm;
}

/**
 * @param {{ persist?: boolean, storage?: Storage | null }} [options]
 */
export function clearBuildPlanFormSession(options = {}) {
  sessionForm = null;
  persistDraft = true;
  if (options.persist !== false) {
    clearBuildPlanDraftStorage(resolveStorage(options.storage));
  }
  notify();
}

/**
 * @param {(form: object | null) => void} listener
 * @returns {() => void}
 */
export function subscribeBuildPlanFormSession(listener) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Replace one film bucket immutably.
 * @param {'mustInclude' | 'wouldLove' | 'notInterested'} bucketKey
 * @param {object[]} films
 * @param {{ storage?: Storage | null }} [options]
 */
export function setBuildPlanFormBucket(bucketKey, films, options = {}) {
  if (!sessionForm) return null;
  sessionForm = {
    ...sessionForm,
    [bucketKey]: films.map((f) => ({ ...f })),
  };
  persistIfEnabled(options.storage);
  notify();
  return sessionForm;
}
