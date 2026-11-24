import type { AppRole } from "@/lib/constants";
import type { AppModule } from "@/lib/entitlements";

/** Where guarded layouts and /hub send members whose org's plan lacks a module. */
export const NO_ACCESS_PATH = "/app/no-access";

type HubSessionLike = {
  activeRole: AppRole | null | undefined;
  isPlatformOwner: boolean;
  memberships: readonly unknown[];
};

/**
 * Post-login home by active membership role (ADR 0005 role hubs).
 */
export function hubPathForRole(
  role: AppRole | null | undefined,
  isPlatformOwner = false
): string {
  if (isPlatformOwner) return "/dashboard";

  switch (role) {
    case "company_manager":
      return "/company";
    case "driver":
      return "/driver";
    case "employee":
      return "/employee";
    case "organisation_admin":
    case "manager":
    case "dispatcher":
    case "supervisor":
    case "platform_owner":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

/**
 * Safe home for a 404 / recovery CTA. Signed-out users go to login
 * (invite-only — never /dashboard). Members without an org wait for invite.
 */
export function hubHrefForSession(session: HubSessionLike | null): string {
  if (!session) return "/login";
  if (!session.isPlatformOwner && session.memberships.length === 0) {
    return "/awaiting-invite";
  }
  return hubPathForRole(session.activeRole, session.isPlatformOwner);
}

/**
 * Module a role's own hub depends on: the company manager hub is "portal",
 * the employee hub is "passengers". Null for drivers, ops roles and platform
 * owners (their home is not module-gated).
 */
export function hubModuleForRole(
  role: AppRole | null | undefined,
  isPlatformOwner = false
): AppModule | null {
  if (isPlatformOwner) return null;
  if (role === "company_manager") return "portal";
  if (role === "employee") return "passengers";
  return null;
}

/**
 * Home link for the /app/no-access page. Null when the user's own hub is the
 * thing that isn't entitled, so the page never links back into a redirect.
 */
export function noAccessHomeHref(
  session: HubSessionLike | null,
  hubEntitled: boolean
): string | null {
  if (
    session &&
    !hubEntitled &&
    hubModuleForRole(session.activeRole, session.isPlatformOwner)
  ) {
    return null;
  }
  return hubHrefForSession(session);
}

/**
 * Trips / dispatch surface for the active role. Drivers and employees use
 * their portal; company managers have no trips list (company hub).
 */
export function tripsHrefForRole(
  role: AppRole | null | undefined,
  isPlatformOwner = false
): string {
  if (isPlatformOwner) return "/trips";

  switch (role) {
    case "driver":
      return "/driver";
    case "employee":
      return "/employee/book";
    case "company_manager":
      return "/company";
    default:
      return "/trips";
  }
}
