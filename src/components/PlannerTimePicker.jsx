import { useMemo } from 'react';
import { formatMinutesToTime, parseTimeToMinutes } from '../utils/timeUtils.js';

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = ['00', '15', '30', '45'];
const PERIODS = ['AM', 'PM'];

function parseCompactTime(value) {
  if (!value) {
    return { hour: '', minute: '', period: '' };
  }
  const match = String(value).match(/(\d+):(\d+)(AM|PM)/i);
  if (!match) {
    return { hour: '', minute: '', period: '' };
  }
  return {
    hour: String(parseInt(match[1], 10)),
    minute: match[2].padStart(2, '0'),
    period: match[3].toUpperCase(),
  };
}

function toCompactTime(hour, minute, period) {
  if (!hour || !minute || !period) return '';
  const compact = `${hour}:${minute}${period}`;
  return parseTimeToMinutes(compact) !== null ? compact : '';
}

export default function PlannerTimePicker({ id, label, value, onChange, optionalHint }) {
  const parts = useMemo(() => parseCompactTime(value), [value]);

  const updatePart = (patch) => {
    const next = { ...parts, ...patch };
    onChange(toCompactTime(next.hour, next.minute, next.period));
  };

  const clearTime = () => onChange('');

  return (
    <div className="filter-group planner-time-picker">
      <label htmlFor={`${id}-hour`}>{label}</label>
      <div className="planner-time-picker-controls">
        <select
          id={`${id}-hour`}
          className="filter-select planner-time-select"
          value={parts.hour}
          onChange={(event) => updatePart({ hour: event.target.value })}
          aria-label={`${label} hour`}
        >
          <option value="">Hr</option>
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <span className="planner-time-separator">:</span>
        <select
          id={`${id}-minute`}
          className="filter-select planner-time-select"
          value={parts.minute}
          onChange={(event) => updatePart({ minute: event.target.value })}
          aria-label={`${label} minute`}
        >
          <option value="">Min</option>
          {MINUTES.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>
        <select
          id={`${id}-period`}
          className="filter-select planner-time-select"
          value={parts.period}
          onChange={(event) => updatePart({ period: event.target.value })}
          aria-label={`${label} AM or PM`}
        >
          <option value="">—</option>
          {PERIODS.map((period) => (
            <option key={period} value={period}>
              {period}
            </option>
          ))}
        </select>
        {value ? (
          <button type="button" className="planner-time-clear" onClick={clearTime}>
            Clear
          </button>
        ) : null}
      </div>
      {optionalHint ? <p className="planner-field-hint">{optionalHint}</p> : null}
      {value ? (
        <p className="planner-time-preview" aria-live="polite">
          Selected: {formatMinutesToTime(parseTimeToMinutes(value))}
        </p>
      ) : null}
    </div>
  );
}
