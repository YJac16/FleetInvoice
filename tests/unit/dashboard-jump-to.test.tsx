import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let perms: string[] = [];
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("range=last_week"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/layout/org-context", () => ({
  useOrg: () => ({
    can: (p: string) => perms.includes(p),
    canModule: () => true,
    profile: { full_name: "Test User" },
    activeRole: "manager",
    isPlatformOwner: false,
  }),
}));
vi.mock("@/hooks/use-active-org-id", () => ({ useActiveOrgId: () => "org-1" }));
vi.mock("@/services/dashboard.service", () => ({
  getDashboardCounts: vi.fn().mockResolvedValue({}),
  getDashboardOpsSummary: vi.fn().mockResolvedValue({}),
  getDashboardSummary: vi.fn().mockResolvedValue({ invoices: null }),
}));

import { DashboardPage } from "@/features/dashboard/components/dashboard-page";

afterEach(cleanup);

describe("dashboard Jump to", () => {
  it("offers the permitted pages and keeps the range query on range-aware links", () => {
    perms = ["dashboard:view", "invoices:view", "trips:view", "maintenance:view"];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardPage />
      </QueryClientProvider>
    );
    const select = screen.getByRole("combobox", { name: "Jump to" }) as HTMLSelectElement;
    const options = [...select.options].filter((o) => o.value);
    expect(options.map((o) => o.textContent)).toEqual(["Invoices", "Maintenance", "Trips"]);
    expect(options.find((o) => o.textContent === "Invoices")?.value).toContain("range=last_week");
    expect(options.find((o) => o.textContent === "Maintenance")?.value).toBe("/maintenance");

    fireEvent.change(select, { target: { value: options[2].value } });
    expect(push).toHaveBeenCalledWith(options[2].value);
    expect(options[2].value).toMatch(/^\/trips\?.*range=last_week/);
  });
});
