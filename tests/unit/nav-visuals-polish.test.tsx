import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let pathname = "/maintenance/due";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("preset=yesterday"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/layout/org-context", () => ({
  useOrg: () => ({ can: () => true, canModule: () => true }),
}));
vi.mock("@/components/brand/goops-logo", () => ({ GoOpsLogo: () => <span>logo</span> }));

import {
  AppSidebar,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "@/components/layout/app-sidebar";
import { InvoiceListFilters } from "@/features/invoices/components/invoice-list-filters";
import { MaintenanceTabs } from "@/features/maintenance/components/maintenance-tabs";
import {
  InvoiceTotalsChart,
  MaintenanceCostsChart,
} from "@/features/dashboard/components/dashboard-visuals";
import { sumBillsByMonth, totalsByInvoiceStatus } from "@/features/dashboard/lib/summary";

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
  pathname = "/maintenance/due";
});
afterEach(cleanup);

describe("desktop sidebar collapse", () => {
  it("collapses, remembers it in localStorage, and restores on mount", () => {
    const { unmount } = render(<AppSidebar rail />);
    expect(screen.getByLabelText("Filter pages")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("1");
    expect(screen.queryByLabelText("Filter pages")).toBeNull();
    // Icon-only links keep an accessible name.
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
    unmount();

    render(<AppSidebar rail />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("0");
  });

  it("phone sheet (no rail prop) has no collapse control and ignores the stored state", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
    render(<AppSidebar />);
    expect(screen.queryByRole("button", { name: /sidebar/i })).toBeNull();
    expect(screen.getByLabelText("Filter pages")).toBeTruthy();
  });
});

describe("maintenance section picker", () => {
  it("lists real sections, marks active, navigates, and hides Worth keeping for non-admins", () => {
    const { rerender } = render(<MaintenanceTabs />);
    const select = screen.getByRole("combobox", { name: "Section" }) as HTMLSelectElement;
    expect(select.value).toBe("/maintenance/due");
    expect([...select.options].map((o) => o.textContent)).not.toContain("Worth keeping");
    expect(screen.getByRole("link", { name: "Due" }).getAttribute("aria-current")).toBe("page");

    fireEvent.change(select, { target: { value: "/maintenance/suppliers" } });
    expect(push).toHaveBeenCalledWith("/maintenance/suppliers");

    rerender(<MaintenanceTabs showWorthKeeping />);
    expect(
      [...(screen.getByRole("combobox", { name: "Section" }) as HTMLSelectElement).options].map(
        (o) => o.textContent
      )
    ).toContain("Worth keeping");
  });
});

describe("invoice filter dropdowns", () => {
  it("status select drives the same page state as the chips", () => {
    const onStatus = vi.fn();
    render(<InvoiceListFilters statusFilter="all" onStatusFilterChange={onStatus} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "issued" },
    });
    expect(onStatus).toHaveBeenCalledWith("issued");
  });
});

describe("dashboard visuals", () => {
  it("aggregates invoices by status and bills by month from real rows", () => {
    expect(
      totalsByInvoiceStatus([
        { status: "issued", total: 100 },
        { status: "issued", total: "50" },
        { status: "draft", total: 10 },
        { status: "weird", total: 999 },
      ])
    ).toEqual({
      draft: { count: 1, total: 10 },
      issued: { count: 2, total: 150 },
      void: { count: 0, total: 0 },
    });
    const months = sumBillsByMonth(
      [
        { bill_date: "2026-11-03", total_incl: 200 },
        { bill_date: "2026-11-20", total_incl: "100" },
        { bill_date: "2025-01-01", total_incl: 5000 },
      ],
      new Date("2026-11-26T10:00:00Z")
    );
    expect(months).toHaveLength(6);
    expect(months.at(-1)).toEqual({ month: "2026-11", total: 300 });
  });

  it("renders nothing when there is no money to show", () => {
    const empty = totalsByInvoiceStatus([]);
    const { container } = render(<InvoiceTotalsChart totals={empty} />);
    expect(container.firstChild).toBeNull();
    const c2 = render(<MaintenanceCostsChart months={[{ month: "2026-11", total: 0 }]} />);
    expect(c2.container.firstChild).toBeNull();
  });
});
