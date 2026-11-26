import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardGridSkeleton } from "@/components/shared/card-grid-skeleton";
import { CountUp, parseCountUpValue } from "@/components/shared/count-up";
import { BusyButton } from "@/components/ui/busy-button";

function mockMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("CountUp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let now = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb((now += 50)), 50) as unknown as number
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses numbers and ZAR strings, rejects labels", () => {
    expect(parseCountUpValue(42)).toMatchObject({ target: 42, decimals: 0 });
    expect(parseCountUpValue("R1,990")).toMatchObject({ prefix: "R", target: 1990, grouped: true });
    expect(parseCountUpValue("R1,990.50")).toMatchObject({ target: 1990.5, decimals: 2 });
    expect(parseCountUpValue("—")).toBeNull();
    expect(parseCountUpValue("3 trips")).toBeNull();
  });

  it.each([[42], ["R1,990"], ["R1,990.50"]])("ends at the exact value %s", (value) => {
    mockMotion(false);
    const { container } = render(<CountUp value={value} />);
    expect(container.textContent).not.toBe(String(value)); // started from zero
    act(() => void vi.advanceTimersByTime(1000));
    expect(container.textContent).toBe(String(value));
  });

  it("keeps grouping and the R prefix mid-animation", () => {
    mockMotion(false);
    const { container } = render(<CountUp value="R12,345" />);
    act(() => void vi.advanceTimersByTime(150));
    expect(container.textContent).toMatch(/^R\d{1,3}(,\d{3})*$/);
  });

  it("does not animate under reduced motion or for non-numeric values", () => {
    mockMotion(true);
    const a = render(<CountUp value="R1,990" />);
    expect(a.container.textContent).toBe("R1,990");
    a.unmount();
    mockMotion(false);
    const b = render(<CountUp value="—" />);
    act(() => void vi.advanceTimersByTime(50));
    expect(b.container.textContent).toBe("—");
  });

  it("does not restart when the parent re-renders", () => {
    mockMotion(false);
    const { container, rerender } = render(<CountUp value={10} />);
    act(() => void vi.advanceTimersByTime(1000));
    rerender(<CountUp value={10} />);
    expect(container.textContent).toBe("10");
  });
});

describe("BusyButton", () => {
  afterEach(cleanup);

  it("ignores clicks while pending and marks aria-busy", () => {
    const onClick = vi.fn();
    render(<BusyButton pending onClick={onClick}>Go</BusyButton>);
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
  });

  it("clicks through when idle and gates motion on reduced-motion classes", () => {
    const onClick = vi.fn();
    render(<BusyButton onClick={onClick}>Go</BusyButton>);
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn.className).toContain("motion-safe:duration-150");
    expect(btn.className).toContain("motion-reduce:active:scale-100");
  });
});

describe("motion CSS and skeleton fade", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("fades CardGridSkeleton once (300ms) via PageFadeIn", () => {
    const { container } = render(<CardGridSkeleton cards={2} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("motion-safe:duration-300");
    expect(root.className).toContain("motion-reduce:animate-none");
    expect(root).toHaveAttribute("data-skeleton-fade");
    cleanup();
  });

  it("skeleton fade, toasts are <=300ms and disabled under reduced motion", () => {
    expect(css).toContain("skeleton-fade-in 300ms");
    expect(css).toContain("[data-sonner-toast] {\n    transition: transform 300ms, opacity 300ms");
    const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toContain('[data-slot="skeleton"] { animation: none; }');
    expect(reduce).toContain("[data-sonner-toast] { transition: none !important");
  });

  it("demo bar honours safe areas and sits above the tab bar", () => {
    expect(css).toContain("bottom: var(--demo-bar-offset)");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(css).toMatch(/body:has\(\[data-bottom-nav\]\)[^}]*--bottom-nav-height/);
    for (const f of ["components/layout/driver-shell.tsx", "components/layout/employee-shell.tsx"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).toContain('data-bottom-nav=""');
    }
  });
});
