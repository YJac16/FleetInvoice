import { describe, expect, it } from "vitest";

import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";

describe("formatVehicleLabel", () => {
  it("joins name and registration", () => {
    expect(
      formatVehicleLabel({
        id: "a7000000-0000-4000-8000-000000000001",
        name: "Quantam 1",
        registration_number: "CA 123-456",
      })
    ).toBe("Quantam 1 / CA 123-456");
  });

  it("falls back to name, then registration, then id", () => {
    expect(formatVehicleLabel({ name: "Quantam 1" })).toBe("Quantam 1");
    expect(formatVehicleLabel({ registration_number: "CA 123-456" })).toBe(
      "CA 123-456"
    );
    expect(
      formatVehicleLabel({ id: "a7000000-0000-4000-8000-000000000001" })
    ).toBe("a7000000-0000-4000-8000-000000000001");
  });
});
