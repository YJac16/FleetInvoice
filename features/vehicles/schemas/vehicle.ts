import { z } from "zod";

import { complianceTodaySast } from "@/features/compliance/lib/compliance-dates";
import { ENTITY_STATUSES, VEHICLE_TYPES } from "@/lib/constants";

function maxModelYear(): number {
  return Number(complianceTodaySast().slice(0, 4)) + 1;
}

const optionalTrimmed = z.string().optional();

export const vehicleSchema = z.object({
  name: z.string().min(2, "Name is required"),
  registration_number: z.string().optional(),
  vehicle_type: z.enum(VEHICLE_TYPES),
  make: optionalTrimmed,
  model: optionalTrimmed,
  model_year: optionalTrimmed,
  colour: optionalTrimmed,
  classification: optionalTrimmed,
  operating_permit_number: optionalTrimmed,
  operating_permit_expires_on: optionalTrimmed,
  license_disc_expires_on: optionalTrimmed,
  capacity: z.string().optional(),
  company_id: z.string().optional(),
  status: z.enum(ENTITY_STATUSES),
});

export type VehicleValues = z.infer<typeof vehicleSchema>;

export function parseCapacity(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeVehicleFields(values: VehicleValues): {
  ok: true;
  data: Record<string, unknown>;
} | { ok: false; message: string } {
  const trim = (v: string | undefined) => {
    const t = v?.trim();
    return t ? t : null;
  };

  const make = trim(values.make);
  const model = trim(values.model);
  const colour = trim(values.colour);
  const classification = trim(values.classification);
  const operating_permit_number = trim(values.operating_permit_number);

  if (make && (make.length < 1 || make.length > 60)) {
    return { ok: false, message: "Make must be 1–60 characters" };
  }
  if (model && (model.length < 1 || model.length > 60)) {
    return { ok: false, message: "Model must be 1–60 characters" };
  }
  if (colour && (colour.length < 1 || colour.length > 40)) {
    return { ok: false, message: "Colour must be 1–40 characters" };
  }
  if (classification && (classification.length < 1 || classification.length > 60)) {
    return { ok: false, message: "Classification must be 1–60 characters" };
  }
  if (
    operating_permit_number &&
    (operating_permit_number.length < 1 || operating_permit_number.length > 60)
  ) {
    return { ok: false, message: "Permit number must be 1–60 characters" };
  }

  let model_year: number | null = null;
  if (values.model_year?.trim()) {
    const y = Number(values.model_year);
    const max = maxModelYear();
    if (!Number.isInteger(y) || y < 1950 || y > max) {
      return { ok: false, message: `Year must be 1950–${max}` };
    }
    model_year = y;
  }

  return {
    ok: true,
    data: {
      name: values.name.trim(),
      registration_number: trim(values.registration_number),
      make,
      model,
      model_year,
      colour,
      classification,
      operating_permit_number,
      operating_permit_expires_on: trim(values.operating_permit_expires_on),
      license_disc_expires_on: trim(values.license_disc_expires_on),
      vehicle_type: values.vehicle_type,
      capacity: parseCapacity(values.capacity),
      company_id:
        values.company_id?.trim() && values.company_id !== "none"
          ? values.company_id.trim()
          : null,
      status: values.status,
    },
  };
}
