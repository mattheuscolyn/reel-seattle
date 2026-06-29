import { Navigate } from 'react-router-dom';
import { buildPlannerPathFromMarathon } from '../utils/plannerUrlState.js';

/**
 * Redirect legacy Marathon URLs to the unified planner in max-film mode.
 * Migrates saved Marathon localStorage filters when present.
 */
export default function MarathonRedirect() {
  const to = buildPlannerPathFromMarathon();
  return <Navigate to={to} replace />;
}
