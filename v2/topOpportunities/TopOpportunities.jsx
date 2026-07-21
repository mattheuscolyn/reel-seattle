import { useEffect, useId, useState } from 'react';
import {
  clampSelectionIndex,
  selectTopOpportunities,
} from '../adapters/selectTopOpportunities.js';
import TopOpportunityCard from './TopOpportunityCard.jsx';

/**
 * Dominant Home region: wide, one-at-a-time Top Opportunities (I-03 / I-03R).
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

  useEffect(() => {
    setIndex((current) => clampSelectionIndex(current, selections.length));
  }, [selections.length, homeData?.generatedAt]);

  return (
    <section className="v2-top-opportunities" aria-labelledby={headingId}>
      <header className="v2-home-intro">
        <p className="v2-home-eyebrow">Seattle cinema</p>
        <h2 id={headingId} className="v2-home-question">
          What deserves your attention in Seattle cinema right now?
        </h2>
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
