export type VehicleLabelSource = {
  id?: string | null;
  name?: string | null;
  registration_number?: string | null;
};

export function formatVehicleLabel(vehicle: VehicleLabelSource): string {
  const name = vehicle.name?.trim() || "";
  const registration = vehicle.registration_number?.trim() || "";
  if (name && registration) return `${name} / ${registration}`;
  if (name) return name;
  if (registration) return registration;
  return vehicle.id?.trim() || "Vehicle";
}
