import PlannerConstraintTimeline from './PlannerConstraintTimeline.jsx';
import {
  buildMockSlotsFromFilters,
  detectImpossibleConstraints,
} from '../utils/plannerConstraintPreview.js';

/**
 * Container component for constraint preview visualization.
 * Shows a mock timeline preview of filter constraints before running a search.
 *
 * @param {object} props
 * @param {object} props.filters - Current planner filter state
 * @param {Array} props.filmCatalog - Available films from buildPlannerFilmCatalog
 * @param {Array} props.showtimeRows - Raw showtime rows for runtime calculation
 */
export default function PlannerConstraintPreview({ filters, filmCatalog, showtimeRows }) {
  const previewData = buildMockSlotsFromFilters(filters, filmCatalog, showtimeRows);

  const warning = detectImpossibleConstraints(previewData);

  const hasKnownFilms = previewData.slots.some((slot) => slot.film != null);
  const hasPreferredFilms = previewData.preferredFilms && previewData.preferredFilms.length > 0;

  return (
    <div className="planner-constraint-preview" role="region" aria-label="Constraint preview">
      <div className="planner-constraint-preview-header">
        <h3 className="planner-constraint-preview-title">Preview of your constraints</h3>
        <p className="planner-constraint-preview-description">
          This is a hypothetical preview based on your current filters. Click <strong>Find plans</strong> below to search for real showtimes.
        </p>
      </div>

      {warning && (
        <div className="planner-constraint-preview-warning" role="alert">
          <span className="planner-constraint-preview-warning-icon" aria-hidden="true">
            ⚠️
          </span>
          <span className="planner-constraint-preview-warning-text">{warning}</span>
        </div>
      )}

      <PlannerConstraintTimeline
        mockSlots={previewData.slots}
        startAfterMin={previewData.startAfterMin}
        finishByMin={previewData.finishByMin}
        minGapMin={previewData.minGapMin}
        maxGapMin={previewData.maxGapMin}
      />

      <div className="planner-constraint-preview-legend">
        <div className="planner-constraint-preview-legend-section">
          {hasKnownFilms && (
            <div className="planner-constraint-preview-legend-item">
              <span className="planner-constraint-preview-legend-swatch planner-constraint-preview-legend-swatch--known"></span>
              <span className="planner-constraint-preview-legend-label">
                {filters.firstFilm || filters.lastFilm ? 'Anchored' : 'Required'}
              </span>
            </div>
          )}

          {!hasKnownFilms && (
            <div className="planner-constraint-preview-legend-item">
              <span className="planner-constraint-preview-legend-swatch planner-constraint-preview-legend-swatch--any"></span>
              <span className="planner-constraint-preview-legend-label">Any film</span>
            </div>
          )}

          {previewData.minGapMin != null && previewData.minGapMin > 0 && (
            <div className="planner-constraint-preview-legend-item">
              <span className="planner-constraint-preview-legend-label">
                Min gap: {previewData.minGapMin} min
              </span>
            </div>
          )}

          {previewData.maxGapMin != null && (
            <div className="planner-constraint-preview-legend-item">
              <span className="planner-constraint-preview-legend-label">
                Max gap: {previewData.maxGapMin} min
              </span>
            </div>
          )}
        </div>

        {hasPreferredFilms && (
          <div className="planner-constraint-preview-legend-note">
            <span>
              At least {previewData.preferredFilms.length === 1 ? 'this' : 'one of these'} preferred film{previewData.preferredFilms.length > 1 ? 's' : ''} must appear
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
