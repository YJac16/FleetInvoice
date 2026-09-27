/** Bearer-protected API routes (exact path; session not required in middleware). */
export const PUBLIC_BEARER_API_PATHS = new Set([
  "/api/notifications/process",
  "/api/cron/notifications",
  "/api/cron/compliance-alerts",
  "/api/cron/compliance-digest",
]);

function normalizeBearerApiPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isPublicBearerApiPath(pathname: string): boolean {
  return PUBLIC_BEARER_API_PATHS.has(normalizeBearerApiPath(pathname));
}
