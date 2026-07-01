/**
 * Compact mobile summary + collapse toggle for planner filters.
 * Hidden on desktop via CSS; desktop always shows full filter panels.
 */
export default function PlannerMobileFilterBar({
  chips,
  expanded,
  onToggle,
  controlsId,
}) {
  if (!chips?.length) return null;

  return (
    <div className="planner-mobile-filter-bar">
      <div className="planner-mobile-filter-summary" id={`${controlsId}-summary`}>
        {chips.map((chip) => (
          <span key={chip.key} className="planner-mobile-filter-chip">
            <span className="planner-mobile-filter-chip-label">{chip.label}</span>
            <span className="planner-mobile-filter-chip-value">{chip.value}</span>
          </span>
        ))}
      </div>
      <button
        type="button"
        className="planner-mobile-filter-toggle"
        aria-expanded={expanded}
        aria-controls={controlsId}
        onClick={onToggle}
      >
        {expanded ? 'Hide filters' : 'Edit filters'}
      </button>
    </div>
  );
}
