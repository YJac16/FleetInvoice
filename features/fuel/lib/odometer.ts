/**
 * Pure odometer rules for fuel fill-ups (mirrors log_fuel_fillup RPC).
 */

export function isOdometerAllowed(
  odometerKm: number,
  lastOdometerKm: number | null | undefined
): boolean {
  if (!Number.isFinite(odometerKm) || odometerKm < 0) return false;
  if (lastOdometerKm == null) return true;
  return odometerKm >= lastOdometerKm;
}

export function assertOdometerMonotonic(
  odometerKm: number,
  lastOdometerKm: number | null | undefined
): void {
  if (!Number.isFinite(odometerKm) || odometerKm < 0) {
    throw new Error("Odometer must be non-negative");
  }
  if (lastOdometerKm != null && odometerKm < lastOdometerKm) {
    throw new Error(
      `Odometer ${odometerKm} km is less than last fill-up ${lastOdometerKm} km`
    );
  }
}

/** km since last fill; null when no prior reading. */
export function kmSinceLastFill(
  odometerKm: number,
  lastOdometerKm: number | null | undefined
): number | null {
  if (lastOdometerKm == null) return null;
  return odometerKm - lastOdometerKm;
}

/** Litres per 100 km when both readings and litres are known. */
export function litresPer100Km(
  litres: number,
  odometerKm: number,
  lastOdometerKm: number | null | undefined
): number | null {
  const distance = kmSinceLastFill(odometerKm, lastOdometerKm);
  if (distance == null || distance <= 0 || litres <= 0) return null;
  return (litres / distance) * 100;
}
