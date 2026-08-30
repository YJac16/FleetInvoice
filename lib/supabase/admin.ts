import { createClient } from "@supabase/supabase-js";

import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * Server-only admin client for privileged jobs (notification drain).
 * Returns null when service role is not configured.
 */
export function createServiceClient() {
  if (!isSupabaseConfigured()) return null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "your-service-role-key") return null;

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
