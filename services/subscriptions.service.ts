import { createClient } from "@/lib/supabase/client";
import {
  ALL_MODULES,
  isAppModule,
  type AppModule,
} from "@/lib/entitlements";
import { mapPlanWithModules } from "@/lib/plans";
import type { Plan, PlanWithModules, Subscription } from "@/types";

export async function listPlans(): Promise<Plan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Plan[];
}

export async function listPlansWithEntitlements(): Promise<PlanWithModules[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*, module_entitlements(module_key)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: Parameters<typeof mapPlanWithModules>[0]) =>
    mapPlanWithModules(row)
  );
}

export async function countOrganisationVehicles(
  organisationId: string
): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function listAllPlans(): Promise<Plan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Plan[];
}

export async function getOrganisationSubscription(
  organisationId: string
): Promise<(Subscription & { plans?: Plan | null }) | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (error) throw error;
  return data as (Subscription & { plans?: Plan | null }) | null;
}

export async function listSubscriptions(): Promise<
  (Subscription & {
    organisations?: { id: string; name: string; slug: string } | null;
    plans?: Plan | null;
  })[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "*, organisations:organisation_id (id, name, slug), plans:plan_id (*)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as (Subscription & {
    organisations?: { id: string; name: string; slug: string } | null;
    plans?: Plan | null;
  })[];
}

export async function assignOrganisationPlan(
  organisationId: string,
  planId: string,
  status: Subscription["status"] = "active"
): Promise<Subscription> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        organisation_id: organisationId,
        plan_id: planId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as Subscription;
}

export async function listEntitledModules(
  organisationId: string
): Promise<AppModule[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("org_entitled_modules", {
    p_organisation_id: organisationId,
  });
  if (error) {
    // Before migration applied: fail open so ops UI stays usable.
    console.warn("org_entitled_modules unavailable", error.message);
    return ALL_MODULES;
  }
  const raw = (data ?? []) as string[];
  const modules = raw.filter(isAppModule);
  return modules.length ? modules : ALL_MODULES;
}
