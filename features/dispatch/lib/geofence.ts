/** Earth radius in metres (WGS84 mean). */
const EARTH_RADIUS_M = 6_371_000;

export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function isInsideRadius(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusM: number
): boolean {
  return haversineMetres(lat, lng, centerLat, centerLng) <= radiusM;
}

export type GeofenceTransition = "enter" | "exit" | null;

export function geofenceTransition(
  wasInside: boolean | null,
  nowInside: boolean
): GeofenceTransition {
  if (wasInside == null) return null;
  if (wasInside === nowInside) return null;
  return nowInside ? "enter" : "exit";
}
