import { Navigate, useSearchParams } from 'react-router-dom';
import { buildPlannerPathFromDoubleFeature } from '../utils/plannerUrlState.js';

/**
 * Redirect legacy Double Feature URLs to the unified planner with mapped query params.
 */
export default function DoubleFeatureRedirect() {
  const [searchParams] = useSearchParams();
  const to = buildPlannerPathFromDoubleFeature(searchParams);
  return <Navigate to={to} replace />;
}
