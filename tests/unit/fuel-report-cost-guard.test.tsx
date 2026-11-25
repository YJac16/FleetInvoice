import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FuelResults } from "@/features/reports/components/reports-page";
import { FuelFillupsPage } from "@/features/fuel/components/fuel-fillups-page";
import { hasPermission } from "@/lib/permissions";
import type { AppRole } from "@/lib/constants";
import {
  buildOpsReport,
  reportToCsvRows,
  type FuelReport,
} from "@/services/reports.service";
import type { FuelFillup } from "@/types";

let role: AppRole = "dispatcher";

vi.mock("@/components/layout/org-context", () => ({
  useOrg: () => ({
    can: (p: string) => hasPermission(role, p as never),
  }),
}));
vi.mock("@/hooks/use-active-org-id", () => ({ useActiveOrgId: () => "org-1" }));
vi.mock("@/hooks/use-entity-options", () => ({
  useEntityOptions: () => ({ companies: [] }),
}));
vi.mock("@/services/vehicles.service", () => ({ listVehicles: vi.fn(async () => []) }));
vi.mock("@/services/fuel-fillups.service", () => ({
  listFuelFillups: vi.fn(),
  logFuelFillup: vi.fn(),
}));
vi.mock("@/services/fuel-prices.service", () => ({
  listFuelPrices: vi.fn(async () => []),
  confirmFuelPrices: vi.fn(),
  upsertOrgFuelPrice: vi.fn(),
  backfillUnpricedFuelFillups: vi.fn(),
}));

import { listFuelFillups } from "@/services/fuel-fillups.service";

const FILLUP: FuelFillup = {
  id: "f1",
  organisation_id: "org-1",
  vehicle_id: "v1",
  driver_id: "d1",
  company_id: "c1",
  filled_at: "2026-11-10T08:00:00Z",
  odometer_km: 12345.6,
  litres: 40,
  unit_price: null,
  total_amount: null,
  currency: null,
  station_name: null,
  notes: null,
  created_by: null,
  created_at: "2026-11-10T08:00:00Z",
  updated_at: "2026-11-10T08:00:00Z",
  deleted_at: null,
  vehicles: { id: "v1", name: "Van One", registration_number: "REG1" },
  companies: { id: "c1", name: "Acme Co" },
  drivers: { id: "d1", full_name: "Dana Driver" },
};

const PERIOD = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };

function fillupsFor(includeAmounts: boolean): FuelFillup[] {
  return [
    includeAmounts
      ? { ...FILLUP, unit_price: 25, total_amount: 1000, currency: "ZAR", price_status: "priced" }
      : FILLUP,
  ];
}

afterEach(cleanup);

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
  vi.mocked(listFuelFillups).mockReset();
  vi.mocked(listFuelFillups).mockImplementation(async (_org, opts) =>
    fillupsFor(Boolean(opts?.includeAmounts))
  );
});

async function report(includeFuelAmounts: boolean): Promise<FuelReport> {
  const r = await buildOpsReport("org-1", "fuel", PERIOD, { includeFuelAmounts });
  if (r.type !== "fuel") throw new Error("expected fuel report");
  return r;
}

describe("buildOpsReport fuel", () => {
  it("keeps ops fields and no money when amounts are off", async () => {
    const r = await report(false);
    expect(vi.mocked(listFuelFillups)).toHaveBeenCalledWith("org-1", { includeAmounts: false });
    expect(r.totalAmount).toBe(0);
    expect(r.rows[0]).toMatchObject({
      filled_at: FILLUP.filled_at,
      vehicle: "Van One",
      company: "Acme Co",
      driver: "Dana Driver",
      odometer_km: 12345.6,
      litres: 40,
      total_amount: null,
      currency: "",
    });
  });

  it("includes amounts when on", async () => {
    const r = await report(true);
    expect(r.totalAmount).toBe(1000);
    expect(r.rows[0]).toMatchObject({ total_amount: 1000, currency: "ZAR" });
  });
});

describe("reportToCsvRows fuel", () => {
  it.each(["dispatcher", "supervisor"] as const)("%s CSV has no money columns", async (r) => {
    const canViewFuelCost =
      hasPermission(r, "invoices:view") && hasPermission(r, "rate_cards:view");
    expect(canViewFuelCost).toBe(false);
    const csv = reportToCsvRows(await report(canViewFuelCost), {
      includeFuelAmounts: canViewFuelCost,
    });
    expect(csv.headers).toEqual([
      "id", "filled_at", "vehicle", "company", "driver", "fuel_type", "odometer_km", "litres", "owner",
    ]);
    expect(csv.headers).not.toContain("price_status");
    expect(csv.headers).not.toContain("total_amount");
    expect(csv.headers).not.toContain("currency");
    for (const row of csv.rows) {
      expect(row).not.toHaveProperty("total_amount");
      expect(row).not.toHaveProperty("currency");
      expect(row).not.toHaveProperty("price_status");
    }
  });

  it.each(["manager", "organisation_admin"] as const)("%s CSV keeps money columns", async (r) => {
    const can = hasPermission(r, "invoices:view") && hasPermission(r, "rate_cards:view");
    expect(can).toBe(true);
    const csv = reportToCsvRows(await report(can), { includeFuelAmounts: can });
    expect(csv.headers).toEqual(
      expect.arrayContaining(["driver", "odometer_km", "litres", "total_amount", "currency"])
    );
    expect(csv.rows[0]).toMatchObject({ total_amount: 1000, currency: "ZAR" });
  });

  it("defaults to no money columns", async () => {
    expect(reportToCsvRows(await report(true)).headers).not.toContain("total_amount");
  });
});

describe("FuelResults", () => {
  it("hides Amount and Total amount without showAmounts, keeps ops columns", async () => {
    const r = await report(false);
    const { container } = render(<FuelResults report={{ ...r, totalAmount: 999 }} showAmounts={false} />);
    for (const h of ["Filled at", "Vehicle", "Company", "Driver", "Odometer (km)", "Litres"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    expect(screen.queryByText("Amount")).not.toBeInTheDocument();
    expect(screen.queryByText(/Total amount/)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("999");
    expect(screen.getByText("Dana Driver")).toBeInTheDocument();
  });

  it("shows Amount and Total amount with showAmounts", async () => {
    render(<FuelResults report={await report(true)} showAmounts />);
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText(/Total amount: 1000\.00/)).toBeInTheDocument();
  });
});

describe("FuelFillupsPage", () => {
  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <FuelFillupsPage />
      </QueryClientProvider>
    );
  }

  it.each(["dispatcher", "supervisor"] as const)("%s: no Amount column, no amounts requested", async (r) => {
    role = r;
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Van One").length).toBeGreaterThan(0));
    expect(vi.mocked(listFuelFillups)).toHaveBeenCalledWith("org-1", { includeAmounts: false });
    expect(screen.queryByText("Amount")).not.toBeInTheDocument();
    expect(screen.getByText("Odometer (km)")).toBeInTheDocument();
    expect(screen.getByText("Litres")).toBeInTheDocument();
  });

  it.each(["manager", "organisation_admin"] as const)("%s: Amount column with amounts", async (r) => {
    role = r;
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Van One").length).toBeGreaterThan(0));
    expect(vi.mocked(listFuelFillups)).toHaveBeenCalledWith("org-1", { includeAmounts: true });
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("ZAR 1000.00")).toBeInTheDocument();
  });

  it.each(["manager", "organisation_admin"] as const)("%s: needs-price fill shows a badge and count, not R0", async (r) => {
    role = r;
    vi.mocked(listFuelFillups).mockImplementation(async () => [
      { ...FILLUP, unit_price: 25, total_amount: 1000, currency: "ZAR", price_status: "priced" },
      { ...FILLUP, id: "f2", vehicles: { id: "v2", name: "Van Two", registration_number: "REG2" }, price_status: "needs_price" },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Van Two").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Needs price").length).toBeGreaterThan(0);
    expect(screen.getByTestId("needs-price-count")).toHaveTextContent("Needs price: 1");
    expect(screen.getByText("Priced total: 1000.00")).toBeInTheDocument();
    expect(screen.queryByText("ZAR 0.00")).not.toBeInTheDocument();
    expect(screen.getByTestId("fuel-prices-panel")).toBeInTheDocument();
    expect(screen.getByTestId("vehicle-fuel-history")).toBeInTheDocument();
  });

  it.each(["dispatcher", "supervisor"] as const)("%s: no price panels, badges or counts", async (r) => {
    role = r;
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Van One").length).toBeGreaterThan(0));
    expect(screen.queryByText("Needs price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("needs-price-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fuel-prices-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vehicle-fuel-history")).not.toBeInTheDocument();
  });
});

describe("needs_price is not R0 in the fuel report", () => {
  beforeEach(() => {
    vi.mocked(listFuelFillups).mockImplementation(async (_org, opts) =>
      opts?.includeAmounts
        ? [
            { ...FILLUP, unit_price: 25, total_amount: 1000, currency: "ZAR", price_status: "priced" },
            { ...FILLUP, id: "f2", price_status: "needs_price" },
          ]
        : [FILLUP, { ...FILLUP, id: "f2" }]
    );
  });

  it("finance: total excludes unpriced, count reported, row amount stays null", async () => {
    const r = await report(true);
    expect(r.totalAmount).toBe(1000);
    expect(r.needsPriceCount).toBe(1);
    expect(r.rows.find((x) => x.id === "f2")).toMatchObject({ total_amount: null, price_status: "needs_price" });
    expect(r.ownerSplit.reduce((s, o) => s + (o.amount ?? 0), 0)).toBe(1000);
    const csv = reportToCsvRows(r, { includeFuelAmounts: true });
    expect(csv.headers).toContain("price_status");
    expect(csv.rows.find((x) => x.id === "f2")).toMatchObject({ total_amount: null, price_status: "needs_price" });
  });

  it("ops: no count, no status", async () => {
    const r = await report(false);
    expect(r.needsPriceCount).toBe(0);
    expect(r.rows.every((x) => x.price_status === "" && x.total_amount === null)).toBe(true);
  });

  it("FuelResults shows Needs price and the excluded count for finance only", async () => {
    const r = await report(true);
    const { unmount } = render(<FuelResults report={r} showAmounts />);
    expect(screen.getByText("Needs price")).toBeInTheDocument();
    expect(screen.getByText(/Needs price: 1 \(not in total\)/)).toBeInTheDocument();
    expect(screen.getByText(/Total amount: 1000\.00/)).toBeInTheDocument();
    unmount();
    render(<FuelResults report={await report(false)} showAmounts={false} />);
    expect(screen.queryByText(/Needs price/)).not.toBeInTheDocument();
  });
});
