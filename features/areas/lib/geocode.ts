import { haversineMetres } from "@/features/dispatch/lib/geofence";

export const AREA_RADIUS_MIN_M = 80;
export const AREA_RADIUS_MAX_M = 1500;
export const AREA_RADIUS_POINT_DEFAULT_M = 150;

/** Cape Town CBD — bias Mapbox search. */
export const GEOCODE_PROXIMITY: [number, number] = [18.4241, -33.9249];

export type GeocodedPlace = {
  id: string;
  name: string;
  placeName: string;
  lng: number;
  lat: number;
  radiusM: number;
  bbox: [number, number, number, number] | null;
};

export function clampAreaRadius(metres: number): number {
  if (!Number.isFinite(metres) || metres <= 0) {
    return AREA_RADIUS_POINT_DEFAULT_M;
  }
  return Math.min(
    AREA_RADIUS_MAX_M,
    Math.max(AREA_RADIUS_MIN_M, Math.round(metres))
  );
}

/** Half the bbox diagonal, clamped for a circular fence. */
export function radiusFromBbox(
  west: number,
  south: number,
  east: number,
  north: number
): number {
  const diagonal = haversineMetres(south, west, north, east);
  return clampAreaRadius(diagonal / 2);
}

export function radiusForMapboxFeature(feature: {
  geometry?: { type?: string; coordinates?: unknown };
  bbox?: number[];
}): number {
  if (Array.isArray(feature.bbox) && feature.bbox.length >= 4) {
    const [west, south, east, north] = feature.bbox;
    if (
      [west, south, east, north].every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return radiusFromBbox(west, south, east, north);
    }
  }
  return AREA_RADIUS_POINT_DEFAULT_M;
}

export function parseMapboxFeature(feature: {
  id?: string;
  text?: string;
  place_name?: string;
  center?: number[];
  geometry?: { type?: string; coordinates?: unknown };
  bbox?: number[];
}): GeocodedPlace | null {
  const coords = Array.isArray(feature.center)
    ? feature.center
    : feature.geometry?.type === "Point" &&
        Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : null;
  if (!coords || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const bbox =
    Array.isArray(feature.bbox) && feature.bbox.length >= 4
      ? ([
          Number(feature.bbox[0]),
          Number(feature.bbox[1]),
          Number(feature.bbox[2]),
          Number(feature.bbox[3]),
        ] as [number, number, number, number])
      : null;

  const placeName = (feature.place_name ?? feature.text ?? "").trim();
  const name = (feature.text ?? placeName).trim();
  if (!name) return null;

  return {
    id: String(feature.id ?? placeName),
    name,
    placeName: placeName || name,
    lng,
    lat,
    radiusM: radiusForMapboxFeature(feature),
    bbox: bbox && bbox.every((n) => Number.isFinite(n)) ? bbox : null,
  };
}
