"use client";

import { useQuery } from "@tanstack/react-query";

import { isPlacePickerEnabled } from "@/features/places/lib/flags";
import { isMapboxConfigured } from "@/lib/env";
import { getOrganisationSettings } from "@/services/organisation-settings.service";
import { queryKeys } from "@/utils/query";

/**
 * True only when the org has settings.place_picker === true AND a Mapbox token
 * is configured. Any error or loading state resolves to false (plain text).
 */
export function usePlacePickerEnabled(organisationId: string | null): boolean {
  const query = useQuery({
    queryKey: [...queryKeys.organisation(organisationId ?? "none"), "settings"],
    queryFn: () => getOrganisationSettings(organisationId!),
    enabled: Boolean(organisationId) && isMapboxConfigured(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return isMapboxConfigured() && isPlacePickerEnabled(query.data);
}
