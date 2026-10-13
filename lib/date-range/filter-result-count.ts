export type RangeFilterCountQuery = {
  isError: boolean;
};

export function resolveRangeFilterResultCount(
  query: RangeFilterCountQuery,
  input: {
    listReady: boolean;
    count: number;
  }
): number | undefined {
  if (query.isError || !input.listReady) return undefined;
  return input.count;
}
