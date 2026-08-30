import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

export const companySchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type CompanyValues = z.infer<typeof companySchema>;
