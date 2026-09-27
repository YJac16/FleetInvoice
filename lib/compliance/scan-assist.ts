import { isComplianceScanEnvEnabled } from "@/lib/compliance/flags";

/**
 * AI scan-assist is off unless both the server env flag and org setting are on.
 * Client capture UI treats scan as disabled when env is not enabled (Hobby default).
 */
export function isComplianceScanAssistActive(
  organisationScanEnabled: boolean | null | undefined
): boolean {
  return isComplianceScanEnvEnabled() && organisationScanEnabled === true;
}
