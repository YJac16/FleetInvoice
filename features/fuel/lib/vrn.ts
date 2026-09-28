/** Normalise VRN for mismatch checks (upper-case, no spaces or dashes). */
export function normalizeVrn(value: string | null | undefined): string {
  if (!value) return "";
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export type SlipVrnStatus = "confirmed_prefill" | "edited" | "not_shown" | "legacy";
