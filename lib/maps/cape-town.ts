/**
 * Cape Town defaults for maps and place search. [lng, lat] order (Mapbox).
 * Pure constants so they can be unit-tested and reused by the place picker.
 */
export const CAPE_TOWN_CENTER: [number, number] = [18.4241, -33.9249];
export const CAPE_TOWN_DEFAULT_ZOOM = 10.5;

/** Generous Cape Metro bounds [[west, south], [east, north]]. */
export const CAPE_TOWN_MAX_BOUNDS: [[number, number], [number, number]] = [
  [18.0, -34.5],
  [19.4, -33.4],
];

/** Search bias box for place lookups: west,south,east,north. */
export const CAPE_TOWN_SEARCH_BBOX = "18.28,-34.25,19.20,-33.60";
