/**
 * Shared pickup → drop-off formatting for staff trips / invoice lines.
 *
 * This is the TypeScript mirror of the SQL functions `trip_route_text()` and
 * `validate_trip_places()` (migration 00069). The database is the source of
 * truth: invoice-line text is built there when a line is created and is never
 * re-rendered afterwards (issued invoices are immutable). Use this module only
 * for client-side validation, previews and tests.
 */

export const ROUTE_ARROW = "→";
export const ROUTE_SEPARATOR = ` ${ROUTE_ARROW} `;
export const MAX_PLACE_LENGTH = 120;

export type TripPlaces = { pickup: string; dropoff: string };

export type TripPlacesResult =
  | ({ ok: true } & TripPlaces)
  | { ok: false; error: string };

/** Collapse repeated whitespace and trim; keeps the user's own wording/casing. */
function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Mirrors validate_trip_places(): both places required, <= 120 chars, no "|"
 * or line breaks (they would break the pipe-delimited invoice line), and
 * pickup must differ from drop-off (case-insensitive).
 */
export function validateTripPlaces(
  pickup: string | null | undefined,
  dropoff: string | null | undefined
): TripPlacesResult {
  const from = clean(pickup);
  const to = clean(dropoff);
  if (!from || !to) {
    return { ok: false, error: "Pickup and drop-off are required" };
  }
  if (from.length > MAX_PLACE_LENGTH || to.length > MAX_PLACE_LENGTH) {
    return {
      ok: false,
      error: `Pickup and drop-off must be ${MAX_PLACE_LENGTH} characters or fewer`,
    };
  }
  if (/[|\r\n]/.test(from) || /[|\r\n]/.test(to)) {
    return {
      ok: false,
      error: 'Pickup and drop-off cannot contain "|" or line breaks',
    };
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    return { ok: false, error: "Pickup and drop-off must be different" };
  }
  return { ok: true, pickup: from, dropoff: to };
}

/**
 * Mirrors trip_route_text(): structured "Pickup → Drop-off" when both parts
 * exist, otherwise the legacy free-text area unchanged.
 */
export function tripRouteText(
  pickup: string | null | undefined,
  dropoff: string | null | undefined,
  legacyArea: string | null | undefined
): string {
  const from = clean(pickup);
  const to = clean(dropoff);
  if (from && to) return `${from}${ROUTE_SEPARATOR}${to}`;
  return clean(legacyArea);
}
