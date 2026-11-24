import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
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

  it("server-renders both variants with no explicit preference (CSS picks by viewport)", () => {
    const html = renderToString(panel());
    expect(html).toContain('data-pref="default"');
    expect(html).toContain("data-demo-bar-pill");
    expect(html).toContain("data-demo-bar-expanded");
    expect(html).not.toContain('data-pref="expanded"');
  });

  it("globals.css hides the expanded bar and shows the pill under 640px unless expanded", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const media = css.slice(css.indexOf("@media (max-width: 639px)"));
    expect(media).toContain('[data-demo-bar]:not([data-pref="expanded"]) [data-demo-bar-pill] { display: flex; }');
    expect(media).toContain('[data-demo-bar]:not([data-pref="expanded"]) [data-demo-bar-expanded] { display: none; }');
    expect(css).toContain('[data-demo-bar][data-pref="collapsed"] [data-demo-bar-expanded] { display: none; }');
  });

  it("does not set an explicit preference on a fresh load, at any width", () => {
    setWidth(320);
    render(panel());
    expect(screen.getByTestId("demo-role-switcher")).toHaveAttribute("data-pref", "default");
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Admin", { selector: "span" })).toBeInTheDocument();
  });

  it("persists the toggle in localStorage across remounts", () => {
    setWidth(320);
    const first = render(panel());
    fireEvent.click(screen.getByRole("button", { name: /show demo role switcher/i }));
    expect(screen.getByTestId("demo-role-switcher")).toHaveAttribute("data-pref", "expanded");
    expect(window.localStorage.getItem(DEMO_BAR_STORAGE_KEY)).toBe("0");
    first.unmount();

    render(panel()); // still narrow, but stored preference wins
    expect(screen.getByTestId("demo-role-switcher")).toHaveAttribute("data-pref", "expanded");

    fireEvent.click(screen.getByRole("button", { name: /collapse demo role switcher/i }));
    expect(screen.getByTestId("demo-role-switcher")).toHaveAttribute("data-pref", "collapsed");
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
