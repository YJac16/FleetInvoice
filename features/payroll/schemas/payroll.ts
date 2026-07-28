import { z } from "zod";

import { PAY_RATE_UNITS, PAY_SUBJECT_ROLES } from "@/lib/constants";

export const payRateSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  subject_role: z.enum(PAY_SUBJECT_ROLES),
  unit: z.enum(PAY_RATE_UNITS),
  unit_amount: z.string().min(1, "Amount is required"),
  company_id: z.string().optional(),
  effective_from: z.string().min(1, "Effective from is required"),
  effective_to: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().optional(),
});

export type PayRateValues = z.infer<typeof payRateSchema>;

export const generatePayrollSchema = z.object({
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
});

export type GeneratePayrollValues = z.infer<typeof generatePayrollSchema>;
