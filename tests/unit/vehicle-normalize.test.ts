import { describe, expect, it } from "vitest";

import { normalizeVehicleFields } from "@/features/vehicles/schemas/vehicle";

describe("normalizeVehicleFields", () => {
  const base = {
    name: "Bus 1",
    vehicle_type: "minibus" as const,
    status: "active" as const,
  };

  it("trims and nulls empty optional strings", () => {
    const result = normalizeVehicleFields({
      ...base,
      make: "  Toyota  ",
      model: "",
      model_year: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.make).toBe("Toyota");
      expect(result.data.model).toBeNull();
    }
  });

  it("rejects invalid model year", () => {
    const result = normalizeVehicleFields({
      ...base,
      model_year: "1800",
    });
    expect(result.ok).toBe(false);
  });
});
