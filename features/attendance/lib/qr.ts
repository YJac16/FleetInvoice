/**
 * Build a boarding deep-link for QR encoding (opaque token in query).
 */
export function boardingUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/employee/board?token=${encodeURIComponent(token)}`;
}

export function driverQrUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/employee/board?driverToken=${encodeURIComponent(token)}`;
}

export function extractTokenFromPayload(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const token =
      url.searchParams.get("token") ?? url.searchParams.get("driverToken");
    if (token) return token;
  } catch {
    // not a URL
  }
  return trimmed;
}

export function isTokenExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}
