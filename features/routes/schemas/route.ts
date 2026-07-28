import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

export const routeSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  description: z.string().optional(),
  company_id: z.string().optional(),
  area_id: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type RouteValues = z.infer<typeof routeSchema>;
