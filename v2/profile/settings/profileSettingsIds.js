/**
 * Nested Profile Settings sections (Slice 2).
 * One surface, section-specific content — not six routing systems.
 */

export const PROFILE_SETTINGS_SURFACE_TYPE = 'profile-settings';

export const PROFILE_SETTINGS_SECTION_IDS = Object.freeze({
  notifications: 'notifications',
  preferences: 'preferences',
  privacySharing: 'privacy-sharing',
  accountSecurity: 'account-security',
  calendar: 'calendar',
  about: 'about',
});

export const PROFILE_SETTINGS_SECTION_LIST = Object.freeze([
  PROFILE_SETTINGS_SECTION_IDS.notifications,
  PROFILE_SETTINGS_SECTION_IDS.preferences,
  PROFILE_SETTINGS_SECTION_IDS.privacySharing,
  PROFILE_SETTINGS_SECTION_IDS.accountSecurity,
  PROFILE_SETTINGS_SECTION_IDS.calendar,
  PROFILE_SETTINGS_SECTION_IDS.about,
]);

/**
 * @param {string | null | undefined} sectionId
 * @returns {string}
 */
export function resolveProfileSettingsSectionId(sectionId) {
  return PROFILE_SETTINGS_SECTION_LIST.includes(sectionId)
    ? sectionId
    : PROFILE_SETTINGS_SECTION_IDS.notifications;
}
