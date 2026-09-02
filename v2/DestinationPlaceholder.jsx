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
 *   enrichmentIndex?: object | null,
 *   errorMessage?: string | null,
 *   onSelectDestination?: (id: string) => void,
 *   onOpenFilmDetail?: (payload: object) => void,
 *   onOpenCollection?: (payload: object) => void,
 *   onOpenShowtimesBrowse?: (payload: object) => void,
 *   homeRestore?: object | null,
 *   exploreRestore?: object | null,
 *   onHomeRestoreConsumed?: () => void,
 *   onExploreRestoreConsumed?: () => void,
 *   plannerSeed?: object | null,
 *   onProfileStubAction?: (actionId: string, label: string) => void,
 *   onOpenAdminTmdbReview?: () => void,
 *   onPlannerStubAction?: (actionId: string, label: string) => void,
 *   onOpenBuildPlan?: () => void,
 *   onOpenMyScheduleWeek?: () => void,
 *   onAcceptedPlansChange?: () => void,
 *   acceptedPlansRevision?: number,
 * }} props
 */
export default function DestinationPlaceholder({
  destinationId,
  loadStatus = 'loading',
  homeData = null,
  enrichmentIndex = null,
  errorMessage = null,
  onSelectDestination,
  onOpenFilmDetail,
  onOpenCollection,
  onOpenShowtimesBrowse,
  homeRestore = null,
  exploreRestore = null,
  onHomeRestoreConsumed,
  onExploreRestoreConsumed,
  plannerSeed = null,
  onProfileStubAction,
  onOpenAdminTmdbReview,
  onPlannerStubAction,
  onOpenBuildPlan,
  onOpenMyScheduleWeek,
  onAcceptedPlansChange,
  acceptedPlansRevision = 0,
}) {
  const destination = getDestinationById(resolveDestinationId(destinationId));

  if (destination.id === 'home') {
    return (
      <HomeDestination
        loadStatus={loadStatus}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        errorMessage={errorMessage}
        onSelectDestination={onSelectDestination}
        onOpenFilmDetail={onOpenFilmDetail}
        onOpenCollection={onOpenCollection}
        onOpenShowtimesBrowse={onOpenShowtimesBrowse}
        onOpenBuildPlan={onOpenBuildPlan}
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
        onOpenShowtimesBrowse={onOpenShowtimesBrowse}
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
        onOpenFilmDetail={onOpenFilmDetail}
        onAcceptedPlansChange={onAcceptedPlansChange}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        acceptedPlansRevision={acceptedPlansRevision}
      />
    );
  }

  if (destination.id === 'profile') {
    return (
      <ProfileDestination
        onStubAction={onProfileStubAction}
        onOpenAdminTmdbReview={onOpenAdminTmdbReview}
      />
    );
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
