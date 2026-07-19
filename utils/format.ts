export function formatFullName(name: string | null | undefined): string {
  if (!name?.trim()) return "User";
  return name.trim();
}

export function getInitials(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "U";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
