import "server-only";

import type { AppRole } from "@/lib/constants";

/** Organisation slug of the demo org (Cape Shuttle Ops). */
export const DEMO_ORG_SLUG = "cape-shuttle-ops";

/** Modules a demo account's hub needs on the demo org's plan. */
export type DemoRequiredModule = "passengers" | "portal";

export type DemoAccount = {
  role: AppRole;
  label: string;
  email: string;
  /** Hub module the demo org must be entitled to for this account. */
  requiresModule?: DemoRequiredModule;
  /** Option label shown (disabled) when requiresModule isn't entitled. */
  unavailableLabel?: string;
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
  {
    role: "employee",
    label: "Employee",
    email: "demo-employee@example.com",
    requiresModule: "passengers",
    unavailableLabel: "Employee (needs Scale + passengers)",
  },
  {
    role: "company_manager",
    label: "Client portal (Acme)",
    email: "demo-client@example.com",
    requiresModule: "portal",
    unavailableLabel: "Client portal (needs portal)",
  },
];

/**
 * Extra demo sign-ins that may use the switcher (view it and switch into any
 * DEMO_ACCOUNTS role). They have no mapped role of their own, so they are never
 * offered as a switch target. DEMO ONLY: every consumer is behind isDemoEnabled().
 */
export const DEMO_SWITCHER_EXTRA_EMAILS: readonly string[] = ["demo@goops.co.za"];

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  return (
    DEMO_ACCOUNTS.some((a) => a.email === normalised) ||
    DEMO_SWITCHER_EXTRA_EMAILS.includes(normalised)
  );
}

export function findDemoAccountByRole(role: unknown): DemoAccount | null {
  if (typeof role !== "string") return null;
  return DEMO_ACCOUNTS.find((a) => a.role === role) ?? null;
}

export function findDemoAccountByEmail(email: unknown): DemoAccount | null {
  if (typeof email !== "string") return null;
  const normalised = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email === normalised) ?? null;
}

export type DemoRoleOption = Pick<
  DemoAccount,
  "role" | "label" | "requiresModule" | "unavailableLabel"
>;

export function demoRoleOptions(): DemoRoleOption[] {
  return DEMO_ACCOUNTS.map(({ role, label, requiresModule, unavailableLabel }) => ({
    role,
    label,
    ...(requiresModule ? { requiresModule, unavailableLabel } : {}),
  }));
}
