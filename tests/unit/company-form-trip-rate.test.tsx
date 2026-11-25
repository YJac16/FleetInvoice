/**
 * Demo QA6 / 00085: the company form shows, loads and sends the default trip
 * rate only with rate_cards:manage (admin/manager). Dispatcher can still edit
 * the company itself; apply_company_trip_rate refuses them in the DB anyway.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasPermission } from "@/lib/permissions";
import type { Company } from "@/types";

vi.mock("@/components/layout/org-context", () => ({ useOrg: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-active-org-id", () => ({ useActiveOrgId: () => "org-1" }));
vi.mock("@/services/companies.service", async (orig) => ({
  ...(await orig<typeof import("@/services/companies.service")>()),
  listCompanyTripRateCards: vi.fn(async () => [
    { id: "rc-1", company_id: "c-1", unit_amount: 300, effective_from: "2026-01-01", line_type: "trip", deleted_at: null },
  ]),
  getEarliestUnbilledTripDate: vi.fn(async () => "2026-02-01"),
}));

import { CompanyForm } from "@/features/companies/components/companies-page";
import { getEarliestUnbilledTripDate, listCompanyTripRateCards } from "@/services/companies.service";

const company = { id: "c-1", organisation_id: "org-1", name: "Acme", status: "active" } as Company;

function renderForm(canSetTripRate: boolean, onSubmit = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompanyForm
        organisationId="org-1"
        initial={company}
        onSubmit={onSubmit}
        submitting={false}
        canSetTripRate={canSetTripRate}
      />
    </QueryClientProvider>
  );
  return onSubmit;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("CompanyForm trip rate", () => {
  it("is gated on rate_cards:manage, which only admin/manager hold", () => {
    expect(hasPermission("organisation_admin", "rate_cards:manage")).toBe(true);
    expect(hasPermission("manager", "rate_cards:manage")).toBe(true);
    expect(hasPermission("dispatcher", "rate_cards:manage")).toBe(false);
    expect(hasPermission("dispatcher", "companies:manage")).toBe(true);
  });

  it("dispatcher: no trip rate section, no rate queries, tripRate null on save", async () => {
    const onSubmit = renderForm(false);
    expect(screen.queryByTestId("company-trip-rate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Trip rate (ZAR)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ company: { name: "Acme" }, tripRate: null });
    expect(listCompanyTripRateCards).not.toHaveBeenCalled();
    expect(getEarliestUnbilledTripDate).not.toHaveBeenCalled();
  });

  it("manager: section shown, current rate loaded, a changed rate is sent", async () => {
    const onSubmit = renderForm(true);
    expect(screen.getByTestId("company-trip-rate")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Trip rate (ZAR)")).toHaveValue(300));
    fireEvent.change(screen.getByLabelText("Trip rate (ZAR)"), { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0].tripRate).toMatchObject({ unitAmount: 350 });
    expect(listCompanyTripRateCards).toHaveBeenCalledWith("org-1", "c-1");
  });
});
