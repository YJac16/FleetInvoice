/**
 * Validated public env access.
 * Server-only secrets should use createServerClient paths, not this module.
 */

function requireEnv(_name: string, value: string | undefined): string {
  // Empty values are allowed so the UI can build without credentials.
  // Auth services check hasSupabaseConfig() before calling Supabase.
  return value ?? "";
}

export const env = {
  supabaseUrl: requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  supabaseAnonKey: requireEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export function hasSupabaseConfig(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
