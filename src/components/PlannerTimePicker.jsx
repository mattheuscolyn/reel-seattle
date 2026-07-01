import { useEffect, useRef, useState } from 'react';
import { formatMinutesToTime, parseTimeToMinutes } from '../utils/timeUtils.js';
import {
  formatPlannerCompactTime,
  parsePlannerTimeParts,
  PLANNER_TIME_HOURS,
  PLANNER_TIME_MINUTES,
  PLANNER_TIME_PERIODS,
  PLANNER_TIME_SCROLL_ITEM_HEIGHT,
  PLANNER_TIME_SCROLL_VISIBLE_ROWS,
} from '../utils/plannerTimePicker.js';

const ITEM_HEIGHT = PLANNER_TIME_SCROLL_ITEM_HEIGHT;
const VISIBLE_ROWS = PLANNER_TIME_SCROLL_VISIBLE_ROWS;
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;

function TimeScrollColumn({ label, options, value, onChange }) {
  const listRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const index = Math.max(0, options.indexOf(value));
    isProgrammaticScrollRef.current = true;
    list.scrollTop = index * ITEM_HEIGHT;
    const frame = requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [options, value]);

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;

    const list = listRef.current;
    if (!list) return;

    const index = Math.min(
      options.length - 1,
      Math.max(0, Math.round(list.scrollTop / ITEM_HEIGHT)),
    );
    const snapped = index * ITEM_HEIGHT;
    if (Math.abs(list.scrollTop - snapped) > 1) {
      isProgrammaticScrollRef.current = true;
      list.scrollTop = snapped;
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }

    const next = options[index];
    if (next !== value) {
      onChange(next);
    }
  };

  return (
    <div className="planner-time-scroll-column">
      <div className="planner-time-scroll-label" aria-hidden="true">
        {label}
      </div>
      <div className="planner-time-scroll-window" style={{ height: COLUMN_HEIGHT }}>
        <ul
          className="planner-time-scroll-list"
          ref={listRef}
          onScroll={handleScroll}
          role="listbox"
          aria-label={label}
        >
          <li className="planner-time-scroll-spacer" aria-hidden="true" />
          {options.map((option) => (
            <li
              key={option}
              className={`planner-time-scroll-item${option === value ? ' is-selected' : ''}`}
              role="option"
              aria-selected={option === value}
            >
              {option}
            </li>
          ))}
          <li className="planner-time-scroll-spacer" aria-hidden="true" />
        </ul>
      </div>
    </div>
  );
}

export default function PlannerTimePicker({ id, label, value, onChange, optionalHint }) {
  const committedParts = parsePlannerTimeParts(value);
  const [draft, setDraft] = useState(committedParts);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(parsePlannerTimeParts(value));
    setDirty(false);
  }, [value]);

  const draftCompact = formatPlannerCompactTime(draft.hour, draft.minute, draft.period);
  const hasCommittedValue = Boolean(value);
  const hasPendingChange = dirty && draftCompact !== value;

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const applyDraft = () => {
    if (!draftCompact) return;
    onChange(draftCompact);
    setDirty(false);
  };

  const clearTime = () => {
    onChange('');
    setDraft(parsePlannerTimeParts(''));
    setDirty(false);
  };

  return (
    <div
      className="filter-group planner-time-picker"
      id={id}
      style={{ '--planner-time-item-height': `${ITEM_HEIGHT}px` }}
    >
      <div className="planner-time-picker-header">
        <span className="planner-time-picker-label" id={`${id}-label`}>
          {label}
        </span>
        {hasCommittedValue ? (
          <span className="planner-time-picker-current" aria-live="polite">
            {formatMinutesToTime(parseTimeToMinutes(value))}
          </span>
        ) : (
          <span className="planner-time-picker-current planner-time-picker-current--empty">
            Not set
          </span>
        )}
      </div>

      <div
        className="planner-time-scroll-picker"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        <div className="planner-time-scroll-highlight" aria-hidden="true" />
        <TimeScrollColumn
          label="Hour"
          options={PLANNER_TIME_HOURS}
          value={draft.hour}
          onChange={(hour) => updateDraft({ hour })}
        />
        <TimeScrollColumn
          label="Minute"
          options={PLANNER_TIME_MINUTES}
          value={draft.minute}
          onChange={(minute) => updateDraft({ minute })}
        />
        <TimeScrollColumn
          label="Period"
          options={PLANNER_TIME_PERIODS}
          value={draft.period}
          onChange={(period) => updateDraft({ period })}
        />
      </div>

      <div className="planner-time-picker-actions">
        <button
          type="button"
          className="planner-time-action planner-time-action--apply"
          onClick={applyDraft}
          disabled={!draftCompact || !hasPendingChange}
          aria-label={`Set ${label}`}
        >
          Set time
        </button>
        <button
          type="button"
          className="planner-time-action planner-time-action--clear"
          onClick={clearTime}
          disabled={!hasCommittedValue && !dirty}
          aria-label={`Clear ${label}`}
        >
          Clear
        </button>
      </div>

      {optionalHint ? <p className="planner-field-hint">{optionalHint}</p> : null}
      {hasPendingChange ? (
        <p className="planner-field-hint">Press Set time to apply {draftCompact}.</p>
      ) : null}
    </div>
  );
}
