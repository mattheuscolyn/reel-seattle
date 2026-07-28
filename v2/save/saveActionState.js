/**
 * Save action model + persistence helpers for UI consumers (T-SAVE-03).
 * Presentation components receive booleans/callbacks; store I/O stays here.
 */

import { filmRefFromHomeFilm } from './filmRefFromFilm.js';
import {
  isFilmSaved,
  toggleSavedFilm,
} from '../stores/savedFilmsStore.js';

/**
 * @typedef {{
 *   available: boolean,
 *   isSaved: boolean,
 *   label: string,
 *   activeLabel: string,
 *   persist: boolean,
 *   filmRef: object | null,
 *   error: string | null,
 * }} SaveActionState
 */

/**
 * @param {{
 *   mode?: 'production' | 'mockup-fixture' | 'visual-fixture' | string | null,
 *   film?: object | null,
 *   filmRef?: object | null,
 *   storage?: Storage | null,
 *   fixtureIsSaved?: boolean,
 *   error?: string | null,
 * }} params
 * @returns {SaveActionState}
 */
export function buildSaveActionState({
  mode = 'production',
  film = null,
  filmRef = null,
  storage = null,
  fixtureIsSaved = false,
  error = null,
} = {}) {
  const isQc = mode === 'mockup-fixture' || mode === 'visual-fixture';
  if (isQc) {
    const saved = Boolean(fixtureIsSaved);
    return {
      available: true,
      isSaved: saved,
      label: saved ? 'Saved' : 'Save',
      activeLabel: 'Saved',
      persist: false,
      filmRef: null,
      error: null,
    };
  }

  const ref = filmRef ?? filmRefFromHomeFilm(film);
  if (!ref) {
    return {
      available: false,
      isSaved: false,
      label: 'Save',
      activeLabel: 'Saved',
      persist: false,
      filmRef: null,
      error: error ?? null,
    };
  }

  const saved = isFilmSaved(storage, ref);
  return {
    available: true,
    isSaved: saved,
    label: saved ? 'Saved' : 'Save',
    activeLabel: 'Saved',
    persist: true,
    filmRef: ref,
    error: error ?? null,
  };
}

/**
 * Toggle save with confirmed-write semantics. On failure, isSaved reflects
 * the store (prior truth), never a false success.
 *
 * @param {{
 *   storage?: Storage | null,
 *   filmRef: object | null,
 *   persist?: boolean,
 *   currentIsSaved?: boolean,
 * }} params
 * @returns {{
 *   ok: boolean,
 *   isSaved: boolean,
 *   error: string | null,
 *   changed: boolean,
 * }}
 */
export function applySaveToggle({
  storage = null,
  filmRef = null,
  persist = true,
  currentIsSaved = false,
} = {}) {
  if (!persist) {
    const next = !currentIsSaved;
    return {
      ok: true,
      isSaved: next,
      error: null,
      changed: true,
    };
  }

  if (!filmRef) {
    return {
      ok: false,
      isSaved: false,
      error: 'invalid_ref',
      changed: false,
    };
  }

  const prior = isFilmSaved(storage, filmRef);
  const result = toggleSavedFilm(storage, filmRef);
  if (!result.ok) {
    return {
      ok: false,
      isSaved: isFilmSaved(storage, filmRef),
      error: result.error ?? 'storage_set_failed',
      changed: false,
    };
  }

  const next = Boolean(result.saved);
  return {
    ok: true,
    isSaved: next,
    error: null,
    changed: prior !== next || Boolean(result.changed),
  };
}
