"use server";

import { hasSupabaseConfig } from "@/lib/env";
import {
  DEMO_AREAS,
  DEMO_COMPANIES,
  DEMO_VEHICLES,
} from "@/lib/trips/demo-store";
import { DEFAULT_AREA_NAMES } from "@/lib/trips/constants";
import { createClient } from "@/supabase/server";
import type { Area, Company, Vehicle } from "@/types/database";

export interface TripLookupOptions {
  companies: Pick<Company, "id" | "company_name">[];
  vehicles: Pick<Vehicle, "id" | "registration" | "make" | "model">[];
  areas: string[];
}

export async function getTripLookupOptions(): Promise<TripLookupOptions> {
  if (!hasSupabaseConfig()) {
    return {
      companies: DEMO_COMPANIES.map(({ id, company_name }) => ({
        id,
        company_name,
      })),
      vehicles: DEMO_VEHICLES.map(({ id, registration, make, model }) => ({
        id,
        registration,
        make,
        model,
      })),
      areas: DEMO_AREAS.map((area) => area.name),
    };
  }

  const supabase = await createClient();

  const [companiesResult, vehiclesResult, areasResult] = await Promise.all([
    // Safe directory RPC — no billing fields exposed to drivers.
    supabase.rpc("list_active_companies" as never),
    supabase
      .from("vehicles")
      .select("id, registration, make, model")
      .eq("active", true)
      .order("registration"),
    supabase
      .from("areas")
      .select("name")
      .eq("active", true)
      .order("name"),
  ]);

  const areas =
    areasResult.data && areasResult.data.length > 0
      ? areasResult.data.map((row: Pick<Area, "name">) => row.name)
      : [...DEFAULT_AREA_NAMES];

  const companies = (companiesResult.data ?? []) as {
    id: string;
    company_name: string;
  }[];

  return {
    companies,
    vehicles: vehiclesResult.data ?? [],
    areas,
  };
}

