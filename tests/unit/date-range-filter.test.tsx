import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { resolveDateRange } from "@/lib/date-range/sast-range";

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
    expect(apply).toBeDisabled();

    fireEvent.click(apply);
    expect(onCustomChange).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Custom date range" }), {
      key: "Enter",
    });
    expect(onCustomChange).not.toHaveBeenCalled();
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

    fireEvent.change(from, { target: { value: "99/99/9999" } });

    fireEvent.keyDown(
      screen.getByRole("dialog", { name: "Custom date range" }),
      { key: "Escape" }
    );
    expect(screen.queryByRole("dialog", { name: "Custom date range" })).toBeNull();
    expect(onCustomChange).toHaveBeenCalledTimes(1);
  });
});
