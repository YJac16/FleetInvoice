/**
 * Build a boarding deep-link for QR encoding (opaque token in query).
 */
export function boardingUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/employee/board?token=${encodeURIComponent(token)}`;
}

export function isTokenExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}
