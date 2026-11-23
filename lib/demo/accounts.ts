import "server-only";

import type { AppRole } from "@/lib/constants";

/** Organisation slug of the demo org (Cape Shuttle Ops). */
export const DEMO_ORG_SLUG = "cape-shuttle-ops";

export type DemoAccount = {
  role: AppRole;
  label: string;
  email: string;
};

/**
 * Pre-seeded demo accounts (exist only on the demo Supabase project).
 * Fixed allowlist: the switcher can only ever sign in as one of these.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { role: "organisation_admin", label: "Admin", email: "demo-admin@example.com" },
  { role: "manager", label: "Ops manager", email: "demo-ops-manager@example.com" },
  { role: "dispatcher", label: "Dispatcher", email: "demo-dispatcher@example.com" },
  { role: "supervisor", label: "Supervisor", email: "demo-supervisor@example.com" },
  { role: "driver", label: "Driver", email: "demo-driver@example.com" },
  { role: "employee", label: "Employee", email: "demo-employee@example.com" },
  { role: "company_manager", label: "Client portal (Acme)", email: "demo-client@example.com" },
];

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.some((a) => a.email === normalised);
}

export function findDemoAccountByRole(role: unknown): DemoAccount | null {
  if (typeof role !== "string") return null;
  return DEMO_ACCOUNTS.find((a) => a.role === role) ?? null;
}

export function demoRoleOptions(): { role: AppRole; label: string }[] {
  return DEMO_ACCOUNTS.map(({ role, label }) => ({ role, label }));
}
