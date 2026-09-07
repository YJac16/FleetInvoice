import { isActiveStaffTrip } from "@/features/driver-portal/lib/staff-transitions";
import type { TripStatus } from "@/lib/constants";
import type { GpsLastPosition, GpsPoint, StaffTrip } from "@/types";

/** Driver should publish GPS only during en-route staff trip statuses. */
export function shouldShareStaffTripGps(status: TripStatus | null | undefined): boolean {
  if (!status) return false;
  return isActiveStaffTrip(status);
}

export function activeStaffTripForGps(trips: StaffTrip[]): StaffTrip | undefined {
  return trips.find((t) => shouldShareStaffTripGps(t.status));
}

/** Mapbox line coordinates: [lng, lat][] */
export function pathCoordinatesFromGpsPoints(
  points: GpsPoint[]
): [number, number][] {
  return points.map((p) => [p.longitude, p.latitude]);
}

export function boundsFromCoordinates(
  coordinates: [number, number][]
): [[number, number], [number, number]] | null {
  if (coordinates.length === 0) return null;
  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function staffTripLiveMarkers(
  trips: StaffTrip[],
  positions: GpsLastPosition[]
): Array<{ id: string; lat: number; lng: number; label: string; color?: string }> {
  const enRouteTripIds = new Set(
    trips
      .filter((t) => isActiveStaffTrip(t.status))
      .map((t) => t.id)
  );
  const enRouteDriverIds = new Set(
    trips
      .filter((t) => isActiveStaffTrip(t.status))
      .map(
        (t) =>
          t.trip_assignments?.find((a) => !a.released_at)?.driver_id ?? null
      )
      .filter((id): id is string => Boolean(id))
  );

  return positions
    .filter(
      (p) =>
        (p.trip_id && enRouteTripIds.has(p.trip_id)) ||
        enRouteDriverIds.has(p.driver_id)
    )
    .map((p) => ({
      id: p.driver_id,
      lat: p.latitude,
      lng: p.longitude,
      label: p.drivers?.full_name ?? "Driver",
      color: "#0f766e",
    }));
}
