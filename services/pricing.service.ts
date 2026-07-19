"use server";

import { revalidatePath } from "next/cache";

import type {
  PricePreviewValues,
  PricingRuleFormValues,
} from "@/features/pricing/schemas";
import { ROUTES } from "@/lib/constants";
import {
  DEMO_AREAS,
  DEMO_COMPANIES,
  DEMO_VEHICLES,
} from "@/lib/demo/catalog";
import { hasSupabaseConfig } from "@/lib/env";
import {
  getCachedPricingRules,
  invalidatePricingCache,
  setCachedPricingRules,
} from "@/lib/pricing/cache";
import {
  calculateDemoTripPrice,
  createDemoPricingRule,
  getDemoPricingRule,
  listDemoPricingRules,
  softDeleteDemoPricingRule,
  updateDemoPricingRule,
} from "@/lib/pricing/demo-store";
import { formatRuleLabel, matchPricingRule } from "@/lib/pricing/engine";
import { createClient } from "@/supabase/server";
import type {
  Area,
  PricingRule,
  PricingRuleWithDetails,
  TablesInsert,
  TablesUpdate,
} from "@/types/database";
import {
  getDemoAdminSessionContext,
  getSessionContext,
} from "@/services/profile.service";

export type PricingActionResult =
  | { success: true; ruleId: string; message?: string }
  | { success: false; error: string };

export interface PricePreviewResult {
  matchedRuleId: string | null;
  matchedRuleLabel: string;
  calculatedPrice: number | null;
  reason: string;
  pricingStatus: "calculated" | "needs_pricing";
}

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
    return { ok: false, error: "Only admins can manage pricing." };
  }
  return { ok: true, userId: session.userId };
}

function toNumber(value: unknown): number {
  return Number(value);
}

function enrichRule(
  rule: PricingRule,
  lookup: {
    companies: Map<string, string>;
    areas: Map<string, string>;
    vehicles: Map<string, string>;
  }
): PricingRuleWithDetails {
  return {
    ...rule,
    price: toNumber(rule.price),
    areas_visited: rule.areas_visited ?? [],
    company_name: lookup.companies.get(rule.company_id) ?? "Unknown company",
    pickup_area_name: lookup.areas.get(rule.pickup_area_id) ?? "Unknown",
    destination_area_name:
      lookup.areas.get(rule.destination_area_id) ?? "Unknown",
    areas_visited_names: (rule.areas_visited ?? []).map(
      (id) => lookup.areas.get(id) ?? "Unknown"
    ),
    vehicle_label: rule.vehicle_id
      ? (lookup.vehicles.get(rule.vehicle_id) ?? "Unknown vehicle")
      : "Any vehicle",
  };
}

async function loadLookupMaps(): Promise<{
  companies: Map<string, string>;
  areas: Map<string, string>;
  vehicles: Map<string, string>;
}> {
  if (!hasSupabaseConfig()) {
    return {
      companies: new Map(DEMO_COMPANIES.map((c) => [c.id, c.company_name])),
      areas: new Map(DEMO_AREAS.map((a) => [a.id, a.name])),
      vehicles: new Map(
        DEMO_VEHICLES.map((v) => [
          v.id,
          `${v.registration} · ${v.make} ${v.model}`,
        ])
      ),
    };
  }

  const supabase = await createClient();
  const [companies, areas, vehicles] = await Promise.all([
    supabase.from("companies").select("id, company_name"),
    supabase.from("areas").select("id, name"),
    supabase.from("vehicles").select("id, registration, make, model"),
  ]);

  return {
    companies: new Map(
      (companies.data ?? []).map((c: { id: string; company_name: string }) => [
        c.id,
        c.company_name,
      ])
    ),
    areas: new Map(
      (areas.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name])
    ),
    vehicles: new Map(
      (vehicles.data ?? []).map(
        (v: {
          id: string;
          registration: string;
          make: string;
          model: string;
        }) => [v.id, `${v.registration} · ${v.make} ${v.model}`]
      )
    ),
  };
}

export async function listPricingRules(): Promise<PricingRuleWithDetails[]> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return [];

  if (!hasSupabaseConfig()) {
    return listDemoPricingRules();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("*")
    .order("priority", { ascending: false });

  if (error) {
    console.error("listPricingRules:", error.message);
    return [];
  }

  const lookup = await loadLookupMaps();
  return ((data ?? []) as PricingRule[]).map((rule) => enrichRule(rule, lookup));
}

export async function getPricingRule(
  id: string
): Promise<PricingRuleWithDetails | null> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return null;

  if (!hasSupabaseConfig()) {
    return getDemoPricingRule(id);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const lookup = await loadLookupMaps();
  return enrichRule(data as PricingRule, lookup);
}

function formToPayload(
  values: PricingRuleFormValues
): TablesInsert<"pricing_rules"> {
  return {
    company_id: values.companyId,
    pickup_area_id: values.pickupAreaId,
    destination_area_id: values.destinationAreaId,
    areas_visited: values.areasVisited ?? [],
    minimum_passengers: values.minimumPassengers,
    maximum_passengers: values.maximumPassengers,
    vehicle_id: values.vehicleId ? values.vehicleId : null,
    price: values.price,
    priority: values.priority,
    active: values.active,
    rule_name: values.ruleName?.trim() || "",
  };
}

export async function createPricingRule(
  values: PricingRuleFormValues
): Promise<PricingActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const payload = formToPayload(values);

  if (!hasSupabaseConfig()) {
    const rule = createDemoPricingRule({
      ...payload,
      rule_name: payload.rule_name ?? "",
      areas_visited: payload.areas_visited ?? [],
      vehicle_id: payload.vehicle_id ?? null,
      priority: payload.priority ?? 0,
      active: payload.active ?? true,
    } as Omit<PricingRule, "id" | "created_at" | "updated_at">);
    invalidatePricingCache(values.companyId);
    revalidatePath(ROUTES.pricingRules);
    return { success: true, ruleId: rule.id, message: "Pricing rule created" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_rules")
    .insert(payload as never)
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create rule" };
  }

  invalidatePricingCache(values.companyId);
  revalidatePath(ROUTES.pricingRules);
  return {
    success: true,
    ruleId: (data as { id: string }).id,
    message: "Pricing rule created",
  };
}

export async function updatePricingRule(
  id: string,
  values: PricingRuleFormValues
): Promise<PricingActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const payload: TablesUpdate<"pricing_rules"> = formToPayload(values);

  if (!hasSupabaseConfig()) {
    const rule = updateDemoPricingRule(id, {
      ...payload,
      rule_name: payload.rule_name ?? "",
      areas_visited: payload.areas_visited ?? [],
      vehicle_id: payload.vehicle_id ?? null,
      priority: payload.priority ?? 0,
      active: payload.active ?? true,
    });
    if (!rule) return { success: false, error: "Rule not found." };
    invalidatePricingCache(values.companyId);
    revalidatePath(ROUTES.pricingRules);
    return { success: true, ruleId: rule.id, message: "Pricing rule updated" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pricing_rules")
    .update(payload as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidatePricingCache(values.companyId);
  revalidatePath(ROUTES.pricingRules);
  return { success: true, ruleId: id, message: "Pricing rule updated" };
}

/** Soft delete — never permanently remove pricing. */
export async function deletePricingRule(
  id: string
): Promise<PricingActionResult> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return { success: false, error: ctx.error };

  if (!hasSupabaseConfig()) {
    const rule = softDeleteDemoPricingRule(id);
    if (!rule) return { success: false, error: "Rule not found." };
    invalidatePricingCache(rule.company_id);
    revalidatePath(ROUTES.pricingRules);
    return { success: true, ruleId: id, message: "Pricing rule deactivated" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("pricing_rules")
    .select("company_id")
    .eq("id", id)
    .maybeSingle<{ company_id: string }>();

  const { error } = await supabase
    .from("pricing_rules")
    .update({ active: false } as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  if (existing?.company_id) {
    invalidatePricingCache(existing.company_id);
  }
  revalidatePath(ROUTES.pricingRules);
  return { success: true, ruleId: id, message: "Pricing rule deactivated" };
}

async function loadActiveRulesForCompany(
  companyId: string
): Promise<PricingRule[]> {
  const cached = getCachedPricingRules(companyId);
  if (cached) {
    return cached.map((r) => ({
      ...r,
      rule_name: "",
      created_at: r.updated_at ?? "",
      updated_at: r.updated_at ?? "",
    })) as PricingRule[];
  }

  if (!hasSupabaseConfig()) {
    const rules = listDemoPricingRules().filter(
      (r) => r.company_id === companyId && r.active
    );
    setCachedPricingRules(
      companyId,
      rules.map((r) => ({
        id: r.id,
        company_id: r.company_id,
        pickup_area_id: r.pickup_area_id,
        destination_area_id: r.destination_area_id,
        areas_visited: r.areas_visited,
        minimum_passengers: r.minimum_passengers,
        maximum_passengers: r.maximum_passengers,
        vehicle_id: r.vehicle_id,
        price: r.price,
        priority: r.priority,
        active: r.active,
        updated_at: r.updated_at,
      }))
    );
    return rules;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true);

  if (error) {
    console.error("loadActiveRulesForCompany:", error.message);
    return [];
  }

  const rules = (data ?? []) as PricingRule[];
  setCachedPricingRules(
    companyId,
    rules.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      pickup_area_id: r.pickup_area_id,
      destination_area_id: r.destination_area_id,
      areas_visited: r.areas_visited ?? [],
      minimum_passengers: r.minimum_passengers,
      maximum_passengers: r.maximum_passengers,
      vehicle_id: r.vehicle_id,
      price: toNumber(r.price),
      priority: r.priority,
      active: r.active,
      updated_at: r.updated_at,
    }))
  );
  return rules;
}

export async function previewTripPrice(
  values: PricePreviewValues
): Promise<PricePreviewResult> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) {
    return {
      matchedRuleId: null,
      matchedRuleLabel: "—",
      calculatedPrice: null,
      reason: ctx.error,
      pricingStatus: "needs_pricing",
    };
  }

  if (!hasSupabaseConfig()) {
    const result = calculateDemoTripPrice({
      companyId: values.companyId,
      pickupArea: values.pickupArea,
      destinationArea: values.destinationArea,
      areasVisited: values.areasVisited,
      passengers: values.passengers,
      vehicleId: values.vehicleId,
    });
    return {
      matchedRuleId: result.pricing_rule_id,
      matchedRuleLabel: formatRuleLabel(result.pricing_rule_id),
      calculatedPrice: result.calculated_price,
      reason: result.reason,
      pricingStatus:
        result.pricing_status === "calculated" ? "calculated" : "needs_pricing",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "preview_trip_price" as never,
    {
      p_company_id: values.companyId,
      p_pickup_area_name: values.pickupArea,
      p_destination_area_name: values.destinationArea,
      p_areas_visited: values.areasVisited,
      p_passengers: values.passengers,
      p_vehicle_id: values.vehicleId,
    } as never
  );

  if (error) {
    // Fallback to in-process matcher if RPC unavailable
    return previewTripPriceLocal(values);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      matchedRuleId: null,
      matchedRuleLabel: "—",
      calculatedPrice: null,
      reason: "No matching pricing rule",
      pricingStatus: "needs_pricing",
    };
  }

  const typed = row as {
    matched_rule_id: string | null;
    calculated_price: number | null;
    reason: string;
    pricing_status: "calculated" | "needs_pricing";
  };

  return {
    matchedRuleId: typed.matched_rule_id,
    matchedRuleLabel: formatRuleLabel(typed.matched_rule_id),
    calculatedPrice:
      typed.calculated_price === null ? null : toNumber(typed.calculated_price),
    reason: typed.reason,
    pricingStatus: typed.pricing_status,
  };
}

async function previewTripPriceLocal(
  values: PricePreviewValues
): Promise<PricePreviewResult> {
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("id, name")
    .eq("active", true);

  const areaList = (areas ?? []) as Pick<Area, "id" | "name">[];
  const byName = new Map(
    areaList.map((a) => [a.name.toLowerCase(), a.id] as const)
  );

  const pickupAreaId = byName.get(values.pickupArea.toLowerCase());
  const destinationAreaId = byName.get(values.destinationArea.toLowerCase());
  if (!pickupAreaId || !destinationAreaId) {
    return {
      matchedRuleId: null,
      matchedRuleLabel: "—",
      calculatedPrice: null,
      reason: "Pickup or destination area could not be resolved",
      pricingStatus: "needs_pricing",
    };
  }

  const rules = await loadActiveRulesForCompany(values.companyId);
  const result = matchPricingRule(
    rules.map((r) => ({
      ...r,
      price: toNumber(r.price),
      areas_visited: r.areas_visited ?? [],
    })),
    {
      companyId: values.companyId,
      pickupAreaId,
      destinationAreaId,
      areasVisitedIds: values.areasVisited
        .map((name) => byName.get(name.toLowerCase()))
        .filter((id): id is string => Boolean(id)),
      passengers: values.passengers,
      vehicleId: values.vehicleId,
    }
  );

  return {
    matchedRuleId: result.rule?.id ?? null,
    matchedRuleLabel: formatRuleLabel(result.rule?.id),
    calculatedPrice: result.price,
    reason: result.reason,
    pricingStatus: result.pricingStatus,
  };
}

export async function getPricingLookupOptions(): Promise<{
  companies: { id: string; company_name: string }[];
  areas: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  areaNames: string[];
}> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) {
    return { companies: [], areas: [], vehicles: [], areaNames: [] };
  }

  if (!hasSupabaseConfig()) {
    return {
      companies: DEMO_COMPANIES.filter((c) => c.active).map((c) => ({
        id: c.id,
        company_name: c.company_name,
      })),
      areas: DEMO_AREAS.filter((a) => a.active).map((a) => ({
        id: a.id,
        name: a.name,
      })),
      vehicles: DEMO_VEHICLES.filter((v) => v.active).map((v) => ({
        id: v.id,
        label: `${v.registration} · ${v.make} ${v.model}`,
      })),
      areaNames: DEMO_AREAS.filter((a) => a.active).map((a) => a.name),
    };
  }

  const supabase = await createClient();
  const [companies, areas, vehicles] = await Promise.all([
    supabase
      .from("companies")
      .select("id, company_name")
      .eq("active", true)
      .order("company_name"),
    supabase
      .from("areas")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("vehicles")
      .select("id, registration, make, model")
      .eq("active", true)
      .order("registration"),
  ]);

  return {
    companies: (companies.data ?? []) as {
      id: string;
      company_name: string;
    }[],
    areas: (areas.data ?? []) as { id: string; name: string }[],
    vehicles: (
      (vehicles.data ?? []) as {
        id: string;
        registration: string;
        make: string;
        model: string;
      }[]
    ).map((v) => ({
      id: v.id,
      label: `${v.registration} · ${v.make} ${v.model}`,
    })),
    areaNames: ((areas.data ?? []) as { name: string }[]).map((a) => a.name),
  };
}
