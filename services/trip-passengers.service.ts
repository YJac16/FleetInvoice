import { createClient } from "@/lib/supabase/client";
import type {
  Employee,
  Trip,
  TripPassenger,
  TripPassengerDirection,
} from "@/types";

const PASSENGER_SELECT =
  "*, employees:employee_id (id, full_name, email, phone, home_address, home_latitude, home_longitude, company_id, site_id, companies:company_id (id, name), sites:site_id (id, name, address, latitude, longitude)), trips:trip_id (id, planned_start, status, routes:route_id (id, name))";

export async function requestTripSeat(input: {
  organisationId: string;
  tripId: string;
  direction: TripPassengerDirection;
}): Promise<TripPassenger> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("request_trip_seat", {
    p_organisation_id: input.organisationId,
    p_trip_id: input.tripId,
    p_direction: input.direction,
  });
  if (error) throw error;
  return data as TripPassenger;
}

export async function cancelTripSeat(input: {
  organisationId: string;
  tripId: string;
}): Promise<TripPassenger> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cancel_trip_seat", {
    p_organisation_id: input.organisationId,
    p_trip_id: input.tripId,
  });
  if (error) throw error;
  return data as TripPassenger;
}

export async function listMyTripPassengers(
  organisationId: string
): Promise<TripPassenger[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (empError) throw empError;
  if (!emp) return [];

  const { data, error } = await supabase
    .from("trip_passengers")
    .select(PASSENGER_SELECT)
    .eq("organisation_id", organisationId)
    .eq("employee_id", emp.id)
    .neq("status", "cancelled")
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as TripPassenger[]) ?? [];
}

export async function listTripPassengers(
  organisationId: string,
  tripId: string
): Promise<TripPassenger[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trip_passengers")
    .select(PASSENGER_SELECT)
    .eq("organisation_id", organisationId)
    .eq("trip_id", tripId)
    .neq("status", "cancelled")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as TripPassenger[]) ?? [];
}

export async function listPassengersForTrips(
  organisationId: string,
  tripIds: string[]
): Promise<TripPassenger[]> {
  if (tripIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trip_passengers")
    .select(PASSENGER_SELECT)
    .eq("organisation_id", organisationId)
    .in("trip_id", tripIds)
    .neq("status", "cancelled")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as TripPassenger[]) ?? [];
}

export type PassengerWithNav = TripPassenger & {
  employees?: (Pick<
    Employee,
    | "id"
    | "full_name"
    | "email"
    | "phone"
    | "home_address"
    | "home_latitude"
    | "home_longitude"
    | "company_id"
    | "site_id"
  > & {
    companies?: { id: string; name: string } | null;
    sites?: {
      id: string;
      name: string;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }) | null;
  trips?: (Pick<Trip, "id" | "planned_start" | "status"> & {
    routes?: { id: string; name: string } | null;
  }) | null;
};

export function pickupNavTarget(passenger: PassengerWithNav): {
  label: string;
  mapsQuery: string;
} {
  const emp = passenger.employees;
  if (passenger.direction === "from_work") {
    const site = emp?.sites;
    if (site?.latitude != null && site?.longitude != null) {
      return {
        label: site.name || "Work site",
        mapsQuery: `${site.latitude},${site.longitude}`,
      };
    }
    if (site?.address) {
      return { label: site.name || "Work site", mapsQuery: site.address };
    }
    return {
      label: site?.name || "Work site",
      mapsQuery: site?.name || "work",
    };
  }

  if (emp?.home_latitude != null && emp?.home_longitude != null) {
    return {
      label: emp.home_address || "Home",
      mapsQuery: `${emp.home_latitude},${emp.home_longitude}`,
    };
  }
  if (emp?.home_address) {
    return { label: "Home", mapsQuery: emp.home_address };
  }
  const site = emp?.sites;
  if (site?.latitude != null && site?.longitude != null) {
    return {
      label: site.name || "Pickup",
      mapsQuery: `${site.latitude},${site.longitude}`,
    };
  }
  if (site?.address) {
    return { label: site.name || "Pickup", mapsQuery: site.address };
  }
  return { label: "Pickup", mapsQuery: emp?.full_name || "pickup" };
}

export function mapsDirectionsUrl(query: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
