import {
  createTenantRow,
  listTenantRows,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { RateCard } from "@/types";

const TABLE = "rate_cards";

const SELECT = "*, companies:company_id (id, name)";

export function listRateCards(
  organisationId: string,
  options?: ListTenantOptions
) {
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

export const createRateCard = (organisationId: string, input: RateCardInput) =>
  createTenantRow<RateCard>(TABLE, {
    organisation_id: organisationId,
    currency: "ZAR",
    ...input,
  });

export const updateRateCard = (id: string, input: Partial<RateCardInput>) =>
  updateTenantRow<RateCard>(TABLE, id, input);

export const deleteRateCard = (id: string) => softDeleteTenantRow(TABLE, id);
