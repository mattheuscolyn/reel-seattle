import { useEffect, useState } from 'react';
import { loadHomeData } from './data/loadHomeData.js';

/**
 * Development-only Home data status for I-02 integration proof.
 * Not product UI — counts and load state only.
 */
export default function HomeDataStatus() {
  const [state, setState] = useState({
    status: 'loading',
    message: 'Loading Home data…',
    counts: null,
  });

  useEffect(() => {
    let cancelled = false;

    loadHomeData()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({
            status: 'error',
            message: result.error,
            counts: null,
          });
          return;
        }
        const { homeData, loadErrors } = result;
        setState({
          status: 'ready',
          message:
            loadErrors.length > 0
              ? `Home data loaded with ${loadErrors.length} optional load issue(s).`
              : 'Home data loaded.',
          counts: {
            films: homeData.counts.films,
            opportunities: homeData.counts.opportunities,
            newlyAdded: homeData.counts.newlyAdded,
            warnings: homeData.counts.warnings,
            leavingSoonExcluded: homeData.leavingSoonExcluded,
          },
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          counts: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="v2-data-status" role="status" aria-live="polite">
      <p className="v2-data-status-label">Development data status (I-02)</p>
      <p className="v2-data-status-message">{state.message}</p>
      {state.counts ? (
        <ul className="v2-data-status-counts">
          <li>Films: {state.counts.films}</li>
          <li>Opportunities: {state.counts.opportunities}</li>
          <li>Newly added: {state.counts.newlyAdded}</li>
          <li>Warnings: {state.counts.warnings}</li>
          <li>
            Leaving Soon: {state.counts.leavingSoonExcluded ? 'excluded' : 'included'}
          </li>
        </ul>
      ) : null}
      {state.status === 'error' ? (
        <p className="v2-data-status-error">Data load failed — placeholder shell still usable.</p>
      ) : null}
    </div>
  );
}
