import { MARATHON_IFRAME_SRC } from '../utils/routes.js';
import MarathonStatusBanner from '../components/MarathonStatusBanner.jsx';

export default function MarathonPage() {
  return (
    <>
      <MarathonStatusBanner />
      <iframe
        className="marathon-frame"
        src={MARATHON_IFRAME_SRC}
        title="Marathon Planner"
      />
    </>
  );
}
