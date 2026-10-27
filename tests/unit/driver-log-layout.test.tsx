import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DriverLogTripPage } from "@/features/driver-portal/components/driver-log-trip-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

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

vi.mock("@/services/companies.service", () => ({
  listActiveCompanies: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/driver-submitted-trips.service", () => ({
  submitDriverTrip: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DriverLogTripPage />
    </QueryClientProvider>
  );
}

describe("DriverLogTripPage layout", () => {
  it("keeps date and time in a shrinking grid that stacks on narrow phones", () => {
    const { container } = renderPage();
    const date = screen.getByLabelText("Date");
    const time = screen.getByLabelText("Time");

    expect(date).toHaveAttribute("type", "date");
    expect(time).toHaveAttribute("type", "time");
    expect(date.className).toContain("driver-datetime");
    expect(time.className).toContain("driver-datetime");
    expect(date.className).not.toContain("bg-zinc-900");

    const grid = date.closest(".driver-pair-grid");
    expect(grid).toBeTruthy();
    expect(grid).toBe(time.closest(".driver-pair-grid"));
    expect(grid?.className).toContain("driver-pair-grid--stack");
    expect(date.parentElement?.className).toContain("min-w-0");

    const css = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8"
    );
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
    expect(css).toContain(".driver-pair-grid--stack");
    expect(css).toMatch(/max-width:\s*359px/);

    const pax = screen.getByLabelText("Pax");
    const paxGrid = pax.closest(".driver-pair-grid");
    expect(paxGrid?.className).not.toContain("driver-pair-grid--stack");

    expect(container.querySelector(".bg-zinc-950")).toBeNull();
  });
});
