/**
 * Cape Town service area for maps lookup.
 *
 * One rectangle the founder can edit. It covers the Cape Peninsula (including
 * Cape Point), Cape Town International Airport, the Atlantic Seaboard, the
 * City Bowl, Northern and Southern Suburbs, Helderberg, the Winelands
 * (Stellenbosch, Paarl, Franschhoek), and stretches north to Langebaan and
 * south-east to Hermanus.
 *
 *   north-west corner: about 33.0°S, 18.0°E (north of Langebaan)
 *   south-east corner: about 34.5°S, 19.45°E (south of Cape Point / Hermanus)
 *
 * Google Places calls also send includedRegionCodes: ["za"]. A result whose
 * coordinates fall outside this box is not selectable. Typed names are still
 * allowed and flagged for an admin.
 */
export const CAPE_TOWN_BOUNDS = {
  /** Southern edge, south of Cape Point and Hermanus. */
  south: -34.5,
  /** Northern edge, north of Langebaan. */
  north: -32.9,
  /** Western edge, west of Langebaan and the Atlantic Seaboard. */
  west: 17.95,
  /** Eastern edge, east of Franschhoek and Hermanus. */
  east: 19.45,
} as const;

export function isInsideCapeTownBounds(
  latitude: number,
  longitude: number,
  bounds: typeof CAPE_TOWN_BOUNDS = CAPE_TOWN_BOUNDS
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= bounds.south &&
    latitude <= bounds.north &&
    longitude >= bounds.west &&
    longitude <= bounds.east
  );
}
