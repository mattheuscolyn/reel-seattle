/**
 * Smart Save handoff — one-screening "Add to Planner?" confirmation sheet.
 * Not labeled "Smart Save" in the UI.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { IconClose } from '../icons.jsx';
import { addSavedFilmShowtimeToPlanner } from '../planner/addSavedFilmShowtimeToPlanner.js';
import { declineSmartSaveHandoff } from './smartSaveHandoffController.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   open: boolean,
 *   handoff?: object | null,
 *   onClose: () => void,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onPlansChanged?: (() => void) | null,
 *   onAdded?: ((message: string) => void) | null,
 * }} props
 */
export default function SmartSaveDirectAddSheet({
  open,
  handoff = null,
  onClose,
  storage: storageProp = null,
  homeData = null,
  enrichmentIndex = null,
  onPlansChanged = null,
  onAdded = null,
}) {
  const titleId = useId();
  const statusId = useId();
  const closeRef = useRef(null);
  const storage = storageProp ?? getBrowserStorage();
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setStatusMessage(null);
    }
  }, [open, handoff?.filmKey]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        declineSmartSaveHandoff(storage, handoff?.filmRef);
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, handoff?.filmRef, storage, onClose]);

  if (!open || !handoff?.opportunity || !handoff?.filmKey) return null;

  const handleDecline = () => {
    declineSmartSaveHandoff(storage, handoff.filmRef);
    onClose();
  };

  const handleAdd = () => {
    if (busy) return;
    setBusy(true);
    const result = addSavedFilmShowtimeToPlanner(
      storage,
      handoff.opportunity,
      handoff.filmKey,
      { homeData, enrichmentIndex },
    );
    if (result.ok) {
      onPlansChanged?.();
      if (result.status === 'already_planned') {
        setStatusMessage('Already in Planner.');
        window.setTimeout(() => {
          onClose();
        }, 600);
      } else {
        onAdded?.('Added to Planner.');
        onClose();
      }
    } else {
      setStatusMessage('Could not add this showtime to Planner.');
      setBusy(false);
    }
  };

  return (
    <div
      className="v2-ss-backdrop"
      role="presentation"
      data-smart-save-handoff="direct-add"
      data-film-key={handoff.filmKey}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleDecline();
      }}
    >
      <div
        className="v2-ss-sheet v2-ssh-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />
        <header className="v2-ssh-header">
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close"
            aria-label="Dismiss"
            onClick={handleDecline}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-ssh-body">
          <h1 id={titleId} className="v2-ssh-title">
            Only one upcoming screening
          </h1>
          <p className="v2-ssh-film">{handoff.title}</p>
          {handoff.rowLabel ? (
            <p className="v2-ssh-screening">{handoff.rowLabel}</p>
          ) : null}
          <p className="v2-ssh-prompt">Add to Planner?</p>
        </div>

        <div className="v2-ssh-actions">
          <button
            type="button"
            className="v2-ssh-primary"
            disabled={busy}
            onClick={handleAdd}
          >
            Add to Planner
          </button>
          <button
            type="button"
            className="v2-ssh-secondary"
            disabled={busy}
            onClick={handleDecline}
          >
            Not now
          </button>
        </div>

        <p id={statusId} className="v2-ssh-status" role="status" aria-live="polite">
          {statusMessage ?? ''}
        </p>
      </div>
    </div>
  );
}
