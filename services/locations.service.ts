import { createClient } from "@/lib/supabase/client";
import type { ServiceLocation } from "@/features/locations/lib/location-match";

const TABLE = "locations";

export async function listServiceLocations(
  organisationId: string
): Promise<ServiceLocation[]> {
  const supabase = createClient();
  const filter = supabase
    .from(TABLE)
    .select("id, organisation_id, name, aliases, region, status, needs_review")
    .or(`organisation_id.eq.${organisationId},organisation_id.is.null`)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  const first = await filter;
  if (!first.error) return (first.data ?? []) as ServiceLocation[];
  if (!/needs_review/i.test(first.error.message)) throw first.error;

  const fallback = await supabase
    .from(TABLE)
    .select("id, organisation_id, name, aliases, region, status")
    .or(`organisation_id.eq.${organisationId},organisation_id.is.null`)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as ServiceLocation[];
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
    .select("id, organisation_id, name, aliases, region, status, needs_review")
    .single();
  if (error) throw error;
  return data as ServiceLocation;
}

export type ProposedLocation = {
  id: string;
  name: string;
  needsReview: boolean;
};

/**
 * Save a place the driver picked or typed so the next trip can reuse the same
 * name. Google-verified places inside the Cape Town box are stored as ready.
 * A typed name is stored and flagged for an admin (`needs_review`).
 */
export async function proposeServiceLocation(input: {
  organisationId: string;
  name: string;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  verified?: boolean;
}): Promise<ProposedLocation> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("propose_service_location", {
    p_organisation_id: input.organisationId,
    p_name: input.name,
    p_place_id: input.placeId ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_verified: input.verified ?? false,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; name: string; needs_review: boolean }
    | null;
  if (!row?.id) throw new Error("Location was not saved");
  return {
    id: row.id,
    name: row.name,
    needsReview: Boolean(row.needs_review),
  };
}
