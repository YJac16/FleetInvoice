import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyInvoicesPage } from "@/features/company/components/company-invoices-page";
import type { Invoice } from "@/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/layout/org-context", () => ({
  useOrg: () => ({ can: () => true }),
}));

vi.mock("@/hooks/use-active-org-id", () => ({
  useActiveOrgId: () => "org-1",
}));

vi.mock("@/services/invoices.service", () => ({
  listInvoices: vi.fn(),
}));

import { listInvoices } from "@/services/invoices.service";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CompanyInvoicesPage />
    </QueryClientProvider>
  );
}

describe("CompanyInvoicesPage", () => {
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
        dispatchEvent: () => false,
      }),
    });
    vi.mocked(listInvoices).mockResolvedValue([
      {
        id: "inv-client",
        driver_id: null,
        period_start: "2026-10-05",
        period_end: "2026-10-12",
        status: "issued",
        currency: "ZAR",
        total: 1500,
      },
      {
        id: "inv-driver",
        driver_id: "driver-1",
        period_start: "2026-09-01",
        period_end: "2026-09-08",
        status: "issued",
        currency: "ZAR",
        total: 9999,
      },
    ] as Invoice[]);
  });

  it("lists read-only non-driver invoices and hides manage controls", async () => {
    renderPage();
    expect(await screen.findByText("ZAR 1500")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Print" })).toHaveAttribute(
      "href",
      "/company/invoices/inv-client/print"
    );
    expect(screen.queryByText("ZAR 9999")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Driver" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /void/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark paid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });
});
