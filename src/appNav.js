/**
 * Primary navigation links shown in the app shell.
 * Legacy planner routes remain reachable by direct URL but are not listed here (PR 66).
 */
export const APP_NAV_LINKS = [
  { to: '/', label: 'Showtimes', end: true },
  { to: '/planner', label: 'Planner', primary: true },
];

/** Legacy planner routes kept reachable by direct URL (hidden from main nav). */
export const LEGACY_PLANNER_ROUTES = {
  doubleFeature: '/double-feature',
  marathon: '/marathon',
};
