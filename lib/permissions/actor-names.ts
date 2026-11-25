import type { AppRole } from "@/lib/constants";

/** Roles list_org_actor_names (00088) serves. Never driver / employee / company_manager. */
export const ACTOR_NAME_ROLES: readonly AppRole[] = [
  "platform_owner",
  "organisation_admin",
  "manager",
  "dispatcher",
  "supervisor",
];

export function canSeeActorNames(role: AppRole | null | undefined, isPlatformOwner = false): boolean {
  if (isPlatformOwner) return true;
  return Boolean(role && ACTOR_NAME_ROLES.includes(role));
}
