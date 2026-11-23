import "server-only";

/**
 * Supabase project ref of the DEMO deployment (goops-demo). Hardcoded on
 * purpose: even if DEMO_MODE were set on live, live's project ref will never
 * equal this value, so demo-only features stay off.
 */
export const DEMO_SUPABASE_REF = "afeeqbcwwpquqjeowksa";

/** Extracts the project ref from https://<ref>.supabase.co. */
export function parseSupabaseRef(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const suffix = ".supabase.co";
    if (!host.endsWith(suffix)) return null;
    const ref = host.slice(0, -suffix.length);
    return ref.length > 0 && !ref.includes(".") ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Demo-only features (role switcher) are enabled only when BOTH:
 * - server-only env DEMO_MODE is exactly "true", and
 * - the Supabase project ref equals DEMO_SUPABASE_REF.
 */
export function isDemoEnabled(
  source: Record<string, string | undefined> = process.env
): boolean {
  if (source.DEMO_MODE !== "true") return false;
  return parseSupabaseRef(source.NEXT_PUBLIC_SUPABASE_URL) === DEMO_SUPABASE_REF;
}
