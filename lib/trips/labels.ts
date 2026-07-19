export function formatVehicleLabel(vehicle: {
  registration: string;
  make: string;
  model: string;
}): string {
  return `${vehicle.registration} · ${vehicle.make} ${vehicle.model}`;
}
