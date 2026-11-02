import { createClient } from "@/lib/supabase/client";
import {
  createTenantRow,
  listTenantRows,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { RateCard } from "@/types";

const TABLE = "rate_cards";

const SELECT = "*, companies:company_id (id, name)";

export async function listRateCards(
  organisationId: string,
  options?: ListTenantOptions
): Promise<RateCard[]> {
  if (options?.archivedOnly) {
    // RLS hides archived rows; read them through the definer RPC (00069).
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_archived_rate_cards", {
      p_organisation_id: organisationId,
    });
    if (error) throw error;
    return (data as RateCard[]) ?? [];
  }
  return listTenantRows<RateCard>(TABLE, organisationId, {
    orderBy: "name",
    select: SELECT,
    ...options,
  });
}

export type RateCardInput = {
  name: string;
  line_type: RateCard["line_type"];
  unit: RateCard["unit"];
  unit_amount: number;
  currency?: string;
  company_id?: string | null;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
};

export async function createRateCard(organisationId: string, input: RateCardInput) {
  // Company trip rates go through the RPC so cards chain (effective_to) and
  // a same-date card is corrected in place instead of duplicated.
  if (input.line_type === "trip" && input.company_id) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("apply_company_trip_rate", {
      p_organisation_id: organisationId,
      p_company_id: input.company_id,
      p_amount: input.unit_amount,
      p_effective_from: input.effective_from,
      p_name: input.name,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return { id: data as string } as RateCard;
  }
  return createTenantRow<RateCard>(TABLE, {
    organisation_id: organisationId,
    currency: "ZAR",
    ...input,
  });
}

export const updateRateCard = (id: string, input: Partial<RateCardInput>) =>
  updateTenantRow<RateCard>(TABLE, id, input);

/** Archive via SECURITY DEFINER RPC (rate_cards has no status column). */
export async function deleteRateCard(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("archive_rate_card", { p_rate_card_id: id });
  if (error) throw error;
}

export async function restoreRateCard(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restore_rate_card", { p_rate_card_id: id });
  if (error) throw error;
}
