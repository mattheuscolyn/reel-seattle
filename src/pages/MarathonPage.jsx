import { MARATHON_IFRAME_SRC } from '../utils/routes.js';
import LegacyToolBanner from '../components/LegacyToolBanner.jsx';
import MarathonStatusBanner from '../components/MarathonStatusBanner.jsx';
import { buildMarathonPlannerLink } from '../utils/plannerUrlState.js';

export default function MarathonPage() {
  return (
    <>
      <LegacyToolBanner
        label="New unified Planner available"
        message="The unified Planner can now find multi-movie schedules with advanced filters and shareable links. Marathon remains available while we finish parity testing."
        linkTo={buildMarathonPlannerLink()}
        linkText="Try Planner"
      />
      <MarathonStatusBanner />
      <iframe
        className="marathon-frame"
        src={MARATHON_IFRAME_SRC}
        title="Marathon Planner"
      />
    </>
  );
}
