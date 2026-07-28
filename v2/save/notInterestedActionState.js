/**
 * Not Interested action model + persistence helpers for UI consumers (T-NI-03).
 * Mirrors Save/Seen wiring: presentation gets booleans/callbacks; store I/O stays here.
 * Generic toggles never invent a reason.
 */

import { filmRefFromHomeFilm } from './filmRefFromFilm.js';
import {
  isFilmNotInterested,
  toggleFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';

/**
 * @typedef {{
 *   available: boolean,
 *   isNotInterested: boolean,
 *   label: string,
 *   activeLabel: string,
 *   persist: boolean,
 *   filmRef: object | null,
 *   error: string | null,
 * }} NotInterestedActionState
 */

/**
 * @param {{
 *   mode?: 'production' | 'mockup-fixture' | 'visual-fixture' | string | null,
 *   film?: object | null,
 *   filmRef?: object | null,
 *   storage?: Storage | null,
 *   fixtureIsNotInterested?: boolean,
 *   error?: string | null,
 * }} params
 * @returns {NotInterestedActionState}
 */
export function buildNotInterestedActionState({
  mode = 'production',
  film = null,
  filmRef = null,
  storage = null,
  fixtureIsNotInterested = false,
  error = null,
} = {}) {
  const isQc = mode === 'mockup-fixture' || mode === 'visual-fixture';
  if (isQc) {
    const notInterested = Boolean(fixtureIsNotInterested);
    return {
      available: true,
      isNotInterested: notInterested,
      label: 'Not interested',
      activeLabel: 'Not interested',
      persist: false,
      filmRef: null,
      error: null,
    };
  }

  const ref = filmRef ?? filmRefFromHomeFilm(film);
  if (!ref) {
    return {
      available: false,
      isNotInterested: false,
      label: 'Not interested',
      activeLabel: 'Not interested',
      persist: false,
      filmRef: null,
      error: error ?? null,
    };
  }

  const notInterested = isFilmNotInterested(storage, ref);
  return {
    available: true,
    isNotInterested: notInterested,
    label: 'Not interested',
    activeLabel: 'Not interested',
    persist: true,
    filmRef: ref,
    error: error ?? null,
  };
}

/**
 * Toggle Not Interested with confirmed-write semantics. Never invents reason.
 *
 * @param {{
 *   storage?: Storage | null,
 *   filmRef: object | null,
 *   persist?: boolean,
 *   currentIsNotInterested?: boolean,
 * }} params
 * @returns {{
 *   ok: boolean,
 *   isNotInterested: boolean,
 *   error: string | null,
 *   changed: boolean,
 * }}
 */
export function applyNotInterestedToggle({
  storage = null,
  filmRef = null,
  persist = true,
  currentIsNotInterested = false,
} = {}) {
  if (!persist) {
    return {
      ok: true,
      isNotInterested: !currentIsNotInterested,
      error: null,
      changed: true,
    };
  }

  if (!filmRef) {
    return {
      ok: false,
      isNotInterested: false,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const prior = isFilmNotInterested(storage, filmRef);
  const result = toggleFilmNotInterested(storage, filmRef, {});
  if (!result.ok) {
    return {
      ok: false,
      isNotInterested: isFilmNotInterested(storage, filmRef),
      error: result.error ?? 'storage_set_failed',
      changed: false,
    };
  }

  const next = Boolean(result.notInterested);
  return {
    ok: true,
    isNotInterested: next,
    error: null,
    changed: prior !== next || Boolean(result.changed),
  };
}
