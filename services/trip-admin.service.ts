import { createClient } from "@/lib/supabase/client";

export type TripAuditRow = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
};

export type TripBillingOverride = {
  trip_id: string;
  override_unit_price: number;
  reason: string;
  updated_at: string;
};

export async function listTripAudit(tripId: string): Promise<TripAuditRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trip_audit")
    .select("id, field_name, old_value, new_value, actor_id, reason, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripAuditRow[];
}

export async function getTripBillingOverride(
  tripId: string
): Promise<TripBillingOverride | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trip_billing_overrides")
    .select("trip_id, override_unit_price, reason, updated_at")
    .eq("trip_id", tripId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    trip_id: string;
    override_unit_price: number;
    reason: string;
    updated_at: string;
  };
  return {
    trip_id: row.trip_id,
    override_unit_price: Number(row.override_unit_price),
    reason: row.reason,
    updated_at: row.updated_at,
  };
}

export async function setTripBillingOverride(
  tripId: string,
  overrideUnitPrice: number,
  reason: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_trip_billing_override", {
    p_trip_id: tripId,
    p_override_unit_price: overrideUnitPrice,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function clearTripBillingOverride(
  tripId: string,
  reason: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("clear_trip_billing_override", {
    p_trip_id: tripId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function adminCreateStaffTrip(params: {
  organisationId: string;
  driverId: string;
  date: string;
  time: string;
  pickup: string;
  dropoff: string;
  companyId: string;
  paxCount: number;
  vehicleId: string;
  totalKm: number;
  notes?: string;
  markCompleted: boolean;
}): Promise<{ tripId: string; duplicateWarning: boolean }> {
  const supabase = createClient();
  const plannedStart = `${params.date}T${params.time}:00+02:00`;
  const { data, error } = await supabase.rpc("admin_create_staff_trip", {
    p_organisation_id: params.organisationId,
    p_driver_id: params.driverId,
    p_planned_start: plannedStart,
    p_pickup: params.pickup,
    p_dropoff: params.dropoff,
    p_company_id: params.companyId,
    p_pax_count: params.paxCount,
    p_vehicle_id: params.vehicleId,
    p_total_km: params.totalKm,
    p_notes: params.notes ?? null,
    p_mark_completed: params.markCompleted,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { trip_id: string; duplicate_warning: boolean }
    | null
    | undefined;
  if (!row?.trip_id) throw new Error("Trip was not created");
  return {
    tripId: row.trip_id,
    duplicateWarning: Boolean(row.duplicate_warning),
  };
}

export async function checkDriverTripDuplicateWarning(params: {
  organisationId: string;
  driverId: string;
  companyId: string;
  date: string;
  time: string;
  pickup: string;
  dropoff: string;
}): Promise<boolean> {
  const supabase = createClient();
  const area = `${params.pickup.trim()} → ${params.dropoff.trim()}`;
  const { data, error } = await supabase.rpc("driver_trip_duplicate_warning", {
    p_organisation_id: params.organisationId,
    p_driver_id: params.driverId,
    p_company_id: params.companyId,
    p_planned_start: `${params.date}T${params.time}:00+02:00`,
    p_route_label: area,
  });
  if (error) throw error;
  return data === true;
}
