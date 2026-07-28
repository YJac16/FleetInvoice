"use client";

import { useOrg } from "@/components/layout/org-context";

export function useActiveOrgId(): string | null {
  const { activeOrganisationId } = useOrg();
  return activeOrganisationId;
}
