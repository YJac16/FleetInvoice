/** v1: scan-assist stays off (Hobby + Founder decision). Both switches required when enabled later. */
export function isFuelScanAssistActive(
  dbScanEnabled: boolean | null | undefined
): boolean {
  if (!dbScanEnabled) return false;
  return process.env.FUEL_SCAN_ENABLED === "true";
}
