import { z } from "zod";

import { organisationSchema } from "@/features/organisations/schemas/organisation";

export const createOrganisationOnboardingSchema = organisationSchema.extend({
  supplier_name: z.string().min(1, "Business name is required"),
  supplier_address: z.string(),
  supplier_phone: z.string(),
  supplier_email: z.string(),
  bank: z.string(),
  account_name: z.string(),
  account_number: z.string(),
  branch_code: z.string(),
  account_type: z.string(),
  contact_name: z.string(),
  contact_phone: z.string(),
  contact_email: z.string(),
});

export type CreateOrganisationOnboardingValues = z.infer<
  typeof createOrganisationOnboardingSchema
>;
