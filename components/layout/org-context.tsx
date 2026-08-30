"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AppRole } from "@/lib/constants";
import { ORG_COOKIE_NAME } from "@/lib/constants";
import {
  ALL_MODULES,
  hasModule,
  type AppModule,
} from "@/lib/entitlements";
import { hasPermission, type Permission } from "@/lib/permissions";
import { listEntitledModules } from "@/services/subscriptions.service";
import type { MembershipWithOrg, Profile } from "@/types";

type OrgContextValue = {
  profile: Profile;
  memberships: MembershipWithOrg[];
  activeOrganisationId: string | null;
  activeRole: AppRole | null;
  isPlatformOwner: boolean;
  entitledModules: AppModule[];
  setActiveOrganisationId: (organisationId: string) => void;
  can: (permission: Permission) => boolean;
  canModule: (module: AppModule) => boolean;
};

const OrgContext = createContext<OrgContextValue | null>(null);

type OrgProviderProps = {
  children: ReactNode;
  profile: Profile;
  memberships: MembershipWithOrg[];
  initialOrganisationId: string | null;
  isPlatformOwner: boolean;
};

function writeOrgCookie(organisationId: string) {
  document.cookie = `${ORG_COOKIE_NAME}=${organisationId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function OrgProvider({
  children,
  profile,
  memberships,
  initialOrganisationId,
  isPlatformOwner,
}: OrgProviderProps) {
  const [activeOrganisationId, setActiveOrganisationIdState] = useState<
    string | null
  >(initialOrganisationId);

  const setActiveOrganisationId = useCallback((organisationId: string) => {
    setActiveOrganisationIdState(organisationId);
    writeOrgCookie(organisationId);
  }, []);

  const activeRole =
    memberships.find((m) => m.organisation_id === activeOrganisationId)?.role ??
    null;

  const modulesQuery = useQuery({
    queryKey: activeOrganisationId
      ? ["entitlements", activeOrganisationId]
      : ["entitlements", "none"],
    queryFn: () => listEntitledModules(activeOrganisationId!),
    enabled: Boolean(activeOrganisationId) && !isPlatformOwner,
    staleTime: 60_000,
  });

  const entitledModules = isPlatformOwner
    ? ALL_MODULES
    : (modulesQuery.data ?? ALL_MODULES);

  const value = useMemo<OrgContextValue>(
    () => ({
      profile,
      memberships,
      activeOrganisationId,
      activeRole,
      isPlatformOwner,
      entitledModules,
      setActiveOrganisationId,
      can: (permission) =>
        hasPermission(activeRole, permission, isPlatformOwner),
      canModule: (module) =>
        isPlatformOwner || hasModule(entitledModules, module),
    }),
    [
      profile,
      memberships,
      activeOrganisationId,
      activeRole,
      isPlatformOwner,
      entitledModules,
      setActiveOrganisationId,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return ctx;
}
