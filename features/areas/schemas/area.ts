import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

export const areaSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type AreaValues = z.infer<typeof areaSchema>;
