import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { CompanyShell } from "@/components/layout/company-shell";
import { EmployeeShell } from "@/components/layout/employee-shell";
import { PortalClock } from "@/components/layout/portal-clock";
import {
  formatPortalClock,
  PORTAL_CLOCK_TIME_ZONE,
} from "@/lib/time/portal-clock";
import type { MembershipWithOrg, Profile } from "@/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
    resolvedTheme: "light",
  }),
}));

vi.mock("@/services/subscriptions.service", () => ({
  listEntitledModules: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/companies.service", () => ({
  listCompanies: vi.fn().mockResolvedValue([]),
  listActiveCompanies: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/auth.service", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/services/admin-notifications.service", () => ({
  listMyAdminNotifications: vi.fn().mockResolvedValue([]),
  markAdminNotificationRead: vi.fn(),
  adminUnreadCount: () => 0,
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

const memberships: MembershipWithOrg[] = [
  {
    id: "member-1",
    organisation_id: "org-1",
    user_id: "user-1",
    role: "organisation_admin",
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    organisations: {
      id: "org-1",
      name: "GoOps",
      slug: "goops",
      status: "active",
    },
  },
];

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
}

describe("formatPortalClock", () => {
  it("uses Africa/Johannesburg even when the instant is a different local day", () => {
    expect(PORTAL_CLOCK_TIME_ZONE).toBe("Africa/Johannesburg");

    expect(formatPortalClock(new Date("2026-11-05T15:51:00.000Z"))).toEqual({
      dateLine: "05 Nov",
      timeLine: "17:51",
      label: "05 Nov, 17:51",
    });

    expect(formatPortalClock(new Date("2026-11-05T23:30:00.000Z"))).toEqual({
      dateLine: "06 Nov",
      timeLine: "01:30",
      label: "06 Nov, 01:30",
    });
  });
});

describe("PortalClock", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows SAST and advances on the next minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T15:51:30.000Z"));

    render(<PortalClock />);

    expect(screen.getByLabelText("05 Nov, 17:51")).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date("2026-11-05T15:52:00.000Z"));
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByLabelText("05 Nov, 17:52")).toBeInTheDocument();
    expect(screen.queryByLabelText("05 Nov, 17:51")).not.toBeInTheDocument();
  });

  it("resyncs to SAST when the tab becomes visible again", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T15:51:30.000Z"));
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");

    render(<PortalClock />);
    expect(screen.getByLabelText("05 Nov, 17:51")).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date("2026-11-05T16:10:05.000Z"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByLabelText("05 Nov, 18:10")).toBeInTheDocument();

    if (visibility) {
      Object.defineProperty(document, "visibilityState", visibility);
    }
  });
});

describe("portal headers", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the clock on the admin shell", () => {
    renderWithQuery(
      <AppShell
        profile={profile}
        memberships={memberships}
        activeOrganisationId="org-1"
        isPlatformOwner={false}
      >
        <p>Admin body</p>
      </AppShell>
    );
    expect(screen.getByLabelText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("shows the clock on the employee shell", () => {
    renderWithQuery(
      <EmployeeShell
        profile={profile}
        memberships={memberships}
        activeOrganisationId="org-1"
        isPlatformOwner={false}
      >
        <p>Employee body</p>
      </EmployeeShell>
    );
    expect(screen.getByLabelText(/\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText("Employee")).toBeInTheDocument();
  });

  it("shows the clock on the company shell", () => {
    renderWithQuery(
      <CompanyShell
        profile={profile}
        memberships={memberships}
        activeOrganisationId="org-1"
        isPlatformOwner={false}
      >
        <p>Company body</p>
      </CompanyShell>
    );
    expect(screen.getByLabelText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });
});
