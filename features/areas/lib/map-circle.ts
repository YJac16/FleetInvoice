/** Approximate circle as GeoJSON ring [lng, lat][] for Mapbox fill/line layers. */
export function circleRing(
  lng: number,
  lat: number,
  radiusM: number,
  steps = 64
): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(latRad);
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * 2 * Math.PI;
    const dLat = (Math.sin(theta) * radiusM) / metersPerDegLat;
    const dLng = (Math.cos(theta) * radiusM) / metersPerDegLng;
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}
