import { createClient } from "@/lib/supabase/client";
import {
  createTenantRow,
  listTenantRows,
  restoreTenantRow,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { Route, RouteStop } from "@/types";

const TABLE = "routes";
const STOPS_TABLE = "route_stops";

export function listRoutes(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<Route>(TABLE, organisationId, {
    orderBy: "name",
    ...options,
  });
}

export const createRoute = (
  organisationId: string,
  input: Omit<
    Partial<Route>,
    "id" | "organisation_id" | "created_at" | "updated_at" | "deleted_at" | "created_by"
  > & { name: string }
) =>
  createTenantRow<Route>(TABLE, {
    organisation_id: organisationId,
    ...input,
  });

export const updateRoute = (id: string, input: Partial<Route>) =>
  updateTenantRow<Route>(TABLE, id, input);

export const deleteRoute = (id: string) => softDeleteTenantRow(TABLE, id);

export const restoreRoute = (id: string) => restoreTenantRow(TABLE, id);

export async function listRouteStops(
  organisationId: string,
  routeId: string,
  options?: { includeArchived?: boolean }
): Promise<RouteStop[]> {
  const supabase = createClient();
  let query = supabase
    .from(STOPS_TABLE)
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("route_id", routeId)
    .order("sequence");

  if (!options?.includeArchived) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as RouteStop[]) ?? [];
}

export type RouteStopInput = {
  site_id?: string | null;
  pickup_point_id?: string | null;
  label?: string | null;
  dwell_minutes?: number | null;
  notes?: string | null;
};

/**
 * Hard-replaces the stop list for a route: existing stops are soft-deleted
 * and the provided stops are inserted fresh with sequences 1..n.
 */
export async function replaceRouteStops(
  organisationId: string,
  routeId: string,
  stops: RouteStopInput[]
): Promise<RouteStop[]> {
  const supabase = createClient();

  const existing = await listRouteStops(organisationId, routeId);
  if (existing.length > 0) {
    const { error: archiveError } = await supabase
      .from(STOPS_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .in(
        "id",
        existing.map((stop) => stop.id)
      );
    if (archiveError) throw archiveError;
  }

  if (stops.length === 0) return [];

  const rows = stops.map((stop, index) => ({
    organisation_id: organisationId,
    route_id: routeId,
    sequence: index + 1,
    site_id: stop.site_id ?? null,
    pickup_point_id: stop.pickup_point_id ?? null,
    label: stop.label ?? null,
    dwell_minutes: stop.dwell_minutes ?? null,
    notes: stop.notes ?? null,
  }));

  const { data, error } = await supabase
    .from(STOPS_TABLE)
    .insert(rows)
    .select("*");
  if (error) throw error;
  return (data as unknown as RouteStop[]) ?? [];
}
