export type SelectOption = { label: string; value: string };

export function resolveSelectLabel(
  options: SelectOption[],
  value: unknown,
  placeholder = "Select…"
): string {
  if (value == null || value === "") return placeholder;
  const match = options.find((option) => option.value === value);
  return match?.label ?? String(value);
}
