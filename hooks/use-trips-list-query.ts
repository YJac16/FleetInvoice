"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ResolvedDateRange } from "@/lib/date-range/sast-range";
import { primaryRouteQueryMeta } from "@/lib/react-query/primary-route-meta";
import {
  getTripDriverNames,
  mergeTripDriverNames,
} from "@/services/trip-driver-names.service";
import { listTripRows, type ListTripsOptions } from "@/services/trips.service";
import type { Trip } from "@/types";
import { queryKeys } from "@/utils/query";

export type TripsListQuery = {
  trips: Trip[];
  data: Trip[] | undefined;
  isPending: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof useQuery<Trip[]>>["refetch"];
};

export function useTripsListQuery(
  organisationId: string | null | undefined,
  range: ResolvedDateRange,
  options?: { enabled?: boolean; refetchInterval?: number }
): TripsListQuery {
  const enabled = Boolean(organisationId) && (options?.enabled ?? true);

  const rowsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.trips(organisationId, range.from, range.toExclusive)
      : ["trips", "none"],
    queryFn: () =>
      listTripRows(organisationId!, { dateRange: range } satisfies ListTripsOptions),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: options?.refetchInterval,
    meta: primaryRouteQueryMeta,
  });

  const tripIds = useMemo(
    () => (rowsQuery.data ?? []).map((t) => t.id),
    [rowsQuery.data]
  );

  const namesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.tripDriverNames(organisationId, tripIds)
      : ["trip-driver-names", "none"],
    queryFn: () => getTripDriverNames(tripIds),
    enabled: enabled && rowsQuery.isSuccess && tripIds.length > 0,
    meta: primaryRouteQueryMeta,
  });

  const trips = useMemo(() => {
    const rows = rowsQuery.data ?? [];
    if (tripIds.length === 0) return rows;
    if (!namesQuery.data) return rows;
    return mergeTripDriverNames(rows, namesQuery.data);
  }, [rowsQuery.data, namesQuery.data, tripIds.length]);

  const isFetching = rowsQuery.isFetching || namesQuery.isFetching;
  const isPending = rowsQuery.isPending;
  const isPlaceholderData =
    rowsQuery.isPlaceholderData ||
    (tripIds.length > 0 && rowsQuery.isSuccess && namesQuery.isFetching);

  return {
    trips,
    data: trips,
    isFetching,
    isPending,
    isPlaceholderData,
    isLoading: isPending,
    isError: rowsQuery.isError || namesQuery.isError,
    error: rowsQuery.error ?? namesQuery.error ?? null,
    refetch: rowsQuery.refetch,
  };
}
