/** Format South African Rand amounts for admin UI. */
export function formatRand(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return "—";
  }
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
