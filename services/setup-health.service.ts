import { createClient } from "@/lib/supabase/client";
import type { HealthTrip } from "@/features/setup-health/lib/setup-health";

const PAGE = 1000;

/** Page through a PostgREST query (default max-rows is 1000). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** All reads go through the user's session, so RLS decides what is visible. */
export async function loadSetupHealthData(organisationId: string) {
  const supabase = createClient();

  const [org, companies, rateCards, drivers, assignments, completedTrips, billedTripIds, draftInvoices] =
    await Promise.all([
      supabase.from("organisations").select("settings").eq("id", organisationId).maybeSingle(),
      fetchAll<{ id: string; name: string; status: string; created_at: string; deleted_at: string | null }>((a, b) =>
        supabase.from("companies").select("id, name, status, created_at, deleted_at")
          .eq("organisation_id", organisationId).is("deleted_at", null).order("id").range(a, b)
      ),
      fetchAll<{ company_id: string | null; line_type: string; unit_amount: number; effective_from: string; effective_to: string | null }>((a, b) =>
        supabase.from("rate_cards").select("company_id, line_type, unit_amount, effective_from, effective_to")
          .eq("organisation_id", organisationId).is("deleted_at", null).order("id").range(a, b)
      ),
      fetchAll<{ id: string; full_name: string; status: string }>((a, b) =>
        supabase.from("drivers").select("id, full_name, status")
          .eq("organisation_id", organisationId).is("deleted_at", null).order("id").range(a, b)
      ),
      fetchAll<{ driver_id: string }>((a, b) =>
        supabase.from("driver_vehicle_assignments").select("driver_id")
          .eq("organisation_id", organisationId).is("deleted_at", null).is("ends_on", null).order("id").range(a, b)
      ),
      fetchAll<HealthTrip>((a, b) =>
        supabase.from("trips").select("id, company_id, planned_start")
          .eq("organisation_id", organisationId).eq("status", "completed").is("deleted_at", null).order("id").range(a, b)
      ),
      fetchAll<{ trip_id: string }>((a, b) =>
        supabase.from("invoice_lines").select("trip_id")
          .eq("organisation_id", organisationId).not("trip_id", "is", null).order("id").range(a, b)
      ),
      fetchAll<{ total: number }>((a, b) =>
        supabase.from("invoices").select("total")
          .eq("organisation_id", organisationId).eq("status", "draft").is("deleted_at", null).order("id").range(a, b)
      ),
    ]);

  if (org.error) throw org.error;
  const billed = new Set(billedTripIds.map((r) => r.trip_id));
  return {
    settings: (org.data?.settings ?? null) as { invoice_bill_to_company_id?: unknown } | null,
    companies,
    rateCards,
    drivers,
    driversWithVehicle: new Set(assignments.map((r) => r.driver_id)),
    unbilledTrips: completedTrips.filter((t) => !billed.has(t.id)),
    draftInvoices,
  };
}
