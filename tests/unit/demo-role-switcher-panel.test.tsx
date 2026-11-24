import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_BAR_STORAGE_KEY,
  DemoRoleSwitcherPanel,
} from "@/components/demo/role-switcher-panel";

const options = [
  { role: "organisation_admin" as const, label: "Admin" },
  { role: "driver" as const, label: "Driver" },
];

function panel() {
  return (
    <DemoRoleSwitcherPanel currentEmail="demo-admin@example.com" options={options} />
  );
}

function setWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
}

describe("DemoRoleSwitcherPanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    setWidth(1024);
  });

  it("shows a visible DEMO badge and the role options when expanded", () => {
    setWidth(1024);
    render(panel());
    expect(screen.getByText("DEMO")).toBeVisible();
    expect(screen.getByRole("option", { name: "Driver" })).toBeInTheDocument();
  });

  it("is collapsed by default under 640px, showing the current role", () => {
    setWidth(320);
    render(panel());
    expect(screen.getByTestId("demo-role-switcher")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeVisible();
    expect(screen.getByText("Admin")).toBeVisible();
  });

  it("is expanded by default at 640px and wider", () => {
    setWidth(640);
    render(panel());
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("persists the toggle in localStorage across remounts", () => {
    setWidth(320);
    const first = render(panel());
    fireEvent.click(screen.getByRole("button", { name: /show demo role switcher/i }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(window.localStorage.getItem(DEMO_BAR_STORAGE_KEY)).toBe("0");
    first.unmount();

    render(panel()); // still narrow, but stored preference wins
    expect(screen.getByRole("combobox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /collapse demo role switcher/i }));
    expect(window.localStorage.getItem(DEMO_BAR_STORAGE_KEY)).toBe("1");
  });

  it("reserves bottom space for the bar and cleans up on unmount", () => {
    setWidth(1024);
    const { unmount } = render(panel());
    expect(document.documentElement.style.getPropertyValue("--demo-bar-height")).not.toBe("");
    expect(document.body.style.paddingBottom).toContain("--demo-bar-height");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--demo-bar-height")).toBe("");
    expect(document.body.style.paddingBottom).toBe("");
  });
});
