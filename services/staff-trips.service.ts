import { createClient } from "@/lib/supabase/client";
import type { StaffTransportCompany } from "@/lib/constants";
import type { DriverPresence, StaffTrip } from "@/types";
import { todayDateString } from "@/features/driver-portal/lib/dates";

const STAFF_TRIP_SELECT =
  "*, trip_assignments(id, driver_id, vehicle_id, released_at, drivers:driver_id (id, full_name))";

async function getCurrentDriverId(organisationId: string): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("drivers")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

function inDateRange(iso: string, from: string, toExclusive: string): boolean {
  const day = iso.slice(0, 10);
  return day >= from && day < toExclusive;
}

export async function listMyStaffTrips(
  organisationId: string,
  from: string,
  toExclusive: string
): Promise<StaffTrip[]> {
  const driverId = await getCurrentDriverId(organisationId);
  if (!driverId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("trip_assignments")
    .select(`id, driver_id, released_at, trips:trip_id (${STAFF_TRIP_SELECT})`)
    .eq("organisation_id", organisationId)
    .eq("driver_id", driverId)
    .is("deleted_at", null)
    .is("released_at", null)
    .order("assigned_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{ trips: StaffTrip | null }>)
    .map((row) => row.trips)
    .filter(
      (t): t is StaffTrip =>
        Boolean(
          t &&
            !t.deleted_at &&
            t.is_staff_transport &&
            t.status !== "cancelled" &&
            inDateRange(t.planned_start, from, toExclusive)
        )
    )
    .sort((a, b) => a.planned_start.localeCompare(b.planned_start));
}

export async function listStaffTripsForAdmin(
  organisationId: string,
  from: string,
  toExclusive: string
): Promise<StaffTrip[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(STAFF_TRIP_SELECT)
    .eq("organisation_id", organisationId)
    .eq("is_staff_transport", true)
    .is("deleted_at", null)
    .gte("planned_start", `${from}T00:00:00+02:00`)
    .lt("planned_start", `${toExclusive}T00:00:00+02:00`)
    .order("planned_start", { ascending: true });
  if (error) throw error;
  return (data as StaffTrip[]) ?? [];
}

export async function assignStaffTrip(
  organisationId: string,
  driverId: string,
  plannedStart: string,
  staffCompany: StaffTransportCompany,
  areaText: string,
  paxCount: number,
  areaId: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("assign_staff_trip", {
    p_organisation_id: organisationId,
    p_driver_id: driverId,
    p_planned_start: plannedStart,
    p_staff_company: staffCompany,
    p_area_text: areaText,
    p_pax_count: paxCount,
    p_area_id: areaId,
  });
  if (error) throw error;
  return data as string;
}

export async function updateStaffTrip(
  tripId: string,
  fields: {
    plannedStart?: string;
    staffCompany?: StaffTransportCompany;
    areaText?: string;
    paxCount?: number;
    areaId?: string;
  }
): Promise<StaffTrip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_staff_trip", {
    p_trip_id: tripId,
    p_planned_start: fields.plannedStart ?? null,
    p_staff_company: fields.staffCompany ?? null,
    p_area_text: fields.areaText ?? null,
    p_pax_count: fields.paxCount ?? null,
    p_area_id: fields.areaId ?? null,
  });
  if (error) throw error;
  return data as StaffTrip;
}

export async function cancelStaffTrip(tripId: string): Promise<StaffTrip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cancel_staff_trip", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  return data as StaffTrip;
}

export async function advanceStaffTripEnRoute(tripId: string): Promise<StaffTrip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("advance_staff_trip_en_route", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  return data as StaffTrip;
}

export async function startStaffTrip(
  tripId: string,
  openingKm: number,
  waybillConfirmed = true
): Promise<StaffTrip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_staff_trip", {
    p_trip_id: tripId,
    p_opening_km: openingKm,
    p_waybill_confirmed: waybillConfirmed,
  });
  if (error) throw error;
  return data as StaffTrip;
}

export async function endStaffTrip(
  tripId: string,
  closingKm: number,
  areaId?: string | null
): Promise<StaffTrip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("end_staff_trip", {
    p_trip_id: tripId,
    p_closing_km: closingKm,
    p_area_id: areaId ?? null,
  });
  if (error) throw error;
  return data as StaffTrip;
}

export async function overrideStaffTrip(
  tripId: string,
  fields: {
    plannedStart?: string;
    areaId?: string;
    openingKm?: number | null;
    closingKm?: number | null;
    paxCount?: number;
  }
): Promise<StaffTrip> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("override_staff_trip", {
    p_trip_id: tripId,
    p_planned_start: fields.plannedStart ?? null,
    p_area_id: fields.areaId ?? null,
    p_opening_km: fields.openingKm ?? null,
    p_closing_km: fields.closingKm ?? null,
    p_pax_count: fields.paxCount ?? null,
  });
  if (error) throw error;
  return data as StaffTrip;
}

export async function declareNoTripDay(
  organisationId: string,
  tripDate?: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("declare_driver_no_trip_day", {
    p_organisation_id: organisationId,
    p_trip_date: tripDate ?? todayDateString(),
  });
  if (error) throw error;
  return data as string;
}

export async function listNoTripDays(
  organisationId: string,
  from: string,
  toExclusive: string
): Promise<string[]> {
  const driverId = await getCurrentDriverId(organisationId);
  if (!driverId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("driver_no_trip_days")
    .select("trip_date")
    .eq("organisation_id", organisationId)
    .eq("driver_id", driverId)
    .gte("trip_date", from)
    .lt("trip_date", toExclusive)
    .is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as Array<{ trip_date: string }>).map((r) => r.trip_date);
}

export async function heartbeatDriverPresence(
  organisationId: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("heartbeat_driver_presence", {
    p_organisation_id: organisationId,
  });
  if (error) throw error;
  return data as string;
}

export async function listDriverPresence(
  organisationId: string
): Promise<DriverPresence[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("driver_presence")
    .select("*, drivers:driver_id (id, full_name)")
    .eq("organisation_id", organisationId);
  if (error) throw error;
  return (data as DriverPresence[]) ?? [];
}

export function isDriverOnline(
  presence: DriverPresence | undefined,
  thresholdSeconds = 60
): boolean {
  if (!presence?.last_seen_at) return false;
  const ageMs = Date.now() - new Date(presence.last_seen_at).getTime();
  return ageMs <= thresholdSeconds * 1000;
}
