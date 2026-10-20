import { createClient } from "@/lib/supabase/client";
import type { StaffTrip } from "@/types";

const DRIVER_SUBMISSION_SELECT =
  "*, trip_assignments(id, driver_id, vehicle_id, released_at, drivers:driver_id (id, full_name)), companies:company_id (name)";

export type SubmitDriverTripInput = {
  organisationId: string;
  date: string;
  time: string;
  pickup: string;
  dropoff: string;
  companyId: string;
  paxCount: number;
  totalKm: number;
  notes?: string;
};

export type SubmitDriverTripResult = {
  tripId: string;
  duplicateWarning: boolean;
  needsVehicle: boolean;
};

function plannedStartIso(date: string, time: string): string {
  return `${date}T${time}:00+02:00`;
}

export async function submitDriverTrip(
  input: SubmitDriverTripInput
): Promise<SubmitDriverTripResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_driver_trip", {
    p_organisation_id: input.organisationId,
    p_planned_start: plannedStartIso(input.date, input.time),
    p_pickup: input.pickup,
    p_dropoff: input.dropoff,
    p_company_id: input.companyId,
    p_pax_count: input.paxCount,
    p_total_km: input.totalKm,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { trip_id: string; duplicate_warning: boolean; needs_vehicle: boolean }
    | null
    | undefined;
  if (!row?.trip_id) throw new Error("Trip was not created");
  return {
    tripId: row.trip_id,
    duplicateWarning: Boolean(row.duplicate_warning),
    needsVehicle: Boolean(row.needs_vehicle),
  };
}

export async function listMyDriverSubmissions(
  organisationId: string
): Promise<StaffTrip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (driverError) throw driverError;
  if (!driver) return [];

  const { data, error } = await supabase
    .from("trips")
    .select(DRIVER_SUBMISSION_SELECT)
    .eq("organisation_id", organisationId)
    .eq("submitted_by_driver", true)
    .is("deleted_at", null)
    .order("planned_start", { ascending: false });
  if (error) throw error;

  const trips = (data ?? []) as StaffTrip[];
  return trips.filter((t) =>
    t.trip_assignments?.some(
      (a) => a.driver_id === driver.id && !a.released_at
    )
  );
}

export async function listPendingDriverSubmissions(
  organisationId: string
): Promise<StaffTrip[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(DRIVER_SUBMISSION_SELECT)
    .eq("organisation_id", organisationId)
    .eq("submitted_by_driver", true)
    .eq("status", "planned")
    .is("approved_at", null)
    .is("deleted_at", null)
    .order("planned_start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StaffTrip[];
}

export async function countPendingDriverSubmissions(
  organisationId: string
): Promise<number> {
  const rows = await listPendingDriverSubmissions(organisationId);
  return rows.filter((t) => !t.rejected_reason?.trim()).length;
}

export async function approveDriverTrip(tripId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("approve_driver_trip", {
    p_trip_id: tripId,
  });
  if (error) throw error;
}

export async function rejectDriverTrip(
  tripId: string,
  reason: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reject_driver_trip", {
    p_trip_id: tripId,
    p_reason: reason,
  });
  if (error) throw error;
}

export function driverSubmissionStatus(trip: StaffTrip): "pending" | "approved" | "rejected" {
  if (trip.rejected_reason?.trim()) return "rejected";
  if (trip.approved_at) return "approved";
  return "pending";
}
