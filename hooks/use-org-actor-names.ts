"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { toActorNameMap, type ActorNameMap } from "@/features/trips/lib/actor-labels";
import { listOrgActorNames } from "@/services/actor-names.service";

const EMPTY: ActorNameMap = new Map();

/** Staff-only (admin / manager / dispatcher / supervisor). Never call from driver UI. */
export function useOrgActorNames(organisationId: string | null | undefined, enabled = true): ActorNameMap {
  const query = useQuery({
    queryKey: ["org-actor-names", organisationId ?? "none"],
    queryFn: () => listOrgActorNames(organisationId!),
    enabled: Boolean(organisationId) && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return useMemo(() => (query.data ? toActorNameMap(query.data) : EMPTY), [query.data]);
}
