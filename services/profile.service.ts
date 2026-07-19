import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/supabase/server";
import type { Profile } from "@/types/database";
import type { SessionContext } from "@/types/auth";

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!hasSupabaseConfig()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile:", error.message);
    return null;
  }

  return data;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  if (!hasSupabaseConfig()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await getCurrentProfile();

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? "",
    role: profile?.role ?? "driver",
    fullName: profile?.full_name ?? user.email ?? "User",
  };
}
