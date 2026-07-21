import { useEffect, useId, useState } from 'react';
import {
  clampSelectionIndex,
  selectTopOpportunities,
} from '../adapters/selectTopOpportunities.js';
import TopOpportunityCard from './TopOpportunityCard.jsx';
import TopOpportunityControls from './TopOpportunityControls.jsx';

/**
 * Dominant Home region: scarce, one-at-a-time Top Opportunities (I-03).
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
  const [detailsOpen, setDetailsOpen] = useState(false);

  const selections =
    status === 'ready' && homeData ? selectTopOpportunities(homeData) : [];
  const safeIndex = clampSelectionIndex(index, selections.length);
  const active = selections[safeIndex] ?? null;

  useEffect(() => {
    setIndex((current) => clampSelectionIndex(current, selections.length));
    setDetailsOpen(false);
  }, [selections.length, homeData?.generatedAt]);

  return (
    <section
      className="v2-top-opportunities"
      aria-labelledby={headingId}
    >
      <header className="v2-top-header">
        <p className="v2-top-eyebrow">Seattle cinema · now</p>
        <h2 id={headingId} className="v2-top-heading">
          Top Opportunities
        </h2>
        <p className="v2-top-lede">
          A scarce set of current listings chosen by transparent mechanical
          rules — not personal taste or cultural ranking.
        </p>
      </header>

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
          No featured opportunities in the current window. Supporting Home
          regions arrive in later tasks.
        </p>
      ) : null}

      {status === 'ready' && active ? (
        <>
          <TopOpportunityCard
            selection={active}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((open) => !open)}
          />
          <TopOpportunityControls
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
        </>
      ) : null}
    </section>
  );
}
