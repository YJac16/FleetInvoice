export function isVerifiedDestination(area: {
  status?: string;
  lat: number | null;
  lng: number | null;
}): boolean {
  return (
    area.status !== "inactive" &&
    area.lat != null &&
    area.lng != null &&
    Number.isFinite(area.lat) &&
    Number.isFinite(area.lng)
  );
}
