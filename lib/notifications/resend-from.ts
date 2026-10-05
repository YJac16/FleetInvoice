/** Verified GoOps sender used when RESEND_FROM_EMAIL is unset or blank. */
export const DEFAULT_RESEND_FROM_EMAIL = "GoOps <hello@goops.co.za>";

/**
 * Resolve the Resend From header.
 *
 * Empty and whitespace-only values are missing. `??` on `process.env` is not
 * enough: an empty string is not nullish, so a blank `RESEND_FROM_EMAIL` would
 * be sent as `from: ""`.
 */
export function resolveResendFromEmail(
  value: string | null | undefined
): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : DEFAULT_RESEND_FROM_EMAIL;
}
