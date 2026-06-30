import { formatMinutesToTime } from '../utils/timeUtils.js';

/**
 * Visual timeline renderer for mock constraint preview.
 * Shows hypothetical film slots and time boundaries before search.
 *
 * @param {object} props
 * @param {Array} props.mockSlots - Mock film slots from buildMockSlotsFromFilters
 * @param {number|null} props.startAfterMin - Start boundary in minutes
 * @param {number|null} props.finishByMin - Finish boundary in minutes
 * @param {number|null} props.minGapMin - Minimum gap between films
 * @param {number|null} props.maxGapMin - Maximum gap between films
 */
export default function PlannerConstraintTimeline({
  mockSlots,
  startAfterMin,
  finishByMin,
  minGapMin,
  maxGapMin,
}) {
  if (!mockSlots || mockSlots.length === 0) return null;

  const totalEstimatedRuntime = mockSlots.reduce(
    (sum, slot) => sum + (slot.estimatedDurationMin || 120),
    0,
  );

  const estimatedGaps = mockSlots.length > 1 ? (mockSlots.length - 1) * 30 : 0;
  const totalEstimatedSpan = totalEstimatedRuntime + estimatedGaps;

  const earliestStart = startAfterMin || 10 * 60;
  const latestFinish = finishByMin || earliestStart + totalEstimatedSpan;

  const segments = [];
  let currentMin = earliestStart;

  mockSlots.forEach((slot, index) => {
    const duration = slot.estimatedDurationMin || 120;

    segments.push({
      key: `film-${index}`,
      type: 'film',
      slot,
      startMin: currentMin,
      endMin: currentMin + duration,
      durationMin: duration,
    });

    currentMin += duration;

    if (index < mockSlots.length - 1) {
      const gapDuration = 30;
      segments.push({
        key: `gap-${index}`,
        type: 'gap',
        startMin: currentMin,
        endMin: currentMin + gapDuration,
        durationMin: gapDuration,
        minGapMin,
        maxGapMin,
      });
      currentMin += gapDuration;
    }
  });

  const spanMin = latestFinish - earliestStart;
  const startLabel = formatMinutesToTime(earliestStart);
  const endLabel = formatMinutesToTime(latestFinish);

  return (
    <div className="planner-constraint-preview-timeline" aria-label="Constraint preview timeline">
      <div className="planner-constraint-preview-timeline-labels">
        <span>{startAfterMin ? `Start after: ${startLabel}` : startLabel}</span>
        <span>{finishByMin ? `Finish by: ${endLabel}` : endLabel}</span>
      </div>
      <div
        className="planner-constraint-preview-timeline-track"
        role="img"
        aria-label={`Preview timeline from ${startLabel} to ${endLabel}`}
      >
        {segments.map((segment) => {
          const leftPct = ((segment.startMin - earliestStart) / spanMin) * 100;
          const widthPct = (segment.durationMin / spanMin) * 100;

          if (segment.type === 'gap') {
            return (
              <div
                key={segment.key}
                className="planner-constraint-preview-timeline-segment planner-constraint-preview-timeline-segment--gap"
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 0.8)}%`,
                }}
                title={getGapTitle(segment)}
              >
                <span className="planner-constraint-preview-timeline-segment-label">
                  {getGapLabel(segment)}
                </span>
              </div>
            );
          }

          const showLabel = widthPct > 8;

          return (
            <div
              key={segment.key}
              className={`planner-constraint-preview-timeline-segment planner-constraint-preview-timeline-segment--film planner-constraint-preview-timeline-segment--${segment.slot.type}`}
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 1.5)}%`,
              }}
              title={getFilmTitle(segment.slot)}
            >
              {showLabel && (
                <span className="planner-constraint-preview-timeline-segment-label">
                  {getFilmLabel(segment.slot)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getFilmLabel(slot) {
  if (slot.film) {
    const title = slot.film.title;
    return title.length > 25 ? `${title.substring(0, 22)}...` : title;
  }

  switch (slot.type) {
    case 'required':
      return 'Required';
    case 'first':
      return 'First';
    case 'last':
      return 'Last';
    default:
      return '?';
  }
}

function getFilmTitle(slot) {
  if (slot.film) {
    const duration = slot.estimatedDurationMin || 120;
    return `${slot.film.title} (${duration} min)`;
  }

  return 'Any film';
}

function getGapLabel(segment) {
  const { minGapMin, maxGapMin } = segment;

  if (minGapMin != null && maxGapMin != null) {
    return `${minGapMin}–${maxGapMin} min`;
  }

  if (minGapMin != null) {
    return `≥${minGapMin} min`;
  }

  if (maxGapMin != null) {
    return `≤${maxGapMin} min`;
  }

  return '~30 min';
}

function getGapTitle(segment) {
  const { minGapMin, maxGapMin } = segment;

  if (minGapMin != null && maxGapMin != null) {
    return `Gap between films: ${minGapMin}–${maxGapMin} minutes`;
  }

  if (minGapMin != null) {
    return `Gap between films: at least ${minGapMin} minutes`;
  }

  if (maxGapMin != null) {
    return `Gap between films: at most ${maxGapMin} minutes`;
  }

  return 'Gap between films: approximately 30 minutes';
}
