import {
  createTenantRow,
  listTenantRows,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import { createClient } from "@/lib/supabase/client";
import type { Geofence, GeofenceEvent } from "@/types";

const TABLE = "geofences";

export function listGeofences(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Geofence>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createGeofence = (
  organisationId: string,
  input: {
    name: string;
    center_lat: number;
    center_lng: number;
    radius_m: number;
    site_id?: string | null;
    pickup_point_id?: string | null;
    is_active?: boolean;
  }
) =>
  createTenantRow<Geofence>(TABLE, {
    organisation_id: organisationId,
    is_active: true,
    ...input,
  });

export const updateGeofence = (id: string, input: Partial<Geofence>) =>
  updateTenantRow<Geofence>(TABLE, id, input);

export const deleteGeofence = (id: string) => softDeleteTenantRow(TABLE, id);

export async function listGeofenceEvents(
  organisationId: string
): Promise<GeofenceEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("geofence_events")
    .select(
      "*, geofences:geofence_id (id, name), drivers:driver_id (id, full_name)"
    )
    .eq("organisation_id", organisationId)
    .order("recorded_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as unknown as GeofenceEvent[]) ?? [];
}
