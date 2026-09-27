/** Cron API routes that verify a bearer secret in the route handler (no session). */
export const CRON_PUBLIC_API_PATHS = new Set([
  "/api/cron/notifications",
  "/api/cron/compliance-alerts",
  "/api/cron/compliance-digest",
]);

export function isCronPublicApiPath(pathname: string): boolean {
  return CRON_PUBLIC_API_PATHS.has(pathname);
}
