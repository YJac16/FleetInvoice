import { createClient } from "@/lib/supabase/client";

type SoftDeleteable = {
  organisation_id: string;
  deleted_at: string | null;
};

export type ListTenantOptions = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
  orderBy?: string;
  select?: string;
};

export async function listTenantRows<T extends SoftDeleteable>(
  table: string,
  organisationId: string,
  orderByOrOptions: string | ListTenantOptions = "name"
): Promise<T[]> {
  const options: ListTenantOptions =
    typeof orderByOrOptions === "string"
      ? { orderBy: orderByOrOptions }
      : orderByOrOptions;

  const orderBy = options.orderBy ?? "name";
  const supabase = createClient();
  let query = supabase
    .from(table)
    .select(options.select ?? "*")
    .eq("organisation_id", organisationId)
    .order(orderBy);

  if (options.archivedOnly) {
    query = query.not("deleted_at", "is", null);
  } else if (!options.includeArchived) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as T[]) ?? [];
}

export async function createTenantRow<T>(
  table: string,
  payload: Record<string, unknown>
): Promise<T> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from(table)
    .insert({ ...payload, created_by: user?.id ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as T;
}

export async function createTenantRows<T>(
  table: string,
  payloads: Record<string, unknown>[]
): Promise<T[]> {
  if (payloads.length === 0) return [];
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows = payloads.map((payload) => ({
    ...payload,
    created_by: user?.id ?? null,
  }));

  const { data, error } = await supabase.from(table).insert(rows).select("*");
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function updateTenantRow<T>(
  table: string,
  id: string,
  payload: Record<string, unknown>
): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error) throw error;
  return data as T;
}

export async function softDeleteTenantRow(
  table: string,
  id: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: new Date().toISOString(),
      status: "inactive",
    })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreTenantRow(
  table: string,
  id: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: null,
      status: "active",
    })
    .eq("id", id);
  if (error) throw error;
}
