import { createClient } from "@/lib/supabase/client";
import type { ServiceLocation } from "@/features/locations/lib/location-match";

const TABLE = "locations";

export async function listServiceLocations(
  organisationId: string
): Promise<ServiceLocation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, organisation_id, name, aliases, region, status")
    .or(`organisation_id.eq.${organisationId},organisation_id.is.null`)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as ServiceLocation[];
}

export async function createServiceLocation(
  organisationId: string,
  name: string
): Promise<ServiceLocation> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organisation_id: organisationId,
      name: name.trim(),
      created_by: user?.id ?? null,
    })
    .select("id, organisation_id, name, aliases, region, status")
    .single();
  if (error) throw error;
  return data as ServiceLocation;
}
