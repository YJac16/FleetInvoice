const SAFE_APP_PATH =
  /^\/[a-zA-Z0-9][a-zA-Z0-9/._-]*$/;

/**
 * Allow only same-origin relative app paths (blocks open redirects).
 */
export function sanitizeAppRedirectPath(
  value: string | null | undefined,
  fallback: string
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (trimmed.includes("\\") || trimmed.includes("@")) {
    return fallback;
  }
  if (!SAFE_APP_PATH.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
