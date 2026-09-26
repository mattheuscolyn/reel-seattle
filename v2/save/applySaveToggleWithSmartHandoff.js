/**
 * Shared save toggle + Smart Save handoff trigger for UI surfaces.
 */

import { applySaveToggle } from './saveActionState.js';
import { processSmartSaveHandoffAfterToggle } from './smartSaveHandoffController.js';
import {
  getScheduleSettings,
} from '../stores/scheduleSettingsStore.js';

/**
 * @param {{
 *   storage?: Storage | null,
 *   filmRef?: object | null,
 *   persist?: boolean,
 *   currentIsSaved?: boolean,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   now?: Date,
 * }} params
 */
export function applySaveToggleWithSmartHandoff({
  storage = null,
  filmRef = null,
  persist = true,
  currentIsSaved = false,
  saveOptions = null,
  homeData = null,
  enrichmentIndex = null,
  now = new Date(),
} = {}) {
  const result = applySaveToggle({
    storage,
    filmRef,
    persist,
    currentIsSaved,
    saveOptions,
  });

  if (!result.ok || !persist) {
    return { ...result, handoff: null };
  }

  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const handoff = processSmartSaveHandoffAfterToggle({
    storage,
    filmRef,
    becameSaved: result.becameSaved,
    becameUnsaved: result.becameUnsaved,
    homeData,
    enrichmentIndex,
    timeFormatId,
    now,
    emit: true,
  });

  return { ...result, handoff };
}
