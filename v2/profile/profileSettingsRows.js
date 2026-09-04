/**
 * Profile settings rows — each opens a nested Settings section.
 */

import { PROFILE_SETTINGS_SECTION_IDS } from './settings/profileSettingsIds.js';

export const PROFILE_SETTINGS_SECTION_TITLE = 'Settings';

export const PROFILE_SETTINGS_ROWS = Object.freeze([
  Object.freeze({
    id: 'notifications',
    sectionId: PROFILE_SETTINGS_SECTION_IDS.notifications,
    label: 'Notifications & Alerts',
    icon: 'bell',
  }),
  Object.freeze({
    id: 'preferences',
    sectionId: PROFILE_SETTINGS_SECTION_IDS.preferences,
    label: 'Preferences',
    icon: 'clock',
  }),
  Object.freeze({
    id: 'privacy',
    sectionId: PROFILE_SETTINGS_SECTION_IDS.privacySharing,
    label: 'Privacy & Sharing',
    icon: 'lock',
  }),
  Object.freeze({
    id: 'account',
    sectionId: PROFILE_SETTINGS_SECTION_IDS.accountSecurity,
    label: 'Account & Security',
    icon: 'shield',
  }),
  Object.freeze({
    id: 'calendar',
    sectionId: PROFILE_SETTINGS_SECTION_IDS.calendar,
    label: 'Calendar',
    icon: 'calendar',
  }),
  Object.freeze({
    id: 'about',
    sectionId: PROFILE_SETTINGS_SECTION_IDS.about,
    label: 'About Reel Seattle',
    icon: 'info',
  }),
]);
