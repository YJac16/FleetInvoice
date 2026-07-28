import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

export const driverSchema = z.object({
  full_name: z.string().min(2, "Full name is required"),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
  phone: z.string().optional(),
  license_number: z.string().optional(),
  profile_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type DriverValues = z.infer<typeof driverSchema>;
