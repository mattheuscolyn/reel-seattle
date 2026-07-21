import { useEffect, useId, useState } from 'react';
import {
  clampSelectionIndex,
  selectTopOpportunities,
} from '../adapters/selectTopOpportunities.js';
import { buildPositionLabel } from './topOpportunityFormat.js';
import TopOpportunityCard from './TopOpportunityCard.jsx';

/**
 * Dominant Home region: Top Opportunities (I-03 / I-03R2).
 *
 * @param {{
 *   status: 'loading' | 'ready' | 'error',
 *   homeData: object | null,
 *   errorMessage?: string | null,
 * }} props
 */
export default function TopOpportunities({ status, homeData, errorMessage }) {
  const headingId = useId();
  const [index, setIndex] = useState(0);

  const selections =
    status === 'ready' && homeData ? selectTopOpportunities(homeData) : [];
  const safeIndex = clampSelectionIndex(index, selections.length);
  const active = selections[safeIndex] ?? null;
  const positionLabel =
    status === 'ready' ? buildPositionLabel(safeIndex, selections.length) : null;

  useEffect(() => {
    setIndex((current) => clampSelectionIndex(current, selections.length));
  }, [selections.length, homeData?.generatedAt]);

  return (
    <section className="v2-top-opportunities" aria-labelledby={headingId}>
      <header className="v2-home-intro">
        <h2 id={headingId} className="v2-home-question">
          What deserves your attention in Seattle cinema right now?
        </h2>
        <p className="v2-home-support">
          A calm look at what’s playing across the city — scarce, current, and
          honest.
        </p>
      </header>

      <div className="v2-section-bar">
        <p className="v2-section-label">Top Opportunities</p>
        {positionLabel && selections.length > 0 ? (
          <p className="v2-section-position" aria-live="polite">
            {positionLabel}
          </p>
        ) : null}
      </div>

      {status === 'loading' ? (
        <p className="v2-top-state" role="status">
          Loading current opportunities…
        </p>
      ) : null}

      {status === 'error' ? (
        <p className="v2-top-state v2-top-state-error" role="alert">
          {errorMessage || 'Unable to load Home opportunities.'}
        </p>
      ) : null}

      {status === 'ready' && selections.length === 0 ? (
        <p className="v2-top-state" role="status">
          No featured opportunities in the current window.
        </p>
      ) : null}

      {status === 'ready' && active ? (
        <TopOpportunityCard
          selection={active}
          index={safeIndex}
          length={selections.length}
          onPrevious={() =>
            setIndex((current) =>
              clampSelectionIndex(current - 1, selections.length),
            )
          }
          onNext={() =>
            setIndex((current) =>
              clampSelectionIndex(current + 1, selections.length),
            )
          }
        />
      ) : null}
    </section>
  );
}
