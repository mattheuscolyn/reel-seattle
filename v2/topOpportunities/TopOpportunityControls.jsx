import {
  buildPositionLabel,
  canGoNext,
  canGoPrevious,
} from './topOpportunityFormat.js';

/**
 * @param {{
 *   index: number,
 *   length: number,
 *   onPrevious: () => void,
 *   onNext: () => void,
 * }} props
 */
export default function TopOpportunityControls({
  index,
  length,
  onPrevious,
  onNext,
}) {
  if (length <= 1) return null;

  const prevEnabled = canGoPrevious(index, length);
  const nextEnabled = canGoNext(index, length);

  return (
    <div className="v2-top-controls">
      <button
        type="button"
        className="v2-top-nav-button"
        onClick={onPrevious}
        disabled={!prevEnabled}
        aria-label="Previous featured opportunity"
      >
        Previous
      </button>
      <p className="v2-top-position" aria-live="polite">
        {buildPositionLabel(index, length)}
      </p>
      <button
        type="button"
        className="v2-top-nav-button"
        onClick={onNext}
        disabled={!nextEnabled}
        aria-label="Next featured opportunity"
      >
        Next
      </button>
    </div>
  );
}
