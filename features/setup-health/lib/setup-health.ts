import { resolveBillToCompanyId } from "@/lib/billing/bill-to-company";

export type HealthCompany = {
  id: string;
  name: string;
  status: string;
  created_at?: string | null;
  deleted_at?: string | null;
};
export type HealthRateCard = {
  company_id: string | null;
  line_type: string;
  unit_amount: number | string;
  effective_from: string;
  effective_to: string | null;
};
export type HealthDriver = { id: string; full_name: string; status: string };
export type HealthTrip = { id: string; company_id: string | null; planned_start: string };
export type HealthInvoice = { total: number | string };

export type SetupHealthInput = {
  settings: { invoice_bill_to_company_id?: unknown } | null | undefined;
  companies: HealthCompany[];
  rateCards: HealthRateCard[];
  drivers: HealthDriver[];
  driversWithVehicle: Set<string>;
  /** Completed, non-deleted trips with no invoice line. */
  unbilledTrips: HealthTrip[];
  draftInvoices: HealthInvoice[];
  /** YYYY-MM-DD in SAST. */
  today: string;
};

export type ChecklistItem = {
  id: "bill_to" | "company_rates" | "driver_vehicles";
  label: string;
  done: boolean;
  detail: string;
  href: string;
  missing: string[];
};

export type SetupHealth = {
  billTo: { companyId: string; name: string; explicit: boolean } | null;
  checklist: ChecklistItem[];
  unbilled: { count: number; value: number; unpriced: number };
  drafts: { count: number; total: number };
};

const num = (v: number | string) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Trip rate card for a company covering a date, latest effective_from wins. */
export function tripRateOn(
  cards: readonly HealthRateCard[],
  companyId: string,
  date: string
): number | null {
  const hit = cards
    .filter(
      (c) =>
        c.company_id === companyId &&
        c.line_type === "trip" &&
        c.effective_from <= date &&
        (c.effective_to === null || c.effective_to >= date)
    )
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  return hit ? num(hit.unit_amount) : null;
}

/** SAST calendar date of a timestamp. */
export function sastDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function computeSetupHealth(input: SetupHealthInput): SetupHealth {
  const companies = input.companies.filter((c) => !c.deleted_at);
  const active = companies.filter((c) => c.status === "active");

  const billToId = resolveBillToCompanyId(companies, input.settings);
  const billToCo = billToId ? companies.find((c) => c.id === billToId) : undefined;
  const explicitRaw = input.settings?.invoice_bill_to_company_id;
  const billTo = billToCo
    ? {
        companyId: billToCo.id,
        name: billToCo.name,
        explicit: typeof explicitRaw === "string" && explicitRaw.trim() === billToCo.id,
      }
    : null;

  // The bill-to company is the invoice recipient, not a trip customer.
  const customers = active.filter((c) => c.id !== billToId);
  const unrated = customers.filter((c) => tripRateOn(input.rateCards, c.id, input.today) === null);

  const activeDrivers = input.drivers.filter((d) => d.status === "active");
  const noVehicle = activeDrivers.filter((d) => !input.driversWithVehicle.has(d.id));

  const checklist: ChecklistItem[] = [
    {
      id: "bill_to",
      label: "Invoice bill-to company set",
      done: Boolean(billTo?.explicit),
      detail: billTo
        ? billTo.explicit
          ? `Billing to ${billTo.name}`
          : `Using the default (${billTo.name}). Confirm it in Settings.`
        : "Not set. Completed trips can't be invoiced.",
      href: "/settings#invoice-bill-to-card",
      missing: [],
    },
    {
      id: "company_rates",
      label: "Active companies have a current trip rate",
      done: customers.length > 0 && unrated.length === 0,
      detail:
        customers.length === 0
          ? "No active companies yet"
          : unrated.length === 0
            ? `All ${plural(customers.length, "company", "companies")} priced`
            : `${plural(unrated.length, "company", "companies")} without a current rate`,
      href: "/rate-cards",
      missing: unrated.map((c) => c.name),
    },
    {
      id: "driver_vehicles",
      label: "Active drivers have a vehicle",
      done: activeDrivers.length > 0 && noVehicle.length === 0,
      detail:
        activeDrivers.length === 0
          ? "No active drivers yet"
          : noVehicle.length === 0
            ? `All ${plural(activeDrivers.length, "driver")} assigned`
            : `${plural(noVehicle.length, "driver")} without a vehicle`,
      href: "/drivers",
      missing: noVehicle.map((d) => d.full_name),
    },
  ];

  let value = 0;
  let unpriced = 0;
  for (const t of input.unbilledTrips) {
    const rate = t.company_id ? tripRateOn(input.rateCards, t.company_id, sastDate(t.planned_start)) : null;
    if (rate === null) unpriced += 1;
    else value += rate;
  }

  return {
    billTo,
    checklist,
    unbilled: { count: input.unbilledTrips.length, value, unpriced },
    drafts: {
      count: input.draftInvoices.length,
      total: input.draftInvoices.reduce((s, i) => s + num(i.total), 0),
    },
  };
}
