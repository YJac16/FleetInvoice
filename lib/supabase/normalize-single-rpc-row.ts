/**
 * PostgREST returns `RETURNS composite` RPCs as one JSON object and
 * `RETURNS SETOF` / table RPCs as an array. When no row matches, the
 * payload may be null or a composite object with every field null.
 */
export function normalizeSingleRpcRow<T extends Record<string, unknown>>(
  value: unknown,
  idKey: keyof T & string = "id"
): T | null {
  if (value == null) return null;
  const row = Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  if (!row || typeof row !== "object") return null;
  const candidate = row as T;
  const id = candidate[idKey];
  if (typeof id !== "string" || id.length === 0) return null;
  return candidate;
}
