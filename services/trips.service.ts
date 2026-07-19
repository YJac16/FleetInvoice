"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import {
  canDriverDeleteTrip,
  canDriverEditTrip,
} from "@/lib/trips/constants";
import {
  createDemoTrip,
  deleteDemoTrip,
  findDemoDuplicate,
  getDemoTrip,
  listDemoTrips,
  updateDemoTrip,
} from "@/lib/trips/demo-store";
import { createClient } from "@/supabase/server";
import type {
  TablesInsert,
  TablesUpdate,
  TripWithDetails,
} from "@/types/database";
import {
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";
import type { TripFormValues } from "@/features/trips/schemas";

// Pricing is applied server-side only:
// - Demo store: lib/pricing/demo-store via createDemoTrip/updateDemoTrip
// - Supabase: BEFORE INSERT/UPDATE trigger in 00003_pricing_engine.sql
// Drivers never receive calculated_price from list_my_trips / get_my_trip RPCs.

/**
 * Supabase generated-client inference currently collapses some trip mutations
 * to `never` when array columns are present. Cast through unknown at the
 * boundary while keeping payload types strict in app code.
 */
async function insertTripRow(
  payload: TablesInsert<"trips">
): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string } | null;
}

async function updateTripRow(
  id: string,
  driverId: string,
  payload: TablesUpdate<"trips">
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("trips")
    .update(payload as never)
    .eq("id", id)
    .eq("driver_id", driverId);

  if (error) {
    throw new Error(error.message);
  }
}

export type TripActionResult =
  | { success: true; tripId: string; message?: string }
  | { success: false; error: string };

export type DuplicateCheckResult =
  | { duplicate: false }
  | { duplicate: true; trip: TripWithDetails };

type DriverContextResult =
  | { ok: true; driverId: string }
  | { ok: false; error: string };

async function requireDriverContext(): Promise<DriverContextResult> {
  const session =
    (await getSessionContext()) ??
    (!hasSupabaseConfig() ? getDemoSessionContext() : null);

  if (!session) {
    return { ok: false, error: "You must be signed in." };
  }

  if (session.role !== "driver" || !session.driverId) {
    return {
      ok: false,
      error: "Only drivers with a linked driver profile can manage trips.",
    };
  }

  return { ok: true, driverId: session.driverId };
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

export async function listMyTrips(): Promise<TripWithDetails[]> {
  const ctx = await requireDriverContext();
  if (!ctx.ok) return [];

  if (!hasSupabaseConfig()) {
    return listDemoTrips(ctx.driverId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_my_trips" as never
  );

  if (error) {
    console.error("listMyTrips:", error.message);
    return [];
  }

  return ((data ?? []) as TripWithDetails[]).map((row) => ({
    ...row,
    areas_visited: row.areas_visited ?? [],
    trip_time: String(row.trip_time),
  }));
}

export async function getMyTrip(id: string): Promise<TripWithDetails | null> {
  const ctx = await requireDriverContext();
  if (!ctx.ok) return null;

  if (!hasSupabaseConfig()) {
    return getDemoTrip(id, ctx.driverId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_my_trip" as never,
    { p_trip_id: id } as never
  );

  if (error) {
    console.error("getMyTrip:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const trip = row as TripWithDetails;
  return {
    ...trip,
    areas_visited: trip.areas_visited ?? [],
    trip_time: String(trip.trip_time),
  };
}

export async function checkDuplicateTrip(input: {
  tripDate: string;
  tripTime: string;
  companyId: string;
  excludeId?: string;
}): Promise<DuplicateCheckResult> {
  const ctx = await requireDriverContext();
  if (!ctx.ok) return { duplicate: false };

  if (!hasSupabaseConfig()) {
    const trip = findDemoDuplicate({
      driverId: ctx.driverId,
      tripDate: input.tripDate,
      tripTime: input.tripTime,
      companyId: input.companyId,
      excludeId: input.excludeId,
    });
    return trip ? { duplicate: true, trip } : { duplicate: false };
  }

  const supabase = await createClient();
  let query = supabase
    .from("trips")
    .select("id")
    .eq("driver_id", ctx.driverId)
    .eq("trip_date", input.tripDate)
    .eq("trip_time", normalizeTime(input.tripTime))
    .eq("company_id", input.companyId)
    .limit(1);

  if (input.excludeId) {
    query = query.neq("id", input.excludeId);
  }

  const { data, error } = await query.maybeSingle<{ id: string }>();
  if (error || !data) {
    return { duplicate: false };
  }

  const trip = await getMyTrip(data.id);
  if (!trip) return { duplicate: false };
  return { duplicate: true, trip };
}

export async function createTrip(
  values: TripFormValues
): Promise<TripActionResult> {
  const ctx = await requireDriverContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const payload = {
    driver_id: ctx.driverId,
    company_id: values.companyId,
    vehicle_id: values.vehicleId,
    trip_date: values.tripDate,
    trip_time: normalizeTime(values.tripTime),
    pickup_area: values.pickupArea,
    destination_area: values.destinationArea,
    areas_visited: values.areasVisited ?? [],
    passengers: values.passengers,
    notes: values.notes?.trim() ? values.notes.trim() : null,
    status: "pending" as const,
  };

  if (!hasSupabaseConfig()) {
    const session = getDemoSessionContext();
    const trip = createDemoTrip(payload, session.userId);
    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.dashboard);
    return { success: true, tripId: trip.id, message: "Trip saved" };
  }

  try {
    const data = await insertTripRow(payload);
    if (!data) {
      return { success: false, error: "Failed to save trip" };
    }
    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.dashboard);
    return { success: true, tripId: data.id, message: "Trip saved" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save trip",
    };
  }
}

export async function updateTrip(
  id: string,
  values: TripFormValues
): Promise<TripActionResult> {
  const ctx = await requireDriverContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const existing = await getMyTrip(id);
  if (!existing) {
    return { success: false, error: "Trip not found." };
  }
  if (!canDriverEditTrip(existing.status)) {
    return {
      success: false,
      error: "Only pending or rejected trips can be edited.",
    };
  }

  const payload = {
    company_id: values.companyId,
    vehicle_id: values.vehicleId,
    trip_date: values.tripDate,
    trip_time: normalizeTime(values.tripTime),
    pickup_area: values.pickupArea,
    destination_area: values.destinationArea,
    areas_visited: values.areasVisited ?? [],
    passengers: values.passengers,
    notes: values.notes?.trim() ? values.notes.trim() : null,
    status: "pending" as const,
  };

  if (!hasSupabaseConfig()) {
    const session = getDemoSessionContext();
    const trip = updateDemoTrip(id, ctx.driverId, payload, session.userId);
    if (!trip) return { success: false, error: "Trip not found." };
    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.tripDetail(id));
    revalidatePath(ROUTES.dashboard);
    return { success: true, tripId: trip.id, message: "Trip updated" };
  }

  try {
    await updateTripRow(id, ctx.driverId, payload);
    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.tripDetail(id));
    revalidatePath(ROUTES.dashboard);
    return { success: true, tripId: id, message: "Trip updated" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update trip",
    };
  }
}

export async function deleteTrip(id: string): Promise<TripActionResult> {
  const ctx = await requireDriverContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const existing = await getMyTrip(id);
  if (!existing) {
    return { success: false, error: "Trip not found." };
  }
  if (!canDriverDeleteTrip(existing.status)) {
    return { success: false, error: "Only pending trips can be deleted." };
  }

  if (!hasSupabaseConfig()) {
    const ok = deleteDemoTrip(id, ctx.driverId);
    if (!ok) return { success: false, error: "Trip not found." };
    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.dashboard);
    return { success: true, tripId: id, message: "Trip deleted" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", id)
    .eq("driver_id", ctx.driverId)
    .eq("status", "pending");

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(ROUTES.trips);
  revalidatePath(ROUTES.dashboard);
  return { success: true, tripId: id, message: "Trip deleted" };
}

export interface DriverDashboardStats {
  todayCount: number;
  weekCount: number;
  pendingCount: number;
  approvedCount: number;
  recentTrips: TripWithDetails[];
  upcomingTrips: TripWithDetails[];
}

export async function getDriverDashboardStats(): Promise<DriverDashboardStats> {
  const trips = await listMyTrips();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const startOfWeek = new Date(today);
  const day = startOfWeek.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  startOfWeek.setDate(startOfWeek.getDate() + diff);
  const weekStart = startOfWeek.toISOString().slice(0, 10);

  const todayCount = trips.filter((t) => t.trip_date === todayStr).length;
  const weekCount = trips.filter((t) => t.trip_date >= weekStart).length;
  const pendingCount = trips.filter((t) => t.status === "pending").length;
  const approvedCount = trips.filter((t) => t.status === "approved").length;

  const recentTrips = trips.slice(0, 5);
  const upcomingTrips = trips
    .filter((t) => t.trip_date >= todayStr && t.status === "pending")
    .slice(0, 5);

  return {
    todayCount,
    weekCount,
    pendingCount,
    approvedCount,
    recentTrips,
    upcomingTrips,
  };
}
