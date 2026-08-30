import type { AppRole } from "@/lib/constants";

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
