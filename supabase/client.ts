import { createBrowserClient } from "@supabase/ssr";

import { env, hasSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";

/** Browser Supabase client (Client Components). */
export function createClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey
  );
}
