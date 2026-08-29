import { isAppModule, type AppModule } from "@/lib/entitlements";
import type { Plan, PlanWithModules } from "@/types";

export const RECOMMENDED_PLAN_CODE = "growth";

export const MODULE_LABELS: Record<AppModule, string> = {
  core: "Operations core",
  gps: "Live GPS & dispatch",
  attendance: "QR boarding",
  billing: "Invoicing",
  payroll: "Payroll",
  reports: "Reports",
  portal: "Company portal",
  white_label: "White-label branding",
  sso: "Single sign-on",
  integrations: "Accounting integrations",
  ai: "AI exceptions",
};

const MODULE_ORDER: readonly AppModule[] = [
  "core",
  "gps",
  "attendance",
  "billing",
  "payroll",
  "reports",
  "portal",
  "white_label",
  "sso",
  "integrations",
  "ai",
];

/** Format cents as R1,990-style ZAR. Whole rands drop decimals. */
export function formatZarFromCents(
  cents: number | null | undefined
): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const rands = cents / 100;
  const negative = rands < 0;
  const abs = Math.abs(rands);
  const whole = Math.trunc(abs);
  const fraction = Math.round((abs - whole) * 100);
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = fraction === 0 ? "" : `.${fraction.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}R${grouped}${decimals}`;
}

export function labelForModule(moduleKey: string): string {
  if (isAppModule(moduleKey)) return MODULE_LABELS[moduleKey];
  return moduleKey
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sortModuleKeys(keys: readonly string[]): AppModule[] {
  const unique = [...new Set(keys.filter(isAppModule))];
  return unique.sort(
    (a, b) => MODULE_ORDER.indexOf(a) - MODULE_ORDER.indexOf(b)
  );
}

export function isRecommendedPlan(code: string | null | undefined): boolean {
  return code === RECOMMENDED_PLAN_CODE;
}

export type PlanRowWithEntitlements = Plan & {
  module_entitlements?: { module_key: string }[] | null;
};

export function mapPlanWithModules(
  row: PlanRowWithEntitlements
): PlanWithModules {
  const { module_entitlements, ...plan } = row;
  return {
    ...plan,
    module_keys: sortModuleKeys(
      (module_entitlements ?? []).map((item) => item.module_key)
    ),
  };
}

export function vehicleAllowanceCopy(plan: Pick<
  Plan,
  "included_vehicles" | "extra_vehicle_cents" | "max_vehicles"
>): string {
  const parts: string[] = [];
  if (plan.included_vehicles != null) {
    parts.push(`${plan.included_vehicles} vehicles included`);
  }
  if (plan.extra_vehicle_cents != null) {
    parts.push(`${formatZarFromCents(plan.extra_vehicle_cents)} per extra vehicle`);
  }
  if (plan.max_vehicles != null) {
    parts.push(`cap ${plan.max_vehicles}`);
  }
  return parts.join(" · ");
}

export function vehicleSoftCapCopy(input: {
  vehicleCount: number;
  includedVehicles: number | null;
  extraVehicleCents: number | null;
  maxVehicles: number | null;
}): string | null {
  const { vehicleCount, includedVehicles, extraVehicleCents, maxVehicles } =
    input;
  if (includedVehicles == null && maxVehicles == null) return null;

  const extraPrice = formatZarFromCents(extraVehicleCents);

  if (maxVehicles != null && vehicleCount >= maxVehicles) {
    return `You're at the ${maxVehicles}-vehicle cap. Extra vehicles need a higher plan — we'll nudge you before adding more.`;
  }

  if (includedVehicles != null && vehicleCount > includedVehicles) {
    const over = vehicleCount - includedVehicles;
    const extras =
      extraVehicleCents != null
        ? ` Extra vehicles are billed at ${extraPrice} each.`
        : "";
    const cap =
      maxVehicles != null ? ` Soft cap is ${maxVehicles} vehicles.` : "";
    return `You're using ${vehicleCount} vehicles — ${over} over the included ${includedVehicles}.${extras}${cap}`;
  }

  if (includedVehicles != null) {
    const extras =
      extraVehicleCents != null ? ` Extra vehicles are ${extraPrice} each` : "";
    const cap = maxVehicles != null ? ` up to ${maxVehicles}` : "";
    const suffix =
      extras && cap ? `${extras},${cap}.` : extras ? `${extras}.` : cap ? `${cap}.` : "";
    return `You're using ${vehicleCount} of ${includedVehicles} included vehicles.${suffix}`;
  }

  return `You're using ${vehicleCount} vehicles of a ${maxVehicles}-vehicle cap.`;
}
