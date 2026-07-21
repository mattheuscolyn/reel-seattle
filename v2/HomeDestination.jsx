import { useEffect, useState } from 'react';
import { loadHomeData } from './data/loadHomeData.js';
import TopOpportunities from './topOpportunities/TopOpportunities.jsx';

/**
 * Home destination: Top Opportunities (I-03) + secondary development status.
 */
export default function HomeDestination() {
  const [state, setState] = useState({
    status: 'loading',
    homeData: null,
    errorMessage: null,
    loadErrors: [],
  });

  useEffect(() => {
    let cancelled = false;

    loadHomeData()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({
            status: 'error',
            homeData: null,
            errorMessage: result.error,
            loadErrors: [],
          });
          return;
        }
        setState({
          status: 'ready',
          homeData: result.homeData,
          errorMessage: null,
          loadErrors: result.loadErrors,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: 'error',
          homeData: null,
          errorMessage: error instanceof Error ? error.message : String(error),
          loadErrors: [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = state.homeData?.counts;

  return (
    <div className="v2-home">
      <TopOpportunities
        status={state.status}
        homeData={state.homeData}
        errorMessage={state.errorMessage}
      />

      <details className="v2-dev-details">
        <summary>Development data status</summary>
        <div className="v2-data-status" role="status">
          <p className="v2-data-status-label">I-02 adapter proof</p>
          {state.status === 'loading' ? (
            <p className="v2-data-status-message">Loading Home data…</p>
          ) : null}
          {state.status === 'error' ? (
            <p className="v2-data-status-error">{state.errorMessage}</p>
          ) : null}
          {state.status === 'ready' && counts ? (
            <>
              <p className="v2-data-status-message">
                {state.loadErrors.length > 0
                  ? `Home data loaded with ${state.loadErrors.length} optional load issue(s).`
                  : 'Home data loaded.'}
              </p>
              <ul className="v2-data-status-counts">
                <li>Films: {counts.films}</li>
                <li>Opportunities: {counts.opportunities}</li>
                <li>Newly added: {counts.newlyAdded}</li>
                <li>Warnings: {counts.warnings}</li>
                <li>
                  Leaving Soon:{' '}
                  {state.homeData.leavingSoonExcluded ? 'excluded' : 'included'}
                </li>
              </ul>
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}
