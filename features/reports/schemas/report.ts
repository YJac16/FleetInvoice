import { z } from "zod";

export const REPORT_TYPES = [
  "trips",
  "fuel",
  "attendance",
  "commercial",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  trips: "Trips",
  fuel: "Fuel fill-ups",
  attendance: "Attendance boardings",
  commercial: "Invoices & payroll",
};

export const reportFilterSchema = z.object({
  report_type: z.enum(REPORT_TYPES),
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
});

export type ReportFilterValues = z.infer<typeof reportFilterSchema>;
