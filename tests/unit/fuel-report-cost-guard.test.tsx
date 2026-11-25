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
      ? { ...FILLUP, unit_price: 25, total_amount: 1000, currency: "ZAR" }
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
      "id", "filled_at", "vehicle", "company", "driver", "odometer_km", "litres", "owner",
    ]);
    expect(csv.headers).not.toContain("total_amount");
    expect(csv.headers).not.toContain("currency");
    for (const row of csv.rows) {
      expect(row).not.toHaveProperty("total_amount");
      expect(row).not.toHaveProperty("currency");
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
    expect(screen.getByText("ZAR 1000")).toBeInTheDocument();
  });
});
