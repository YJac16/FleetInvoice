import { readFileSync } from "node:fs";
import path from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasPermission } from "@/lib/permissions";
import type { AppRole } from "@/lib/constants";

let role: AppRole = "driver";
vi.mock("@/components/layout/org-context", () => ({
  useOrg: () => ({ can: (p: string) => hasPermission(role, p as never) }),
}));
vi.mock("@/hooks/use-active-org-id", () => ({ useActiveOrgId: () => "org-1" }));
vi.mock("@/hooks/use-entity-options", () => ({ useEntityOptions: () => ({ companies: [] }) }));
vi.mock("@/services/vehicles.service", () => ({ listVehicles: vi.fn(async () => []) }));
vi.mock("@/services/trip-assignments.service", () => ({ listMyDriverTrips: vi.fn(async () => []) }));
vi.mock("@/services/fuel-fillups.service", () => ({ listFuelFillups: vi.fn(async () => []), logFuelFillup: vi.fn() }));
vi.mock("@/services/fuel-prices.service", () => ({ listFuelPrices: vi.fn(async () => []) }));

import { DriverFuelPage } from "@/features/fuel/components/driver-fuel-page";
import { LogFuelForm, fuelSavedMessage } from "@/features/fuel/components/fuel-fillups-page";
import type { FuelFillup } from "@/types";

const root = path.resolve(__dirname, "../..");
const src = (p: string) => readFileSync(path.join(root, p), "utf8");

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
    }),
  });
});
afterEach(cleanup);

describe("driver fuel UI has no unit price", () => {
  it("DriverFuelPage: no Unit price field, requires Fuel type", () => {
    role = "driver";
    const { container } = wrap(<DriverFuelPage />);
    expect(screen.queryByText(/unit price/i)).not.toBeInTheDocument();
    expect(container.querySelector('[name="unit_price"]')).toBeNull();
    expect(screen.getByText("Fuel type")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bR\s?\d|ZAR/);
  });

  it.each(["dispatcher", "supervisor", "manager", "organisation_admin"] as const)(
    "LogFuelForm (%s): no Unit price field, Fuel type present",
    (r) => {
      role = r;
      const { container } = wrap(<LogFuelForm organisationId="org-1" onDone={() => undefined} showPrice />);
      expect(screen.queryByText(/unit price/i)).not.toBeInTheDocument();
      expect(container.querySelector('[name="unit_price"]')).toBeNull();
      expect(screen.getByText("Fuel type")).toBeInTheDocument();
    }
  );

  it("sources never send or collect a unit price", () => {
    for (const f of [
      "features/fuel/components/driver-fuel-page.tsx",
      "features/fuel/components/fuel-fillups-page.tsx",
      "features/fuel/schemas/fuel-fillup.ts",
      "services/fuel-fillups.service.ts",
    ]) {
      const s = src(f);
      expect(s, f).not.toMatch(/unit_price"|name="unit_price|unitPrice|p_unit_price|Unit price/);
    }
    expect(src("features/fuel/schemas/fuel-fillup.ts")).toMatch(/fuel_type: z\.string\(\)\.min\(1/);
  });

  it("after save: finance sees locked amount or Needs price; others see neither", () => {
    const base = { currency: "ZAR" } as FuelFillup;
    expect(fuelSavedMessage({ ...base, price_status: "priced", total_amount: 244.44 }, true)).toMatch(/locked at ZAR 244\.44/);
    expect(fuelSavedMessage({ ...base, price_status: "needs_price", total_amount: null }, true)).toMatch(/Needs price/);
    expect(fuelSavedMessage({ ...base, price_status: "priced", total_amount: 244.44 }, false)).toBe("Fuel fill-up logged");
  });
});
