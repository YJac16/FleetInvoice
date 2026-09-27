export type VehicleLabelSource = {
  id?: string | null;
  name?: string | null;
  registration_number?: string | null;
  make?: string | null;
  model?: string | null;
};

export function formatVehicleLabel(vehicle: VehicleLabelSource): string {
  const makeModel = [vehicle.make?.trim(), vehicle.model?.trim()]
    .filter(Boolean)
    .join(" ");
  const name = vehicle.name?.trim() || makeModel || "";
  const registration = vehicle.registration_number?.trim() || "";
  if (name && registration) return `${name} / ${registration}`;
  if (name) return name;
  if (registration) return registration;
  return vehicle.id?.trim() || "Vehicle";
}
