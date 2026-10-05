import { z } from "zod";

import { FUEL_TYPES } from "@/lib/fuel/constants";

export const slipVrnStatusSchema = z.enum([
  "confirmed_prefill",
  "edited",
  "not_shown",
]);

export const fuelSlipFieldsSchema = z.object({
  filled_at_local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filled_at_local_time: z.string().regex(/^\d{2}:\d{2}$/),
  vehicle_id: z.string().uuid(),
  litres: z.coerce.number().positive().max(1000),
  unit_price: z.coerce.number().positive().max(100),
  total_amount: z.coerce.number().min(0).max(100_000),
  fuel_type: z.enum(FUEL_TYPES),
  slip_vrn: z.string().max(12).optional().nullable(),
  slip_vrn_status: slipVrnStatusSchema,
  odometer_km: z.coerce.number().min(0).max(2_000_000),
  authorisation_no: z.string().max(32).optional().nullable(),
  order_no: z.string().max(32).optional().nullable(),
  pump_no: z.coerce.number().int().min(0).max(99).optional().nullable(),
  station_name: z.string().min(1).max(200),
  station_vat_no: z
    .string()
    .regex(/^\d{10}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  slip_number: z.string().max(32).optional().nullable(),
  is_full_tank: z.coerce.boolean().default(true),
  notes: z.string().max(280).optional().nullable(),
  client_entry_id: z.string().uuid(),
});

export type FuelSlipFields = z.infer<typeof fuelSlipFieldsSchema>;
