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
  license_code: z.string().optional(),
  license_expiry: z.string().optional(),
  pdp_number: z.string().optional(),
  pdp_expiry: z.string().optional(),
  tour_guide: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = (value ?? "").trim().toLowerCase();
      return ["yes", "true", "1", "y"].includes(normalized);
    }),
  additional_qualifications: z.string().optional(),
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

const optionalNumber = z
  .string()
  .optional()
  .transform((value) => {
    if (!value?.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  });

const optionalBool = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = (value ?? "").trim().toLowerCase();
    return ["yes", "true", "1", "y"].includes(normalized);
  });

export const vehicleImportSchema = z.object({
  name: z.string().min(1, "name is required"),
  registration_number: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: optionalNumber,
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
  capacity: optionalNumber,
  title_holder: z.string().optional(),
  owner_name: z.string().optional(),
  department: z.string().optional(),
  permit_number: z.string().optional(),
  permit_expiry: z.string().optional(),
  licence_expiry: z.string().optional(),
  licence_type: z.string().optional(),
  comments: z.string().optional(),
  original_natis_in_file: optionalBool,
  authority: z.string().optional(),
  current_odometer_km: optionalNumber,
  status: optionalStatus,
});

export type DriverImportRow = z.infer<typeof driverImportSchema>;
export type EmployeeImportRow = z.infer<typeof employeeImportSchema>;
export type VehicleImportRow = z.infer<typeof vehicleImportSchema>;
