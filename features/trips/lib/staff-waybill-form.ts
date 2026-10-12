import { z } from "zod";

export const staffWaybillBaseSchema = z.object({
  driverId: z.string().min(1, "Select a driver"),
  date: z.string().min(1, "Date required"),
  time: z.string().min(1, "Time required"),
  companyId: z.string().uuid("Select a company"),
  areaText: z.string().min(1, "Area required"),
  paxCount: z.number().int().min(0),
  vehicleId: z.string().optional(),
  openingKm: z.string().optional(),
  closingKm: z.string().optional(),
});

export type StaffWaybillFormValues = z.infer<typeof staffWaybillBaseSchema>;

export type StaffWaybillMode = "send" | "backfill";

export function vehicleBelongsToOrg(
  vehicleId: string,
  organisationVehicleIds: ReadonlySet<string>
): boolean {
  return organisationVehicleIds.has(vehicleId);
}

export function resolveDefaultVehicleIdForDriver(
  driverId: string,
  driverVehicleMap: ReadonlyMap<string, string>
): string {
  if (!driverId) return "";
  return driverVehicleMap.get(driverId) ?? "";
}

export function validateStaffWaybillSubmit(
  mode: StaffWaybillMode,
  values: StaffWaybillFormValues,
  organisationVehicleIds: ReadonlySet<string>
): { ok: true } | { ok: false; message: string } {
  const parsed = staffWaybillBaseSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? "Invalid form" };
  }

  if (mode === "backfill") {
    const vehicleId = values.vehicleId?.trim();
    if (!vehicleId) {
      return { ok: false, message: "Select a vehicle" };
    }
    if (!vehicleBelongsToOrg(vehicleId, organisationVehicleIds)) {
      return { ok: false, message: "Vehicle must belong to this organisation" };
    }
  } else if (values.vehicleId?.trim()) {
    if (!vehicleBelongsToOrg(values.vehicleId.trim(), organisationVehicleIds)) {
      return { ok: false, message: "Vehicle must belong to this organisation" };
    }
  }

  return { ok: true };
}

export function formatVehicleOptionLabel(
  registration: string | null | undefined,
  name: string | null | undefined
): string {
  const reg = registration?.trim();
  if (reg) return reg;
  return name?.trim() || "Vehicle";
}
