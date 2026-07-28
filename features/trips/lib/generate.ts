/**
 * Pure helpers mirroring the `generate_trips` SQL RPC's occurrence logic.
 * Used for client-side previews/tests; actual trip rows are always created
 * server-side via `supabase.rpc("generate_trips", ...)`.
 */

/**
 * Returns the ISO (YYYY-MM-DD) dates between `from` and `to` (inclusive)
 * whose weekday (0=Sun..6=Sat, UTC) is included in `daysOfWeek`.
 */
export function computeOccurrenceDates(
  from: string,
  to: string,
  daysOfWeek: number[]
): string[] {
  const daySet = new Set(daysOfWeek);
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const dates: string[] = [];

  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    if (daySet.has(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
  }

  return dates;
}

/**
 * Normalises a depart time ("HH:MM" or "HH:MM:SS") to "HH:MM:SS".
 */
export function normaliseDepartTime(departTime: string): string {
  return departTime.length === 5 ? `${departTime}:00` : departTime;
}

/**
 * Combines a date (YYYY-MM-DD) and depart time (HH:MM or HH:MM:SS, treated
 * as UTC) into an ISO timestamp suitable for a timestamptz column.
 */
export function buildPlannedStart(date: string, departTime: string): string {
  const time = normaliseDepartTime(departTime);
  return new Date(`${date}T${time}Z`).toISOString();
}

/**
 * Builds the dedupe key used for generated trips: `${scheduleId}:${isoStart}`.
 * Matches SQL `generate_trips` (UTC, no milliseconds).
 */
export function buildGenerationKey(
  scheduleId: string,
  plannedStartIso: string
): string {
  const normalized = new Date(plannedStartIso)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  return `${scheduleId}:${normalized}`;
}

export type TripOccurrence = {
  organisation_id: string;
  route_id: string;
  schedule_id: string;
  company_id: string | null;
  planned_start: string;
  status: "planned";
  generation_key: string;
};

export type BuildTripOccurrencesParams = {
  organisationId: string;
  routeId: string;
  scheduleId: string;
  companyId?: string | null;
  from: string;
  to: string;
  daysOfWeek: number[];
  departTime: string;
};

/**
 * Expands a schedule into the planned trip occurrences within a date range.
 */
export function buildTripOccurrences(
  params: BuildTripOccurrencesParams
): TripOccurrence[] {
  const dates = computeOccurrenceDates(
    params.from,
    params.to,
    params.daysOfWeek
  );

  return dates.map((date) => {
    const plannedStart = buildPlannedStart(date, params.departTime);
    return {
      organisation_id: params.organisationId,
      route_id: params.routeId,
      schedule_id: params.scheduleId,
      company_id: params.companyId ?? null,
      planned_start: plannedStart,
      status: "planned" as const,
      generation_key: buildGenerationKey(params.scheduleId, plannedStart),
    };
  });
}
