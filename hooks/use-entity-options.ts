"use client";

import { useQuery } from "@tanstack/react-query";

import { listAreas } from "@/services/areas.service";
import { listCompanies } from "@/services/companies.service";
import { listPickupPoints } from "@/services/pickup-points.service";
import { listRoutes } from "@/services/routes.service";
import { listSites } from "@/services/sites.service";
import { queryKeys } from "@/utils/query";

export type SelectOption = { label: string; value: string };

export type UseEntityOptionsConfig = {
  includePickupPoints?: boolean;
  includeRoutes?: boolean;
};

export function useEntityOptions(
  organisationId: string | null,
  config: UseEntityOptionsConfig = {}
) {
  const companiesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.companies(organisationId)
      : ["companies", "none"],
    queryFn: () => listCompanies(organisationId!),
    enabled: Boolean(organisationId),
  });

  const areasQuery = useQuery({
    queryKey: organisationId ? queryKeys.areas(organisationId) : ["areas", "none"],
    queryFn: () => listAreas(organisationId!),
    enabled: Boolean(organisationId),
  });

  const sitesQuery = useQuery({
    queryKey: organisationId ? queryKeys.sites(organisationId) : ["sites", "none"],
    queryFn: () => listSites(organisationId!),
    enabled: Boolean(organisationId),
  });

  const pickupPointsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.pickupPoints(organisationId)
      : ["pickup-points", "none"],
    queryFn: () => listPickupPoints(organisationId!),
    enabled: Boolean(organisationId) && Boolean(config.includePickupPoints),
  });

  const routesQuery = useQuery({
    queryKey: organisationId ? queryKeys.routes(organisationId) : ["routes", "none"],
    queryFn: () => listRoutes(organisationId!),
    enabled: Boolean(organisationId) && Boolean(config.includeRoutes),
  });

  const companies: SelectOption[] = (companiesQuery.data ?? []).map((row) => ({
    label: row.name,
    value: row.id,
  }));

  const areas: SelectOption[] = (areasQuery.data ?? []).map((row) => ({
    label: row.name,
    value: row.id,
  }));

  const sites: SelectOption[] = (sitesQuery.data ?? []).map((row) => ({
    label: row.name,
    value: row.id,
  }));

  const pickupPoints: SelectOption[] = (pickupPointsQuery.data ?? []).map(
    (row) => ({
      label: row.name,
      value: row.id,
    })
  );

  const routes: SelectOption[] = (routesQuery.data ?? []).map((row) => ({
    label: row.name,
    value: row.id,
  }));

  return {
    companies,
    areas,
    sites,
    pickupPoints,
    routes,
    isLoading:
      companiesQuery.isLoading ||
      areasQuery.isLoading ||
      sitesQuery.isLoading ||
      Boolean(config.includePickupPoints && pickupPointsQuery.isLoading) ||
      Boolean(config.includeRoutes && routesQuery.isLoading),
  };
}
