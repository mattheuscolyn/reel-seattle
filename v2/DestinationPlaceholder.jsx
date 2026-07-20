import { getDestinationById, resolveDestinationId } from './destinations.js';

/**
 * @param {{ destinationId: string }} props
 */
export default function DestinationPlaceholder({ destinationId }) {
  const destination = getDestinationById(resolveDestinationId(destinationId));

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
