import { hasSupabaseConfig } from "@/lib/env";
import { getDemoDriverId } from "@/lib/trips/demo-store";
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

  let driverId: string | null = null;
  let defaultVehicleId: string | null = null;

  if (profile?.role === "driver") {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, vehicle_id")
      .eq("profile_id", user.id)
      .maybeSingle<{ id: string; vehicle_id: string | null }>();

    driverId = driver?.id ?? null;
    defaultVehicleId = driver?.vehicle_id ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? "",
    role: profile?.role ?? "driver",
    fullName: profile?.full_name ?? user.email ?? "User",
    driverId,
    defaultVehicleId,
  };
}

/** Demo session used when Supabase is not configured. */
export function getDemoSessionContext(): SessionContext {
  return {
    userId: "00000000-0000-0000-0000-000000000000",
    email: "driver@fleetinvoice.local",
    role: "driver",
    fullName: "Yaseen",
    driverId: getDemoDriverId(),
    defaultVehicleId: "v1111111-1111-1111-1111-111111111111",
  };
}
