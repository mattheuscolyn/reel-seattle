/**
 * Profile settings row stubs (labels only — destinations not implemented yet).
 */

export const PROFILE_SETTINGS_SECTION_TITLE = 'Settings';

export const PROFILE_SETTINGS_ROWS = Object.freeze([
  Object.freeze({
    id: 'notifications',
    label: 'Notifications & Alerts',
    icon: 'bell',
  }),
  Object.freeze({
    id: 'accessibility',
    label: 'Accessibility',
    icon: 'accessibility',
  }),
  Object.freeze({
    id: 'appearance',
    label: 'Appearance',
    icon: 'sun',
  }),
  Object.freeze({
    id: 'privacy',
    label: 'Privacy & Data',
    icon: 'lock',
  }),
  Object.freeze({
    id: 'account',
    label: 'Account & Security',
    icon: 'shield',
  }),
  Object.freeze({
    id: 'connected',
    label: 'Connected Services',
    icon: 'link',
  }),
  Object.freeze({
    id: 'about',
    label: 'About Reel Seattle',
    icon: 'info',
  }),
]);
