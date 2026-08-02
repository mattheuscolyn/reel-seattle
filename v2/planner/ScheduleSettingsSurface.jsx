/**
 * Schedule Settings — bottom sheet over My Schedule (T-SCH-01).
 *
 * Persists display prefs via scheduleSettingsStore.
 * Calendar sync remains Off/deferred. Genre coloring suppressed.
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  IconBuilding,
  IconCalendar,
  IconCheckCircle,
  IconChevron,
  IconClock,
  IconClose,
  IconCup,
  IconEye,
  IconFilm,
  IconHeart,
  IconInfo,
  IconPalette,
  IconSearch,
  IconStar,
  IconTicket,
  IconTrash,
} from '../icons.jsx';
import {
  SCHEDULE_SETTINGS_TIME_FORMATS,
  cycleTimelineZoomId,
  resolveScheduleSettingsPresentation,
  resolveTimelineZoomLabel,
} from '../fixtures/scheduleSettingsMockupFixture.js';
import {
  getScheduleSettings,
  updateScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import { clearAcceptedPlans } from '../stores/acceptedPlansStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const ROW_ICONS = {
  eye: IconEye,
  cup: IconCup,
  search: IconSearch,
  calendar: IconCalendar,
  clock: IconClock,
  palette: IconPalette,
  info: IconInfo,
  trash: IconTrash,
};

function SettingsToggle({ id, label, support, icon: Icon, checked, onChange }) {
  return (
    <label className="v2-ss-toggle" htmlFor={id}>
      <span className="v2-ss-row-icon" aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <span className="v2-ss-row-copy">
        <span className="v2-ss-row-label">{label}</span>
        <span className="v2-ss-row-support">{support}</span>
      </span>
      <span className="v2-ss-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="v2-ss-switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}

function SettingsNavRow({
  label,
  support,
  icon: Icon,
  valueLabel = null,
  valueMuted = false,
  danger = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={danger ? 'v2-ss-nav-row v2-ss-nav-row-danger' : 'v2-ss-nav-row'}
      onClick={onClick}
    >
      <span className="v2-ss-row-icon" aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <span className="v2-ss-row-copy">
        <span className="v2-ss-row-label">{label}</span>
        <span className="v2-ss-row-support">{support}</span>
      </span>
      {valueLabel ? (
        <span
          className={
            valueMuted ? 'v2-ss-nav-value v2-ss-nav-value-muted' : 'v2-ss-nav-value'
          }
        >
          {valueLabel}
        </span>
      ) : null}
      <span className="v2-ss-nav-chevron" aria-hidden="true">
        <IconChevron />
      </span>
    </button>
  );
}

function TimeFormatControl({ label, support, value, onChange }) {
  return (
    <div className="v2-ss-pref-block">
      <div className="v2-ss-pref-head">
        <span className="v2-ss-row-icon" aria-hidden="true">
          <IconClock width={18} height={18} />
        </span>
        <span className="v2-ss-row-copy">
          <span className="v2-ss-row-label">{label}</span>
          <span className="v2-ss-row-support">{support}</span>
        </span>
      </div>
      <div
        className="v2-ss-segment"
        role="group"
        aria-label={label}
      >
        {SCHEDULE_SETTINGS_TIME_FORMATS.map((opt) => {
          const selected = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              className={
                selected
                  ? 'v2-ss-segment-btn v2-ss-segment-btn-active'
                  : 'v2-ss-segment-btn'
              }
              aria-pressed={selected}
              onClick={() => onChange(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorModeCard({ mode, selected, onSelect }) {
  return (
    <button
      type="button"
      className={
        selected
          ? 'v2-ss-color-card v2-ss-color-card-selected'
          : 'v2-ss-color-card'
      }
      aria-pressed={selected}
      onClick={() => onSelect(mode.id)}
      data-color-mode={mode.id}
    >
      {selected ? (
        <span className="v2-ss-color-check" aria-hidden="true">
          <IconCheckCircle width={16} height={16} />
        </span>
      ) : null}
      <span className="v2-ss-color-card-title">
        {mode.title}
        {mode.badge ? (
          <span className="v2-ss-color-badge">{mode.badge}</span>
        ) : null}
      </span>
      {mode.preview === 'opportunity' ? (
        <span className="v2-ss-color-preview" aria-hidden="true">
          <IconFilm width={14} height={14} />
          <IconTicket width={14} height={14} />
          <span className="v2-ss-imax">IMAX</span>
          <IconStar width={14} height={14} />
        </span>
      ) : null}
      {mode.preview === 'theater' ? (
        <span className="v2-ss-color-preview" aria-hidden="true">
          <span className="v2-ss-theater-swatch v2-ss-theater-blue">
            <IconBuilding width={14} height={14} />
          </span>
          <span className="v2-ss-theater-swatch v2-ss-theater-red">
            <IconBuilding width={14} height={14} />
          </span>
          <span className="v2-ss-theater-swatch v2-ss-theater-purple">
            <IconBuilding width={14} height={14} />
          </span>
        </span>
      ) : null}
      {mode.preview === 'genre' ? (
        <span className="v2-ss-color-preview" aria-hidden="true">
          <span className="v2-ss-genre-dot v2-ss-genre-red" />
          <span className="v2-ss-genre-dot v2-ss-genre-orange" />
          <span className="v2-ss-genre-dot v2-ss-genre-yellow" />
          <span className="v2-ss-genre-dot v2-ss-genre-green" />
          <span className="v2-ss-genre-dot v2-ss-genre-teal" />
        </span>
      ) : null}
      {mode.support ? (
        <span className="v2-ss-color-card-support">{mode.support}</span>
      ) : null}
    </button>
  );
}

/**
 * @param {{
 *   onClose: () => void,
 *   onOpenAbout?: () => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onSettingsChange?: () => void,
 *   onAcceptedPlanChange?: () => void,
 *   storage?: Storage | null,
 * }} props
 */
export default function ScheduleSettingsSurface({
  onClose,
  onOpenAbout,
  onStubAction,
  onSettingsChange,
  onAcceptedPlanChange,
  storage = null,
}) {
  const presentation = resolveScheduleSettingsPresentation();
  const titleId = useId();
  const statusId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const resolvedStorage = storage ?? getBrowserStorage();
  const [ui, setUi] = useState(() => getScheduleSettings(resolvedStorage));
  const [statusMessage, setStatusMessage] = useState(null);

  const { display, sync, preferences, about } = presentation.sections;

  const persist = (patch) => {
    const result = updateScheduleSettings(resolvedStorage, patch);
    if (result.ok) {
      setUi(result.settings);
      if (result.changed) onSettingsChange?.();
    } else {
      setStatusMessage('Couldn’t save schedule settings.');
    }
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const announce = (actionId, label, message) => {
    setStatusMessage(message ?? label);
    onStubAction?.(actionId, label);
  };

  const legend =
    preferences.colorCoding.legends[ui.colorCodingId] ??
    preferences.colorCoding.legends.opportunity;

  return (
    <div
      className="v2-ss-backdrop"
      role="presentation"
      data-schedule-settings-source={presentation.source}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="v2-ss-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-ss-header" data-ss-section="header">
          <h1 id={titleId} className="v2-ss-title">
            {presentation.title}
          </h1>
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close"
            aria-label={presentation.closeLabel}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-ss-body">
          <section
            className="v2-ss-section"
            data-ss-section="display"
            aria-labelledby="v2-ss-display-h"
          >
            <h2 id="v2-ss-display-h" className="v2-ss-section-title">
              {display.title}
            </h2>
            <SettingsToggle
              id="v2-ss-hide-completed"
              label={display.hideCompleted.label}
              support={display.hideCompleted.support}
              icon={ROW_ICONS[display.hideCompleted.icon]}
              checked={ui.hideCompleted}
              onChange={(checked) => persist({ hideCompleted: checked })}
            />
            <SettingsToggle
              id="v2-ss-show-breaks"
              label={display.showBreaks.label}
              support={display.showBreaks.support}
              icon={ROW_ICONS[display.showBreaks.icon]}
              checked={ui.showBreaks}
              onChange={(checked) => persist({ showBreaks: checked })}
            />
            <SettingsNavRow
              label={display.timelineZoom.label}
              support={display.timelineZoom.support}
              icon={ROW_ICONS[display.timelineZoom.icon]}
              valueLabel={resolveTimelineZoomLabel(ui.timelineZoomId)}
              onClick={() =>
                persist({
                  timelineZoomId: cycleTimelineZoomId(ui.timelineZoomId),
                })
              }
            />
          </section>

          <section
            className="v2-ss-section"
            data-ss-section="sync"
            aria-labelledby="v2-ss-sync-h"
          >
            <h2 id="v2-ss-sync-h" className="v2-ss-section-title">
              {sync.title}
            </h2>
            <SettingsNavRow
              label={sync.calendarSync.label}
              support={sync.calendarSync.support}
              icon={ROW_ICONS[sync.calendarSync.icon]}
              valueLabel={sync.calendarSync.valueLabel}
              valueMuted
              onClick={() =>
                announce(
                  sync.calendarSync.id,
                  sync.calendarSync.label,
                  sync.calendarSync.deferredMessage,
                )
              }
            />
          </section>

          <section
            className="v2-ss-section"
            data-ss-section="preferences"
            aria-labelledby="v2-ss-prefs-h"
          >
            <h2 id="v2-ss-prefs-h" className="v2-ss-section-title">
              {preferences.title}
            </h2>
            <TimeFormatControl
              label={preferences.timeFormat.label}
              support={preferences.timeFormat.support}
              value={ui.timeFormatId}
              onChange={(timeFormatId) => persist({ timeFormatId })}
            />

            <div className="v2-ss-pref-block">
              <div className="v2-ss-pref-head">
                <span className="v2-ss-row-icon" aria-hidden="true">
                  <IconPalette width={18} height={18} />
                </span>
                <span className="v2-ss-row-copy">
                  <span className="v2-ss-row-label">
                    {preferences.colorCoding.label}
                  </span>
                  <span className="v2-ss-row-support">
                    {preferences.colorCoding.support}
                  </span>
                </span>
              </div>
              <div
                className="v2-ss-color-grid"
                role="group"
                aria-label={preferences.colorCoding.label}
              >
                {preferences.colorCoding.modes.map((mode) => (
                  <ColorModeCard
                    key={mode.id}
                    mode={mode}
                    selected={ui.colorCodingId === mode.id}
                    onSelect={(colorCodingId) => persist({ colorCodingId })}
                  />
                ))}
              </div>
              <ul className="v2-ss-legend" aria-label="Color coding legend">
                {legend.map((item) => (
                  <li key={item.id} className="v2-ss-legend-item">
                    <span
                      className={`v2-ss-legend-swatch v2-ss-legend-${item.swatch}`}
                      aria-hidden="true"
                    >
                      {item.swatch === 'green' ? (
                        <IconHeart width={12} height={12} />
                      ) : item.swatch === 'purple' ? (
                        <IconStar width={12} height={12} />
                      ) : item.swatch === 'blue' ? (
                        <IconTicket width={12} height={12} />
                      ) : (
                        <IconFilm width={12} height={12} />
                      )}
                    </span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
              <p className="v2-ss-footer-note">
                {preferences.colorCoding.footerNote}
              </p>
            </div>
          </section>

          <section
            className="v2-ss-section"
            data-ss-section="about"
            aria-labelledby="v2-ss-about-h"
          >
            <h2 id="v2-ss-about-h" className="v2-ss-section-title">
              {about.title}
            </h2>
            <SettingsNavRow
              label={about.aboutSchedule.label}
              support={about.aboutSchedule.support}
              icon={ROW_ICONS[about.aboutSchedule.icon]}
              onClick={() => {
                if (typeof onOpenAbout === 'function') {
                  onOpenAbout();
                  return;
                }
                announce(
                  about.aboutSchedule.id,
                  about.aboutSchedule.label,
                  'About My Schedule isn’t wired from Settings in this shell yet.',
                );
              }}
            />
            <SettingsNavRow
              label={about.clearAll.label}
              support={about.clearAll.support}
              icon={ROW_ICONS[about.clearAll.icon]}
              danger
              onClick={() => {
                const ok =
                  typeof window !== 'undefined'
                    ? window.confirm(
                        'Clear all accepted plans from this device? This cannot be undone.',
                      )
                    : false;
                if (!ok) {
                  announce(
                    about.clearAll.id,
                    about.clearAll.label,
                    'Clear cancelled.',
                  );
                  return;
                }
                const result = clearAcceptedPlans(resolvedStorage);
                if (result.ok) {
                  setStatusMessage('Accepted plans cleared.');
                  onAcceptedPlanChange?.();
                } else {
                  setStatusMessage('Couldn’t clear schedule data.');
                }
                onStubAction?.(about.clearAll.id, about.clearAll.label);
              }}
            />
          </section>
        </div>

        <p
          id={statusId}
          className="v2-visually-hidden"
          role="status"
          aria-live="polite"
        >
          {statusMessage ?? ''}
        </p>
      </div>
    </div>
  );
}
