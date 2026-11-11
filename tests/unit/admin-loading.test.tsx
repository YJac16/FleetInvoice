import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminQueryGate,
  resolveAdminQueryPhase,
} from "@/components/admin/admin-loading";
import { BusyButton } from "@/components/admin/busy-button";
import { GoOpsLoader } from "@/components/brand/goops-loader";

describe("resolveAdminQueryPhase", () => {
  it("shows a loader on the first fetch", () => {
    expect(
      resolveAdminQueryPhase({
        isLoading: true,
        isFetching: true,
        isError: false,
        data: undefined,
      })
    ).toBe("loading");
  });

  it("keeps a placeholder list on screen while a new range loads", () => {
    expect(
      resolveAdminQueryPhase({
        isLoading: false,
        isFetching: true,
        isError: false,
        data: [{ id: "1" }],
      })
    ).toBe("ready");
  });

  it("shows an error when the fetch failed and there is nothing to show", () => {
    expect(
      resolveAdminQueryPhase({
        isLoading: false,
        isFetching: false,
        isError: true,
        data: undefined,
      })
    ).toBe("error");
  });

  it("treats a coerced empty trips array as a failed load", () => {
    expect(
      resolveAdminQueryPhase({
        isLoading: false,
        isFetching: false,
        isError: true,
        data: [],
      })
    ).toBe("error");
  });

  it("shows the loader again while that failed fetch retries", () => {
    expect(
      resolveAdminQueryPhase({
        isLoading: false,
        isFetching: true,
        isError: true,
        data: [],
      })
    ).toBe("loading");
  });

  it("keeps rows that were already loaded when a refresh fails", () => {
    expect(
      resolveAdminQueryPhase({
        isLoading: false,
        isFetching: false,
        isError: true,
        data: [{ id: "1" }],
      })
    ).toBe("ready");
  });
});

describe("admin loading UI", () => {
  afterEach(() => {
    cleanup();
  });

  it("draws the GoOps mark with a visible caption", () => {
    render(<GoOpsLoader layout="block" size="lg" label="Loading trips" />);
    expect(screen.getByRole("status").textContent).toContain("Loading trips");
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "/brand/goops-mark-ui.png"
    );
    expect(document.querySelector("style")?.textContent).toContain(
      "prefers-reduced-motion"
    );
  });

  it("renders an error with retry and otherwise the children", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <AdminQueryGate
        label="Loading invoices"
        isLoading={false}
        isError
        error={new Error("network down")}
        onRetry={onRetry}
      >
        <p>Invoices</p>
      </AdminQueryGate>
    );

    expect(screen.getByRole("alert").textContent).toContain("network down");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Invoices")).toBeNull();

    rerender(
      <AdminQueryGate label="Loading invoices" isLoading={false} data={[]}>
        <p>Invoices</p>
      </AdminQueryGate>
    );
    expect(screen.getByText("Invoices")).toBeTruthy();
  });

  it("disables a busy button and swaps in the mark", () => {
    const onClick = vi.fn();
    render(
      <BusyButton pending pendingLabel="Saving…" onClick={onClick}>
        Save
      </BusyButton>
    );

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("[data-slot='goops-loader']")).toBeTruthy();
    expect(screen.queryByText("Save")).toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
