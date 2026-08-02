/**
 * In-progress Build a Plan form session.
 * Shared by BuildPlanSurface and film-manage so remounts keep selections.
 * Cleared when leaving the Build a Plan surface tree (not Manage).
 */

let sessionForm = null;
let sessionListeners = new Set();

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
 * @param {() => object} createFn
 * @returns {object}
 */
export function ensureBuildPlanFormSession(createFn) {
  if (!sessionForm) {
    sessionForm = createFn();
  }
  return sessionForm;
}

/** @returns {object | null} */
export function getBuildPlanFormSession() {
  return sessionForm;
}

/**
 * @param {object | ((prev: object) => object)} next
 * @returns {object | null}
 */
export function setBuildPlanFormSession(next) {
  if (typeof next === 'function') {
    sessionForm = next(sessionForm);
  } else {
    sessionForm = next;
  }
  notify();
  return sessionForm;
}

export function clearBuildPlanFormSession() {
  sessionForm = null;
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
 */
export function setBuildPlanFormBucket(bucketKey, films) {
  if (!sessionForm) return null;
  sessionForm = {
    ...sessionForm,
    [bucketKey]: films.map((f) => ({ ...f })),
  };
  notify();
  return sessionForm;
}
