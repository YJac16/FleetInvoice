import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

export const pickupPointSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  site_id: z.string().optional(),
  area_id: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type PickupPointValues = z.infer<typeof pickupPointSchema>;
