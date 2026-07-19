"use server";

import { revalidatePath } from "next/cache";

import type { PriceOverrideValues } from "@/features/pricing/schemas";
import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import {
  listDemoPricingHistory,
  recordDemoPriceOverride,
} from "@/lib/pricing/demo-store";
import {
  getDemoAdminTrip,
  listDemoAdminTrips,
  updateDemoAdminTrip,
} from "@/lib/trips/demo-store";
import { createClient } from "@/supabase/server";
import type {
  AdminTripWithDetails,
  PricingHistory,
} from "@/types/database";
import {
  getDemoAdminSessionContext,
  getSessionContext,
} from "@/services/profile.service";

export type AdminTripActionResult =
  | { success: true; tripId: string; message?: string }
  | { success: false; error: string };

type AdminContextResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function requireAdminContext(): Promise<AdminContextResult> {
  const session =
    (await getSessionContext()) ??
    (!hasSupabaseConfig() ? getDemoAdminSessionContext() : null);

  if (!session) {
    return { ok: false, error: "You must be signed in." };
  }
  if (session.role !== "admin") {
    return { ok: false, error: "Only admins can manage trip pricing." };
  }
  return { ok: true, userId: session.userId };
}

function normalizeAdminTrip(row: AdminTripWithDetails): AdminTripWithDetails {
  return {
    ...row,
    areas_visited: row.areas_visited ?? [],
    trip_time: String(row.trip_time),
    calculated_price:
      row.calculated_price === null || row.calculated_price === undefined
        ? null
        : Number(row.calculated_price),
    price_locked: Boolean(row.price_locked),
  };
}

export async function listAdminTrips(): Promise<AdminTripWithDetails[]> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return [];

  if (!hasSupabaseConfig()) {
    return listDemoAdminTrips();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_admin_trips" as never);

  if (error) {
    console.error("listAdminTrips:", error.message);
    return [];
  }

  return ((data ?? []) as AdminTripWithDetails[]).map(normalizeAdminTrip);
}

export async function getAdminTrip(
  id: string
): Promise<AdminTripWithDetails | null> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return null;

  if (!hasSupabaseConfig()) {
    return getDemoAdminTrip(id);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_admin_trip" as never,
    { p_trip_id: id } as never
  );

  if (error) {
    console.error("getAdminTrip:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return normalizeAdminTrip(row as AdminTripWithDetails);
}

export async function approveTrip(id: string): Promise<AdminTripActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  if (!hasSupabaseConfig()) {
    const trip = updateDemoAdminTrip(
      id,
      { status: "approved", price_locked: true },
      ctx.userId
    );
    if (!trip) return { success: false, error: "Trip not found." };
    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.tripDetail(id));
    return { success: true, tripId: id, message: "Trip approved — price locked" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trips")
    .update({ status: "approved" } as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(ROUTES.trips);
  revalidatePath(ROUTES.tripDetail(id));
  return { success: true, tripId: id, message: "Trip approved — price locked" };
}

export async function overrideTripPrice(
  id: string,
  values: PriceOverrideValues
): Promise<AdminTripActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  if (!hasSupabaseConfig()) {
    const existing = getDemoAdminTrip(id);
    if (!existing) return { success: false, error: "Trip not found." };

    recordDemoPriceOverride({
      tripId: id,
      oldPrice: existing.calculated_price,
      newPrice: values.newPrice,
      changedBy: ctx.userId,
      reason: values.reason,
    });

    const trip = updateDemoAdminTrip(
      id,
      {
        calculated_price: values.newPrice,
        pricing_status: "manual_override",
        price_calculated_at: new Date().toISOString(),
      },
      ctx.userId
    );
    if (!trip) return { success: false, error: "Trip not found." };

    revalidatePath(ROUTES.trips);
    revalidatePath(ROUTES.tripDetail(id));
    return { success: true, tripId: id, message: "Price overridden" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "override_trip_price" as never,
    {
      p_trip_id: id,
      p_new_price: values.newPrice,
      p_reason: values.reason,
    } as never
  );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(ROUTES.trips);
  revalidatePath(ROUTES.tripDetail(id));
  return { success: true, tripId: id, message: "Price overridden" };
}

export async function listTripPricingHistory(
  tripId: string
): Promise<PricingHistory[]> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return [];

  if (!hasSupabaseConfig()) {
    return listDemoPricingHistory(tripId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_history")
    .select("*")
    .eq("trip_id", tripId)
    .order("changed_at", { ascending: false });

  if (error) {
    console.error("listTripPricingHistory:", error.message);
    return [];
  }

  return ((data ?? []) as PricingHistory[]).map((row) => ({
    ...row,
    old_price: row.old_price === null ? null : Number(row.old_price),
    new_price: Number(row.new_price),
  }));
}
