import { z } from "zod";

import { ENTITY_STATUSES } from "@/lib/constants";

export const siteSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  company_id: z.string().optional(),
  area_id: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type SiteValues = z.infer<typeof siteSchema>;

export function parseOptionalCoord(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
