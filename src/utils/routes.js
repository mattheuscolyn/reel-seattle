/** Canonical React route for the Marathon tab (no trailing slash). */
export const MARATHON_ROUTE = '/marathon';

/** Standalone marathon planner HTML loaded inside the React iframe. */
export const MARATHON_IFRAME_SRC = '/marathon/index.html';

/** True when pathname is the React marathon route (with or without trailing slash). */
export function isMarathonRoute(pathname) {
  return pathname === MARATHON_ROUTE || pathname === `${MARATHON_ROUTE}/`;
}
