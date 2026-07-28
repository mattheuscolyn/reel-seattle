/**
 * Seen action model + persistence helpers for UI consumers (T-SEEN-03).
 * Mirrors Save wiring: presentation gets booleans/callbacks; store I/O stays here.
 * Generic toggles never attach showtimeRef.
 */

import { filmRefFromHomeFilm } from './filmRefFromFilm.js';
import {
  isFilmSeen,
  toggleFilmSeen,
} from '../stores/seenFilmsStore.js';

/**
 * @typedef {{
 *   available: boolean,
 *   isSeen: boolean,
 *   label: string,
 *   activeLabel: string,
 *   persist: boolean,
 *   filmRef: object | null,
 *   error: string | null,
 * }} SeenActionState
 */

/**
 * @param {{
 *   mode?: 'production' | 'mockup-fixture' | 'visual-fixture' | string | null,
 *   film?: object | null,
 *   filmRef?: object | null,
 *   storage?: Storage | null,
 *   fixtureIsSeen?: boolean,
 *   error?: string | null,
 * }} params
 * @returns {SeenActionState}
 */
export function buildSeenActionState({
  mode = 'production',
  film = null,
  filmRef = null,
  storage = null,
  fixtureIsSeen = false,
  error = null,
} = {}) {
  const isQc = mode === 'mockup-fixture' || mode === 'visual-fixture';
  if (isQc) {
    const seen = Boolean(fixtureIsSeen);
    return {
      available: true,
      isSeen: seen,
      label: 'Seen',
      activeLabel: 'Seen',
      persist: false,
      filmRef: null,
      error: null,
    };
  }

  const ref = filmRef ?? filmRefFromHomeFilm(film);
  if (!ref) {
    return {
      available: false,
      isSeen: false,
      label: 'Seen',
      activeLabel: 'Seen',
      persist: false,
      filmRef: null,
      error: error ?? null,
    };
  }

  const seen = isFilmSeen(storage, ref);
  return {
    available: true,
    isSeen: seen,
    label: 'Seen',
    activeLabel: 'Seen',
    persist: true,
    filmRef: ref,
    error: error ?? null,
  };
}

/**
 * Toggle Seen with confirmed-write semantics. Never passes showtimeRef.
 *
 * @param {{
 *   storage?: Storage | null,
 *   filmRef: object | null,
 *   persist?: boolean,
 *   currentIsSeen?: boolean,
 * }} params
 * @returns {{
 *   ok: boolean,
 *   isSeen: boolean,
 *   error: string | null,
 *   changed: boolean,
 * }}
 */
export function applySeenToggle({
  storage = null,
  filmRef = null,
  persist = true,
  currentIsSeen = false,
} = {}) {
  if (!persist) {
    return {
      ok: true,
      isSeen: !currentIsSeen,
      error: null,
      changed: true,
    };
  }

  if (!filmRef) {
    return {
      ok: false,
      isSeen: false,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const prior = isFilmSeen(storage, filmRef);
  // Explicitly omit showtimeRef — generic UI toggles are film-level only.
  const result = toggleFilmSeen(storage, filmRef, {});
  if (!result.ok) {
    return {
      ok: false,
      isSeen: isFilmSeen(storage, filmRef),
      error: result.error ?? 'storage_set_failed',
      changed: false,
    };
  }

  const next = Boolean(result.seen);
  return {
    ok: true,
    isSeen: next,
    error: null,
    changed: prior !== next || Boolean(result.changed),
  };
}
