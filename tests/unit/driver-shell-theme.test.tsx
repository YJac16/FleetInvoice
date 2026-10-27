import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DriverShell } from "@/components/layout/driver-shell";
import type { Profile } from "@/types";

const setTheme = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/driver/log",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme, resolvedTheme: "dark" }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

vi.mock("@/services/subscriptions.service", () => ({
  listEntitledModules: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/driver-notifications.service", () => ({
  listMyDriverNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn(),
  unreadCount: () => 0,
}));

vi.mock("@/services/staff-trips.service", () => ({
  listMyStaffTrips: vi.fn().mockResolvedValue([]),
  heartbeatDriverPresence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/gps.service", () => ({
  ingestGpsPoints: vi.fn(),
}));

const profile: Profile = {
  id: "user-1",
  email: "yaseen@example.com",
  full_name: "Yaseen Jacobs",
  avatar_url: null,
  phone: null,
  is_platform_owner: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
};

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DriverShell
        profile={profile}
        memberships={[]}
        activeOrganisationId="org-1"
        isPlatformOwner={false}
      >
        <p>Driver body</p>
      </DriverShell>
    </QueryClientProvider>
  );
}

describe("DriverShell theme", () => {
  it("does not force dark mode and shows the profile name", () => {
    const { container } = renderShell();
    const root = container.querySelector(".min-h-screen");
    expect(root).toBeTruthy();
    expect(root?.className.split(/\s+/)).not.toContain("dark");
    expect(root?.className).toContain("bg-background");
    expect(screen.getByText("YASEEN JACOBS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme: dark/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log" })).toBeInTheDocument();
  });
});
