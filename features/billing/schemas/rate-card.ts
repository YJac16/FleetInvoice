import { z } from "zod";

import {
  RATE_CARD_LINE_TYPES,
  RATE_CARD_UNITS,
} from "@/lib/constants";

export const rateCardSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  line_type: z.enum(RATE_CARD_LINE_TYPES),
  unit: z.enum(RATE_CARD_UNITS),
  unit_amount: z.string().min(1, "Amount is required"),
  company_id: z.string().optional(),
  effective_from: z.string().min(1, "Effective from is required"),
  effective_to: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().optional(),
});

export type RateCardValues = z.infer<typeof rateCardSchema>;
