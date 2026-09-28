/** Typed total is never overwritten; calculated is litres × unit price. */
export function calculatedTotal(
  litres: number,
  unitPrice: number
): number {
  return Math.round(litres * unitPrice * 100) / 100;
}

export function amountMismatchTolerance(
  typedTotal: number,
  settings: { amountTolAbs: number; amountTolPct: number }
): number {
  return Math.max(
    settings.amountTolAbs,
    (settings.amountTolPct / 100) * typedTotal
  );
}

export function isAmountMismatch(
  litres: number,
  unitPrice: number,
  typedTotal: number,
  settings: { amountTolAbs: number; amountTolPct: number }
): boolean {
  const calc = calculatedTotal(litres, unitPrice);
  const diff = Math.abs(calc - typedTotal);
  return diff > amountMismatchTolerance(typedTotal, settings);
}

/** Sample slip: 36.51 × 26.05 = 951.09 vs typed 951.10 → no flag at v1 defaults. */
export function amountMismatchDetails(
  litres: number,
  unitPrice: number,
  typedTotal: number,
  settings: { amountTolAbs: number; amountTolPct: number }
) {
  const calculated = calculatedTotal(litres, unitPrice);
  const diff = Math.abs(calculated - typedTotal);
  const tolAbs = settings.amountTolAbs;
  const tolPct = settings.amountTolPct;
  const tolApplied = amountMismatchTolerance(typedTotal, settings);
  return {
    litres,
    unit_price: unitPrice,
    calculated_total: calculated,
    typed_total: typedTotal,
    diff,
    tol_abs: tolAbs,
    tol_pct: tolPct,
    tol_applied: tolApplied,
  };
}
