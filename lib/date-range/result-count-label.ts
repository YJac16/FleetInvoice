export function formatRangeResultCount(
  count: number,
  singular: string,
  plural: string
): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
}
