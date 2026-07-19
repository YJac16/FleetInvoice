/**
 * In-memory demo store used when Supabase env is not configured.
 * Enables reviewing the Driver Portal without a live database.
 */

import {
  DEMO_AREAS,
  DEMO_COMPANIES,
  DEMO_DRIVER_ID,
  DEMO_DRIVER_NAME,
  DEMO_VEHICLES,
} from "@/lib/demo/catalog";
import { AUDIT_ACTIONS } from "@/lib/pricing/constants";
import {
  applyDemoPricingToTrip,
  pushDemoAudit,
} from "@/lib/pricing/demo-store";
import { dayjs } from "@/utils/dates";
import type {
  AdminTripWithDetails,
  Trip,
  TripStatus,
  TripWithDetails,
} from "@/types/database";

export { DEMO_AREAS, DEMO_COMPANIES, DEMO_VEHICLES };

let trips: Trip[] = [
  {
    id: "t1111111-1111-1111-1111-111111111111",
    driver_id: DEMO_DRIVER_ID,
    company_id: DEMO_COMPANIES[0].id,
    vehicle_id: DEMO_VEHICLES[0].id,
    trip_date: dayjs().format("YYYY-MM-DD"),
    trip_time: "08:30:00",
    pickup_area: "Town",
    destination_area: "Woodstock",
    areas_visited: ["Town", "Woodstock"],
    passengers: 4,
    notes: "Morning staff transfer",
    status: "pending",
    calculated_price: 300,
    pricing_rule_id: "pr000018-0000-0000-0000-000000000018",
    price_locked: false,
    price_calculated_at: dayjs().subtract(2, "hour").toISOString(),
    pricing_status: "calculated",
    created_at: dayjs().subtract(2, "hour").toISOString(),
    updated_at: dayjs().subtract(2, "hour").toISOString(),
  },
  {
    id: "t2222222-2222-2222-2222-222222222222",
    driver_id: DEMO_DRIVER_ID,
    company_id: DEMO_COMPANIES[1].id,
    vehicle_id: DEMO_VEHICLES[0].id,
    trip_date: dayjs().subtract(1, "day").format("YYYY-MM-DD"),
    trip_time: "19:00:00",
    pickup_area: "Town",
    destination_area: "Green Point",
    areas_visited: ["Town", "Green Point", "Sea Point"],
    passengers: 2,
    notes: null,
    status: "approved",
    calculated_price: 350,
    pricing_rule_id: "pr000020-0000-0000-0000-000000000020",
    price_locked: true,
    price_calculated_at: dayjs().subtract(1, "day").toISOString(),
    pricing_status: "calculated",
    created_at: dayjs().subtract(1, "day").toISOString(),
    updated_at: dayjs().subtract(1, "day").toISOString(),
  },
];

export function getDemoDriverId(): string {
  return DEMO_DRIVER_ID;
}

function enrichDriver(trip: Trip): TripWithDetails {
  const company = DEMO_COMPANIES.find((c) => c.id === trip.company_id);
  const vehicle = DEMO_VEHICLES.find((v) => v.id === trip.vehicle_id);
  return {
    id: trip.id,
    driver_id: trip.driver_id,
    company_id: trip.company_id,
    vehicle_id: trip.vehicle_id,
    trip_date: trip.trip_date,
    trip_time: trip.trip_time,
    pickup_area: trip.pickup_area,
    destination_area: trip.destination_area,
    areas_visited: trip.areas_visited,
    passengers: trip.passengers,
    notes: trip.notes,
    status: trip.status,
    created_at: trip.created_at,
    updated_at: trip.updated_at,
    company_name: company?.company_name ?? "Unknown company",
    vehicle_label: vehicle
      ? `${vehicle.registration} · ${vehicle.make} ${vehicle.model}`
      : "Unknown vehicle",
  };
}

function enrichAdmin(trip: Trip): AdminTripWithDetails {
  const base = enrichDriver(trip);
  return {
    ...trip,
    company_name: base.company_name,
    vehicle_label: base.vehicle_label,
    driver_name: DEMO_DRIVER_NAME,
  };
}

export function listDemoTrips(driverId: string): TripWithDetails[] {
  return trips
    .filter((trip) => trip.driver_id === driverId)
    .map(enrichDriver)
    .sort((a, b) => {
      const dateCmp = b.trip_date.localeCompare(a.trip_date);
      if (dateCmp !== 0) return dateCmp;
      return (b.trip_time ?? "").localeCompare(a.trip_time ?? "");
    });
}

export function listDemoAdminTrips(): AdminTripWithDetails[] {
  return trips
    .map(enrichAdmin)
    .sort((a, b) => {
      const dateCmp = b.trip_date.localeCompare(a.trip_date);
      if (dateCmp !== 0) return dateCmp;
      return (b.trip_time ?? "").localeCompare(a.trip_time ?? "");
    });
}

export function getDemoTrip(
  id: string,
  driverId: string
): TripWithDetails | null {
  const trip = trips.find((t) => t.id === id && t.driver_id === driverId);
  return trip ? enrichDriver(trip) : null;
}

export function getDemoAdminTrip(id: string): AdminTripWithDetails | null {
  const trip = trips.find((t) => t.id === id);
  return trip ? enrichAdmin(trip) : null;
}

export function createDemoTrip(
  input: Omit<
    Trip,
    | "id"
    | "created_at"
    | "updated_at"
    | "status"
    | "calculated_price"
    | "pricing_rule_id"
    | "price_locked"
    | "price_calculated_at"
    | "pricing_status"
  > & {
    status?: TripStatus;
  },
  userId: string | null = null
): TripWithDetails {
  const now = new Date().toISOString();
  let trip: Trip = {
    ...input,
    id: crypto.randomUUID(),
    status: input.status ?? "pending",
    calculated_price: null,
    pricing_rule_id: null,
    price_locked: false,
    price_calculated_at: null,
    pricing_status: "needs_pricing",
    created_at: now,
    updated_at: now,
  };
  trip = applyDemoPricingToTrip(trip, userId, "create");
  trips = [trip, ...trips];
  return enrichDriver(trip);
}

export function updateDemoTrip(
  id: string,
  driverId: string,
  patch: Partial<
    Pick<
      Trip,
      | "company_id"
      | "vehicle_id"
      | "trip_date"
      | "trip_time"
      | "pickup_area"
      | "destination_area"
      | "areas_visited"
      | "passengers"
      | "notes"
      | "status"
    >
  >,
  userId: string | null = null
): TripWithDetails | null {
  const index = trips.findIndex((t) => t.id === id && t.driver_id === driverId);
  if (index < 0) return null;
  const current = trips[index];
  let next: Trip = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const routeChanged =
    next.company_id !== current.company_id ||
    next.vehicle_id !== current.vehicle_id ||
    next.pickup_area !== current.pickup_area ||
    next.destination_area !== current.destination_area ||
    JSON.stringify(next.areas_visited) !==
      JSON.stringify(current.areas_visited) ||
    next.passengers !== current.passengers;

  if (
    routeChanged &&
    !next.price_locked &&
    (next.status === "pending" || next.status === "rejected")
  ) {
    // Pending/rejected edits always recalculate (including prior manual overrides).
    next = {
      ...next,
      pricing_status:
        next.pricing_status === "manual_override"
          ? "needs_pricing"
          : next.pricing_status,
    };
    next = applyDemoPricingToTrip(next, userId, "recalculate");
  }

  trips = [...trips.slice(0, index), next, ...trips.slice(index + 1)];
  return enrichDriver(next);
}

export function updateDemoAdminTrip(
  id: string,
  patch: Partial<Trip>,
  userId: string | null = null
): AdminTripWithDetails | null {
  const index = trips.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const current = trips[index];
  let next: Trip = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (
    next.status === "approved" &&
    current.status !== "approved" &&
    !next.price_locked
  ) {
    next = { ...next, price_locked: true };
    pushDemoAudit({
      userId,
      action: AUDIT_ACTIONS.priceLocked,
      entityType: "trip",
      entityId: next.id,
      metadata: {
        calculated_price: next.calculated_price,
        pricing_rule_id: next.pricing_rule_id,
      },
    });
  }

  trips = [...trips.slice(0, index), next, ...trips.slice(index + 1)];
  return enrichAdmin(next);
}

export function deleteDemoTrip(id: string, driverId: string): boolean {
  const before = trips.length;
  trips = trips.filter((t) => !(t.id === id && t.driver_id === driverId));
  return trips.length < before;
}

export function findDemoDuplicate(input: {
  driverId: string;
  tripDate: string;
  tripTime: string;
  companyId: string;
  excludeId?: string;
}): TripWithDetails | null {
  const normalizedTime = normalizeTime(input.tripTime);
  const match = trips.find(
    (t) =>
      t.driver_id === input.driverId &&
      t.trip_date === input.tripDate &&
      normalizeTime(t.trip_time) === normalizedTime &&
      t.company_id === input.companyId &&
      t.id !== input.excludeId
  );
  return match ? enrichDriver(match) : null;
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}
