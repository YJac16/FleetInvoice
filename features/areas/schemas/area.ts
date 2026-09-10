import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";
import {
  AREA_RADIUS_MAX_M,
  AREA_RADIUS_MIN_M,
} from "@/features/areas/lib/geocode";

export const areaSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().min(AREA_RADIUS_MIN_M).max(AREA_RADIUS_MAX_M),
  mapbox_place_id: z.string().min(1, "Search and select a place on the map"),
  place_name: z.string().min(1),
});

export type AreaValues = z.infer<typeof areaSchema>;
