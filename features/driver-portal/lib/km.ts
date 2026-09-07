/** Total km from opening/closing odometer readings. */
export function calcTotalKm(
  openingKm: number | null | undefined,
  closingKm: number | null | undefined
): number | null {
  if (openingKm == null || closingKm == null) return null;
  if (!Number.isFinite(openingKm) || !Number.isFinite(closingKm)) return null;
  if (closingKm < openingKm) return null;
  return Math.round((closingKm - openingKm) * 10) / 10;
}

export function assertKmOrder(openingKm: number, closingKm: number): void {
  if (!Number.isFinite(openingKm) || openingKm < 0) {
    throw new Error("Opening km must be non-negative");
  }
  if (!Number.isFinite(closingKm) || closingKm < openingKm) {
    throw new Error("Closing km must be >= opening km");
  }
}
