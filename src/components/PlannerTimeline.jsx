import { buildTimelineSegments } from '../utils/plannerDisplay.js';

export default function PlannerTimeline({ schedule }) {
  const timeline = buildTimelineSegments(schedule);
  if (timeline.segments.length === 0) return null;

  return (
    <div className="planner-timeline" aria-label="Schedule timeline">
      <div className="planner-timeline-labels">
        <span>{timeline.startLabel}</span>
        <span>{timeline.endLabel}</span>
      </div>
      <div
        className="planner-timeline-track"
        role="img"
        aria-label={`Timeline from ${timeline.startLabel} to ${timeline.endLabel}`}
      >
        {timeline.segments.map((segment) => (
          <div
            key={segment.key}
            className={`planner-timeline-segment planner-timeline-segment--${segment.type}`}
            style={{
              left: `${segment.leftPct}%`,
              width: `${Math.max(segment.widthPct, segment.type === 'gap' ? 0.8 : 1.5)}%`,
            }}
            title={`${segment.label}${segment.durationMin != null ? ` (${segment.durationMin} min)` : ''}`}
          >
            <span className="planner-timeline-segment-label">{segment.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
