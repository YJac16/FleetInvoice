/**
 * Compact label in the driver header.
 *
 * Reads `profiles.full_name` for the signed-in user (the row loaded by
 * `getSessionContext` and passed into `DriverShell`). Auth user metadata is
 * copied into that column only once, on signup (`handle_new_user`); this
 * helper does not read `user_metadata` or `drivers.full_name`.
 */
export function driverHeaderName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return "DRIVER";
  return trimmed.toUpperCase();
}
