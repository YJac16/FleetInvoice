import {
  createTenantRow,
  listTenantRows,
  softDeleteTenantRow,
  updateTenantRow,
  type ListTenantOptions,
} from "@/services/tenant-entity.service";
import type { PayRate } from "@/types";

const TABLE = "pay_rates";
const SELECT = "*, companies:company_id (id, name)";

export function listPayRates(
  organisationId: string,
  options?: ListTenantOptions
) {
  return listTenantRows<PayRate>(TABLE, organisationId, {
    orderBy: "name",
    select: SELECT,
    ...options,
  });
}

export type PayRateInput = {
  name: string;
  subject_role: PayRate["subject_role"];
  unit: PayRate["unit"];
  unit_amount: number;
  currency?: string;
  company_id?: string | null;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
};

export const createPayRate = (organisationId: string, input: PayRateInput) =>
  createTenantRow<PayRate>(TABLE, {
    organisation_id: organisationId,
    currency: "ZAR",
    ...input,
  });

export const updatePayRate = (id: string, input: Partial<PayRateInput>) =>
  updateTenantRow<PayRate>(TABLE, id, input);

export const deletePayRate = (id: string) => softDeleteTenantRow(TABLE, id);
