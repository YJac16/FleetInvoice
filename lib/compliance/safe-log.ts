const FORBIDDEN = /(storage_path|signedUrl|signed_url|base64|licence|license_number|pdp_number|eyJ[A-Za-z0-9_-]{10,})/i;

export function complianceLogSafe(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" && FORBIDDEN.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export function assertComplianceLogSafe(text: string): boolean {
  return !FORBIDDEN.test(text);
}
