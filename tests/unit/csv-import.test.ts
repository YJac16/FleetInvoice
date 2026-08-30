import { describe, expect, it } from "vitest";

import { csvToObjects, parseCsv, objectsToCsv } from "@/features/import/lib/csv";
import {
  driverImportSchema,
  vehicleImportSchema,
} from "@/features/import/schemas/import-schemas";

describe("parseCsv", () => {
  it("parses simple and quoted fields", () => {
    const rows = parseCsv('name,note\n"Doe, Jane","hello ""world"""\n');
    expect(rows[0]).toEqual(["name", "note"]);
    expect(rows[1]).toEqual(["Doe, Jane", 'hello "world"']);
  });
});

describe("csvToObjects", () => {
  it("maps headers to lowercase keys", () => {
    const objects = csvToObjects("Full_Name,Email\nAda,ada@example.com\n");
    expect(objects[0]).toEqual({
      full_name: "Ada",
      email: "ada@example.com",
    });
  });
});

describe("objectsToCsv", () => {
  it("emits a header-only template", () => {
    expect(objectsToCsv(["full_name", "email"], [])).toBe(
      "full_name,email\n"
    );
  });
});

describe("import schemas", () => {
  it("accepts driver rows and defaults status", () => {
    const parsed = driverImportSchema.parse({
      full_name: "Sam Driver",
      license_number: "ABC123",
    });
    expect(parsed.status).toBe("active");
  });

  it("normalizes vehicle_type and capacity", () => {
    const parsed = vehicleImportSchema.parse({
      name: "Bus 1",
      vehicle_type: "BUS",
      capacity: "40",
    });
    expect(parsed.vehicle_type).toBe("bus");
    expect(parsed.capacity).toBe(40);
  });
});
