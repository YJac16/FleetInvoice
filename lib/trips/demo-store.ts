/**
 * In-memory demo store used when Supabase env is not configured.
 * Enables reviewing the Driver Portal without a live database.
 */

import { dayjs } from "@/utils/dates";
import type {
  Area,
  Company,
  Trip,
  TripStatus,
  TripWithDetails,
  Vehicle,
} from "@/types/database";

const DEMO_DRIVER_ID = "11111111-1111-1111-1111-111111111111";

export const DEMO_COMPANIES: Company[] = [
  {
    id: "c1111111-1111-1111-1111-111111111111",
    company_name: "Lewis Compliance",
    billing_address: null,
    contact_person: "Office Desk",
    phone: null,
    email: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "c2222222-2222-2222-2222-222222222222",
    company_name: "Lewis Head Office",
    billing_address: null,
    contact_person: "Dispatch",
    phone: null,
    email: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "c3333333-3333-3333-3333-333333333333",
    company_name: "Atlantic Transfers",
    billing_address: null,
    contact_person: null,
    phone: null,
    email: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_VEHICLES: Vehicle[] = [
  {
    id: "v1111111-1111-1111-1111-111111111111",
    registration: "CA 123-456",
    make: "Toyota",
    model: "Quantum",
    capacity: 14,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "v2222222-2222-2222-2222-222222222222",
    registration: "CA 987-654",
    make: "Mercedes",
    model: "Sprinter",
    capacity: 22,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_AREAS: Area[] = [
  "Town",
  "Woodstock",
  "Green Point",
  "Sea Point",
  "Airport",
  "Bellville",
  "Parow",
  "Milnerton",
  "Observatory",
  "Other",
].map((name, index) => ({
  id: `a0000000-0000-0000-0000-00000000000${index}`,
  name,
  zone: null,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

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
    passengers: 3,
    notes: "Morning staff transfer",
    status: "pending",
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
    created_at: dayjs().subtract(1, "day").toISOString(),
    updated_at: dayjs().subtract(1, "day").toISOString(),
  },
];

export function getDemoDriverId(): string {
  return DEMO_DRIVER_ID;
}

function enrich(trip: Trip): TripWithDetails {
  const company = DEMO_COMPANIES.find((c) => c.id === trip.company_id);
  const vehicle = DEMO_VEHICLES.find((v) => v.id === trip.vehicle_id);
  return {
    ...trip,
    company_name: company?.company_name ?? "Unknown company",
    vehicle_label: vehicle
      ? `${vehicle.registration} · ${vehicle.make} ${vehicle.model}`
      : "Unknown vehicle",
  };
}

export function listDemoTrips(driverId: string): TripWithDetails[] {
  return trips
    .filter((trip) => trip.driver_id === driverId)
    .map(enrich)
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
  return trip ? enrich(trip) : null;
}

export function createDemoTrip(
  input: Omit<Trip, "id" | "created_at" | "updated_at" | "status"> & {
    status?: TripStatus;
  }
): TripWithDetails {
  const now = new Date().toISOString();
  const trip: Trip = {
    ...input,
    id: crypto.randomUUID(),
    status: input.status ?? "pending",
    created_at: now,
    updated_at: now,
  };
  trips = [trip, ...trips];
  return enrich(trip);
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
  >
): TripWithDetails | null {
  const index = trips.findIndex((t) => t.id === id && t.driver_id === driverId);
  if (index < 0) return null;
  const current = trips[index];
  const next: Trip = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  trips = [...trips.slice(0, index), next, ...trips.slice(index + 1)];
  return enrich(next);
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
  return match ? enrich(match) : null;
}

function normalizeTime(value: string): string {
  // Accept HH:mm or HH:mm:ss
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}
