import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { CUSTOM_RANGE_ORDER_ERROR } from "@/lib/date-range/custom-range-draft";
import { formatRangeLabel, resolveDateRange } from "@/lib/date-range/sast-range";

describe("DateRangeFilter custom panel", () => {
  const range = resolveDateRange("this_week");
  const onCustomChange = vi.fn();
  const onPresetChange = vi.fn();

  afterEach(() => {
    cleanup();
    onCustomChange.mockClear();
    onPresetChange.mockClear();
  });

  it("disables Apply for invalid dates and does not submit stale ISO values", () => {
    render(
      <DateRangeFilter
        range={range}
        onPresetChange={onPresetChange}
        onCustomChange={onCustomChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    const from = screen.getByLabelText("From");
    const apply = screen.getByRole("button", { name: "Apply" });

    fireEvent.change(from, { target: { value: "31/02/2026" } });
    expect(apply).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/valid dates in DD\/MM\/YYYY/i)).toBeTruthy();

    fireEvent.click(apply);
    expect(onCustomChange).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Custom date range" }), {
      key: "Enter",
    });
    expect(onCustomChange).not.toHaveBeenCalled();
  });

  it("does not show Custom (not applied) for an applied custom URL until drafts change", () => {
    const customRange = resolveDateRange("custom", "2026-09-01", "2026-09-10");
    render(
      <DateRangeFilter
        range={customRange}
        onPresetChange={onPresetChange}
        onCustomChange={onCustomChange}
      />
    );

    expect(screen.queryByText(/Custom \(not applied\)/)).toBeNull();
    expect(
      screen.getByText(`${formatRangeLabel(customRange)} · SAST`)
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Custom date range" })).toBeNull();
  });

  it("shows apply helper without duplicating the To field order error", () => {
    render(
      <DateRangeFilter
        range={range}
        onPresetChange={onPresetChange}
        onCustomChange={onCustomChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    fireEvent.change(from, { target: { value: "14/10/2026" } });
    fireEvent.change(to, { target: { value: "01/10/2026" } });

    expect(screen.getAllByText(CUSTOM_RANGE_ORDER_ERROR).length).toBe(1);
  });

  it("shows result count beside the range label when provided", () => {
    render(
      <DateRangeFilter
        range={range}
        onPresetChange={onPresetChange}
        onCustomChange={onCustomChange}
        resultCount={12}
        resultUnit={{ singular: "trip", plural: "trips" }}
      />
    );

    expect(screen.getByText(/12 trips/)).toBeTruthy();
  });

  it("applies on Enter when valid and resets drafts on Escape", () => {
    render(
      <DateRangeFilter
        range={range}
        onPresetChange={onPresetChange}
        onCustomChange={onCustomChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    const dialog = screen.getByRole("dialog", { name: "Custom date range" });

    fireEvent.change(from, { target: { value: "01/10/2026" } });
    fireEvent.change(to, { target: { value: "14/10/2026" } });

    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(onCustomChange).toHaveBeenCalledWith("2026-10-01", "2026-10-14");

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(from, { target: { value: "99/99/9999" } });

    fireEvent.keyDown(
      screen.getByRole("dialog", { name: "Custom date range" }),
      { key: "Escape" }
    );
    expect(screen.queryByRole("dialog", { name: "Custom date range" })).toBeNull();
    expect(onCustomChange).toHaveBeenCalledTimes(1);
  });
});
