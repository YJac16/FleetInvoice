export function canApplyScanReview(
  fields: Array<{ showSuggestion: boolean; confirmed: boolean }>,
  checkedDoc: boolean
): boolean {
  const allResolved = fields.every((f) => !f.showSuggestion || f.confirmed);
  return allResolved && checkedDoc;
}
