import { z } from "zod";

export const generateInvoiceSchema = z.object({
  company_id: z.string().uuid("Select a company"),
  week_start: z.string().min(1, "Week start is required"),
});

export type GenerateInvoiceValues = z.infer<typeof generateInvoiceSchema>;

export const generatePeriodInvoiceSchema = z.object({
  company_id: z.string().uuid("Select a company"),
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
});

export type GeneratePeriodInvoiceValues = z.infer<
  typeof generatePeriodInvoiceSchema
>;
