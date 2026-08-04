/**
 * Pure Profile identity helpers (T-ACCOUNT-PROFILE-DATA-01).
 * Precedence is authoritative for Profile UI and Account panel.
 */

export const PROFILE_GENERIC_DISPLAY_NAME = 'Reel Seattle user';
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function emailLocalPart(email) {
  const raw = asTrimmedString(email);
  if (!raw || !raw.includes('@')) return '';
  const local = raw.slice(0, raw.indexOf('@')).trim();
  return local;
}

/**
 * Display name precedence:
 * 1. profiles.display_name
 * 2. Google/Auth full_name
 * 3. Google/Auth name
 * 4. Email local part
 * 5. "Reel Seattle user"
 *
 * Never returns "Mattheus" as a hardcoded fallback.
 *
 * @param {object | null | undefined} user
 * @param {object | null | undefined} [profile]
 * @returns {string}
 */
export function resolveProfileDisplayName(user, profile = null) {
  const profileName = asTrimmedString(profile?.display_name);
  if (profileName) return profileName;

  const meta = user?.user_metadata;
  if (meta && typeof meta === 'object') {
    const fullName = asTrimmedString(meta.full_name);
    if (fullName) return fullName;
    const name = asTrimmedString(meta.name);
    if (name) return name;
  }

  const local = emailLocalPart(user?.email);
  if (local) return local;

  return PROFILE_GENERIC_DISPLAY_NAME;
}

/**
 * Safe https avatar URL.
 * 1. profiles.avatar_url
 * 2. Google/Auth avatar_url or picture
 *
 * @param {object | null | undefined} profile
 * @param {object | null | undefined} [user]
 * @returns {string | null}
 */
export function resolveProfileAvatarUrl(profile = null, user = null) {
  const candidates = [
    asTrimmedString(profile?.avatar_url),
    asTrimmedString(user?.user_metadata?.avatar_url),
    asTrimmedString(user?.user_metadata?.picture),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') continue;
      return url.href;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function initialsFromDisplayName(displayName) {
  const raw = asTrimmedString(displayName);
  if (!raw) return '?';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return raw.slice(0, 1).toUpperCase();
}

/**
 * Normalize a user-edited display name for profiles.display_name.
 * Empty / whitespace → null (clears custom override).
 *
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, error: string }}
 */
export function normalizeEditableDisplayName(value) {
  if (value == null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'Display name must be text.' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Display name must be ${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Auth-metadata seeds for missing-row recovery (never mock names).
 *
 * @param {object | null | undefined} user
 * @returns {{ display_name: string | null, avatar_url: string | null }}
 */
export function profileSeedFromAuthUser(user) {
  const meta = user?.user_metadata;
  let display_name = null;
  let avatar_url = null;
  if (meta && typeof meta === 'object') {
    const fullName = asTrimmedString(meta.full_name);
    const name = asTrimmedString(meta.name);
    display_name = fullName || name || null;
    const avatar =
      asTrimmedString(meta.avatar_url) || asTrimmedString(meta.picture) || '';
    if (avatar) {
      try {
        const url = new URL(avatar);
        if (url.protocol === 'https:') avatar_url = url.href;
      } catch {
        avatar_url = null;
      }
    }
  }
  return { display_name, avatar_url };
}
