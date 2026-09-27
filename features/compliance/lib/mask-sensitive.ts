/** Mask licence / PrDP numbers for driver UI (last 4 visible). */
export function maskSensitiveNumber(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 4) return trimmed;
  return `${"•".repeat(Math.min(trimmed.length - 4, 8))}${trimmed.slice(-4)}`;
}
