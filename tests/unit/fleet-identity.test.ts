import { describe, expect, it } from "vitest";

import { driverSchema } from "@/features/drivers/schemas/driver";
import {
  formatMakeModel,
  formatOdometerKm,
  parseKm,
  parseYear,
  vehicleSchema,
} from "@/features/vehicles/schemas/vehicle";

describe("driverSchema", () => {
  it("requires a name and accepts PDP and tour guide", () => {
    const parsed = driverSchema.parse({
      full_name: "Shaheed J",
      license_number: "EB123",
      pdp_number: "508224/14",
      tour_guide: true,
      additional_qualifications: "First aid",
      status: "active",
    });
    expect(parsed.tour_guide).toBe(true);
    expect(parsed.pdp_number).toBe("508224/14");
  });
});

describe("vehicleSchema helpers", () => {
  it("parses year and km", () => {
    expect(parseYear("2025")).toBe(2025);
    expect(parseYear("")).toBeNull();
    expect(parseKm("12000")).toBe(12000);
    expect(parseKm("-1")).toBeNull();
  });

  it("formats make/model and km", () => {
    expect(formatMakeModel({ make: "Suzuki", model: "XL6", name: "Fleet 1" })).toBe(
      "Suzuki XL6"
    );
    expect(formatMakeModel({ name: "Personal vehicle" })).toBe("Personal vehicle");
    expect(formatOdometerKm(12000)).toBe("12,000 km");
    expect(formatOdometerKm(null)).toBe("—");
  });

  it("accepts NaTIS and current km on the vehicle form", () => {
    const parsed = vehicleSchema.parse({
      name: "02220WP",
      registration_number: "02220WP",
      make: "Suzuki",
      model: "XL6",
      year: "2025",
      vehicle_type: "other",
      original_natis_in_file: true,
      current_odometer_km: "5000",
      status: "active",
    });
    expect(parsed.original_natis_in_file).toBe(true);
    expect(parsed.make).toBe("Suzuki");
  });
});
