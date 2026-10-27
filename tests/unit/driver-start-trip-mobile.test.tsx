import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StartTripDialog } from "@/features/driver-portal/components/start-trip-dialog";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import { useVisualViewportDialogStyle } from "@/hooks/use-visual-viewport-dialog";
import type { StaffTrip } from "@/types";

const LONG_AREA = "Cape Town International Airport → The Table Bay Hotel";

afterEach(() => {
  cleanup();
});

function trip(overrides: Partial<StaffTrip> = {}): StaffTrip {
  return {
    id: "trip-1",
    organisation_id: "org-1",
    route_id: null,
    schedule_id: null,
    company_id: null,
    planned_start: "2026-10-27T16:00:00.000Z",
    planned_end: null,
    status: "assigned",
    generation_key: null,
    notes: null,
    service_locations: null,
    created_by: null,
    created_at: "2026-10-27T00:00:00.000Z",
    updated_at: "2026-10-27T00:00:00.000Z",
    deleted_at: null,
    is_staff_transport: true,
    staff_company: null,
    area_text: LONG_AREA,
    pax_count: 1,
    opening_km: null,
    closing_km: null,
    total_km: null,
    waybill_confirmed_at: null,
    staff_started_at: null,
    staff_completed_at: null,
    companies: null,
    ...overrides,
  };
}

describe("StaffTripCard empty name line", () => {
  it("hides the dash when company and guest fields are empty and wraps a long address", () => {
    render(<StaffTripCard trip={trip()} />);

    expect(screen.getByText(LONG_AREA)).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
    expect(screen.getByText(LONG_AREA).className).toContain("break-words");
    expect(screen.getByText(LONG_AREA).className).toContain("[overflow-wrap:anywhere]");
  });

  it("hides a blank address row and still shows a joined company name", () => {
    render(
      <StaffTripCard
        trip={trip({
          area_text: "  ",
          service_locations: null,
          companies: { name: "Table Bay Transfers" },
        })}
      />
    );

    expect(screen.getByText("Table Bay Transfers")).toBeInTheDocument();
    expect(screen.queryByText(LONG_AREA)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("Start trip dialog on a phone", () => {
  it("uses the shared dialog that stays inside the viewport", () => {
    render(
      <StartTripDialog
        open
        onOpenChange={() => undefined}
        trip={trip()}
        onConfirm={() => undefined}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("inset-x-4");
    expect(dialog.className).toContain("max-sm:max-w-[calc(100dvw-2rem)]");
    expect(dialog.className).toContain("min-w-0");
    expect(
      screen.getByText("I confirm company, time, area and pax match the waybill")
        .className
    ).toContain("break-words");
    expect(screen.getByRole("button", { name: "Start trip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

function installViewport(innerHeight: number, height: number, offsetTop: number) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: innerHeight,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      height,
      offsetTop,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
}

function ViewportProbe() {
  const style = useVisualViewportDialogStyle();
  return (
    <div
      data-testid="viewport-style"
      data-top={style?.top ?? ""}
      data-max-height={style?.maxHeight ?? ""}
      data-transform={style?.transform ?? ""}
    />
  );
}

describe("useVisualViewportDialogStyle", () => {
  it("pins the dialog to the visible area while the keyboard is open", async () => {
    installViewport(800, 320, 40);
    render(<ViewportProbe />);
    await waitFor(() => {
      const node = screen.getByTestId("viewport-style");
      expect(node.getAttribute("data-top")).toBe("52");
      expect(node.getAttribute("data-max-height")).toBe("296");
      expect(node.getAttribute("data-transform")).toBe("none");
    });
  });

  it("leaves the dialog centered when the keyboard is closed", async () => {
    installViewport(800, 760, 0);
    render(<ViewportProbe />);
    await waitFor(() => {
      const node = screen.getByTestId("viewport-style");
      expect(node.getAttribute("data-top")).toBe("");
      expect(node.getAttribute("data-max-height")).toBe("");
      expect(node.getAttribute("data-transform")).toBe("");
    });
  });
});
