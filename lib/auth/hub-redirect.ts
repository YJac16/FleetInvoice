import type { AppRole } from "@/lib/constants";

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
