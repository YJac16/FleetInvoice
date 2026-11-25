import { tripActorLabels, type ActorNameMap, type TripActorRow } from "@/features/trips/lib/actor-labels";

/** "Entered by X · Last edited by Y" — staff views only. */
export function TripActorLine({
  trip,
  names,
  className = "text-xs text-muted-foreground",
}: {
  trip: TripActorRow;
  names: ActorNameMap;
  className?: string;
}) {
  const { enteredBy, lastEditedBy } = tripActorLabels(trip, names);
  if (!enteredBy && !lastEditedBy) return null;
  return (
    <p className={className} data-testid="trip-actor-line">
      {enteredBy ? <>Entered by {enteredBy}</> : null}
      {enteredBy && lastEditedBy ? " · " : null}
      {lastEditedBy ? <>Last edited by {lastEditedBy}</> : null}
    </p>
  );
}
