export type RouteStop = {
  name: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
};

export const MULTI_STOP_MIN = 3;

export function routeStopNames(
  stops: Array<{ name?: string | null }> | null | undefined
): string[] {
  return (stops ?? [])
    .map((stop) => stop?.name?.trim() ?? "")
    .filter(Boolean);
}

/** More than a single pickup and final drop-off. */
export function isMultiStopRoute(
  stops: Array<{ name?: string | null }> | null | undefined
): boolean {
  return routeStopNames(stops).length >= MULTI_STOP_MIN;
}

/**
 * Single pickup → drop-off stays as stored `area_text` (for example
 * "Rondebosch → Athlone"). Three or more stops are labelled
 * "Pickup: … → Stop 2: … → Final drop-off: …".
 */
export function formatDriverRoute(input: {
  area_text?: string | null;
  route_stops?: Array<{ name?: string | null }> | null;
}): string {
  const names = routeStopNames(input.route_stops);
  if (names.length >= MULTI_STOP_MIN) {
    return names
      .map((name, index) => {
        const label =
          index === 0
            ? "Pickup"
            : index === names.length - 1
              ? "Final drop-off"
              : `Stop ${index + 1}`;
        return `${label}: ${name}`;
      })
      .join(" → ");
  }
  return input.area_text?.trim() ?? "";
}
