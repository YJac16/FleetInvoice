export type RangeFilterCountQuery = {
  isError: boolean;
  isPlaceholderData: boolean;
};

export function resolveRangeFilterResultCount(
  query: RangeFilterCountQuery,
  input: {
    listReady: boolean;
    count: number;
  }
): number | undefined {
  if (query.isError || query.isPlaceholderData || !input.listReady) {
    return undefined;
  }
  return input.count;
}
