import type { UseQueryResult } from "@tanstack/react-query";

/** True when the UI should show a list/card skeleton instead of an empty area. */
export function useShowListSkeleton<TData>(
  query: Pick<
    UseQueryResult<TData, unknown>,
    "isPending" | "isFetching" | "data" | "isPlaceholderData"
  >
): boolean {
  if (query.isPending) return true;
  if (query.data === undefined && query.isFetching) return true;
  if (query.isFetching && !query.isPlaceholderData && query.data === undefined) {
    return true;
  }
  return false;
}
