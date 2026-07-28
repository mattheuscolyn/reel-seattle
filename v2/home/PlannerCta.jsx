import { IconCalendar, IconChevron } from '../icons.jsx';

/**
 * Planner call-to-action — stub interaction only.
 */
export default function PlannerCta({ onActivate }) {
  return (
    <button
      type="button"
      className="v2-planner-cta"
      onClick={onActivate}
      aria-label="Build a Movie Day (planner placeholder)"
    >
      <span className="v2-planner-cta-icon" aria-hidden="true">
        <IconCalendar />
      </span>
      <span className="v2-planner-cta-copy">
        <span className="v2-planner-cta-title">Build a Movie Day</span>
        <span className="v2-planner-cta-support">
          Plan a great day of movies with our planner.
        </span>
      </span>
      <span className="v2-planner-cta-chevron" aria-hidden="true">
        <IconChevron />
      </span>
    </button>
  );
}
