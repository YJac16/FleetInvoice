/** Env kill switch — never set in repo; defaults off. */
export function isComplianceScanEnvEnabled(): boolean {
  return process.env.COMPLIANCE_SCAN_ENABLED === "true";
}

export function complianceScanProviderName(): string | undefined {
  return process.env.COMPLIANCE_SCAN_PROVIDER;
}

export function isComplianceDriverUploadsEnvEnabled(): boolean {
  return process.env.COMPLIANCE_DRIVER_UPLOADS_ENABLED === "true";
}
