/**
 * Trip log notes shape: `{service company} | {n} pax | {area}`
 * e.g. `Lewis compliance | 1 pax | Manenberg`
 *
 * trip.company_id may be WCL (bill-to); service company lives on route.name.
 * Pax and area are parsed from notes when trip_passengers is unused.
 */

export type ParsedTripLogNotes = {
  pax: number | null;
  area: string | null;
};

export function parseTripLogNotes(
  notes: string | null | undefined
): ParsedTripLogNotes {
  if (!notes?.trim()) {
    return { pax: null, area: null };
  }

  const text = notes.trim();
  const paxMatch = text.match(/(\d+)\s*pax\b/i);
  const pax =
    paxMatch && paxMatch[1] ? Number.parseInt(paxMatch[1], 10) : null;

  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  let area: string | null = null;

  if (parts.length >= 3) {
    const last = parts[parts.length - 1] ?? "";
    area = /^\d+\s*pax$/i.test(last) ? null : last || null;
  } else if (parts.length === 2) {
    const second = parts[1] ?? "";
    if (!/^\d+\s*pax$/i.test(second)) {
      area = second || null;
    }
  }

  return {
    pax: Number.isFinite(pax) ? pax : null,
    area,
  };
}

/** Service company for invoice table — route name, never bill-to WCL from trip.company_id. */
export function resolveTripServiceCompany(
  routeName: string | null | undefined,
  notes: string | null | undefined
): string | null {
  const fromRoute = routeName?.trim();
  if (fromRoute) return fromRoute;

  const firstPart = notes
    ?.split("|")
    .map((part) => part.trim())
    .find(Boolean);
  return firstPart ?? null;
}

export function resolveVehicleRegistration(
  registrationNumber: string | null | undefined,
  vehicleName: string | null | undefined
): string | null {
  const reg = registrationNumber?.trim();
  if (reg) return reg;
  const name = vehicleName?.trim();
  return name || null;
}
