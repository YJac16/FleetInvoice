import { z } from "zod";

import { ENTITY_STATUSES, VEHICLE_TYPES } from "@/lib/constants";

const optionalStatus = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = (value ?? "active").trim().toLowerCase();
    if ((ENTITY_STATUSES as readonly string[]).includes(normalized)) {
      return normalized as (typeof ENTITY_STATUSES)[number];
    }
    return "active" as const;
  });

export const driverImportSchema = z.object({
  full_name: z.string().min(2, "full_name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  license_number: z.string().optional(),
  status: optionalStatus,
});

export const employeeImportSchema = z.object({
  full_name: z.string().min(2, "full_name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  employee_number: z.string().optional(),
  company_code: z.string().optional(),
  status: optionalStatus,
});

export const vehicleImportSchema = z.object({
  name: z.string().min(1, "name is required"),
  registration_number: z.string().optional(),
  vehicle_type: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = (value ?? "other").trim().toLowerCase();
      if ((VEHICLE_TYPES as readonly string[]).includes(normalized)) {
        return normalized as (typeof VEHICLE_TYPES)[number];
      }
      return "other" as const;
    }),
  capacity: z
    .string()
    .optional()
    .transform((value) => {
      if (!value?.trim()) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }),
  status: optionalStatus,
});

export type DriverImportRow = z.infer<typeof driverImportSchema>;
export type EmployeeImportRow = z.infer<typeof employeeImportSchema>;
export type VehicleImportRow = z.infer<typeof vehicleImportSchema>;
