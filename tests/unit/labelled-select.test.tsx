import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LabelledSelect } from "@/features/trips/components/labelled-select";
import { formatVehicleOptionLabel } from "@/features/trips/lib/staff-waybill-form";

const VEHICLE_ID = "3f0c2a52-8d7e-4b0a-9a53-0d5f4f6f1c11";
const options = [
  { value: VEHICLE_ID, label: formatVehicleOptionLabel("CA 123-456", "Quantum") },
  { value: "other-id", label: formatVehicleOptionLabel(null, "Hilux") },
];

afterEach(cleanup);

describe("LabelledSelect", () => {
  it("shows the vehicle label, not the raw id, once selected", () => {
    render(
      <LabelledSelect
        value={VEHICLE_ID}
        onValueChange={vi.fn()}
        placeholder="Select vehicle"
        options={options}
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("CA 123-456");
    expect(trigger).not.toHaveTextContent(VEHICLE_ID);
  });

  it("falls back to the name when there is no registration", () => {
    render(
      <LabelledSelect
        value="other-id"
        onValueChange={vi.fn()}
        placeholder="Select vehicle"
        options={options}
      />
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Hilux");
  });

  it("shows the placeholder when nothing is selected", () => {
    render(
      <LabelledSelect
        value=""
        onValueChange={vi.fn()}
        placeholder="Select vehicle"
        options={options}
      />
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Select vehicle");
  });
});
