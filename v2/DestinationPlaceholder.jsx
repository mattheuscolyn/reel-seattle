import { getDestinationById, resolveDestinationId } from './destinations.js';
import ExploreDestination from './explore/ExploreDestination.jsx';
import HomeDestination from './HomeDestination.jsx';
import PlannerDestination from './planner/PlannerDestination.jsx';
import ProfileDestination from './profile/ProfileDestination.jsx';

/**
 * @param {{
 *   destinationId: string,
 *   loadStatus?: 'loading' | 'ready' | 'error',
 *   homeData?: object | null,
 *   errorMessage?: string | null,
 *   onSelectDestination?: (id: string) => void,
 *   onOpenFilmDetail?: (payload: object) => void,
 *   onOpenCollection?: (payload: object) => void,
 *   homeRestore?: object | null,
 *   exploreRestore?: object | null,
 *   onHomeRestoreConsumed?: () => void,
 *   onExploreRestoreConsumed?: () => void,
 *   plannerSeed?: object | null,
 *   onProfileStubAction?: (actionId: string, label: string) => void,
 *   onPlannerStubAction?: (actionId: string, label: string) => void,
 *   onOpenBuildPlan?: () => void,
 *   onOpenMyScheduleWeek?: () => void,
 * }} props
 */
export default function DestinationPlaceholder({
  destinationId,
  loadStatus = 'loading',
  homeData = null,
  errorMessage = null,
  onSelectDestination,
  onOpenFilmDetail,
  onOpenCollection,
  homeRestore = null,
  exploreRestore = null,
  onHomeRestoreConsumed,
  onExploreRestoreConsumed,
  plannerSeed = null,
  onProfileStubAction,
  onPlannerStubAction,
  onOpenBuildPlan,
  onOpenMyScheduleWeek,
}) {
  const destination = getDestinationById(resolveDestinationId(destinationId));

  if (destination.id === 'home') {
    return (
      <HomeDestination
        loadStatus={loadStatus}
        homeData={homeData}
        errorMessage={errorMessage}
        onSelectDestination={onSelectDestination}
        onOpenFilmDetail={onOpenFilmDetail}
        onOpenCollection={onOpenCollection}
        restoreState={homeRestore}
        onRestoreConsumed={onHomeRestoreConsumed}
      />
    );
  }

  if (destination.id === 'explore') {
    return (
      <ExploreDestination
        homeData={homeData}
        onOpenCollection={onOpenCollection}
        onOpenFilmDetail={onOpenFilmDetail}
        restoreState={exploreRestore}
        onRestoreConsumed={onExploreRestoreConsumed}
      />
    );
  }

  if (destination.id === 'planner') {
    const filmTitle =
      plannerSeed?.filmKey && homeData
        ? (homeData.films ?? []).find((f) => f.filmKey === plannerSeed.filmKey)
            ?.title ?? null
        : null;
    return (
      <PlannerDestination
        plannerSeed={plannerSeed}
        seedFilmTitle={filmTitle}
        onStubAction={onPlannerStubAction}
        onOpenBuildPlan={onOpenBuildPlan}
        onOpenMyScheduleWeek={onOpenMyScheduleWeek}
      />
    );
  }

  if (destination.id === 'profile') {
    return <ProfileDestination onStubAction={onProfileStubAction} />;
  }

  return (
    <section
      className="v2-destination"
      aria-labelledby={`v2-destination-heading-${destination.id}`}
    >
      <p className="v2-destination-eyebrow">v2 shell · placeholder</p>
      <h1 id={`v2-destination-heading-${destination.id}`}>{destination.title}</h1>
      <p className="v2-destination-copy">{destination.description}</p>
    </section>
  );
}
