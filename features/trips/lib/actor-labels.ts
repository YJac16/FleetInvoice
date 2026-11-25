export type ActorNameMap = ReadonlyMap<string, string>;

export type TripActorRow = {
  created_by?: string | null;
  updated_by?: string | null;
};

export function actorName(names: ActorNameMap, userId: string | null | undefined): string | null {
  if (!userId) return null;
  return names.get(userId) ?? "Unknown user";
}

/**
 * "Entered by" from created_by; "Last edited by" from updated_by only when
 * it is set and differs from created_by.
 */
export function tripActorLabels(
  trip: TripActorRow,
  names: ActorNameMap
): { enteredBy: string | null; lastEditedBy: string | null } {
  const enteredBy = actorName(names, trip.created_by);
  const lastEditedBy =
    trip.updated_by && trip.updated_by !== trip.created_by ? actorName(names, trip.updated_by) : null;
  return { enteredBy, lastEditedBy };
}

export function toActorNameMap(rows: ReadonlyArray<{ user_id: string; display_name: string }>): ActorNameMap {
  return new Map(rows.map((row) => [row.user_id, row.display_name]));
}
