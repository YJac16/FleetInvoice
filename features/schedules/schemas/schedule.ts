import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const scheduleSchema = z.object({
  route_id: z.string().min(1, "Route is required"),
  name: z.string().min(2, "Name is required"),
  days_of_week: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Select at least one day"),
  depart_time: z
    .string()
    .regex(TIME_PATTERN, "Use HH:MM format"),
  effective_from: z.string().min(1, "Effective from is required"),
  effective_to: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  status: z.enum(ENTITY_STATUSES),
});

export type ScheduleValues = z.infer<typeof scheduleSchema>;
