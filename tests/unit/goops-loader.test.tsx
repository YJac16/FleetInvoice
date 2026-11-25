import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GoOpsLoader } from "@/components/brand/goops-loader";

describe("GoOpsLoader", () => {
  it("exposes role=status and aria-label=Loading", () => {
    render(<GoOpsLoader />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("hides the orbit and stops animation under prefers-reduced-motion", () => {
    const { container } = render(<GoOpsLoader />);
    const css = container.querySelector("style")?.textContent ?? "";
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("animation:none");
    expect(reduced).toMatch(/\.goops-loader__orbit\{display:none\}/);
    // static official mark stays rendered
    expect(container.querySelector(".goops-loader__breathe path")).toBeTruthy();
  });

  it("gives two mounted copies unique gradient ids", () => {
    const { container } = render(
      <>
        <GoOpsLoader />
        <GoOpsLoader />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("linearGradient")).map((g) => g.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(container.innerHTML).toContain(`url(#${id})`);
    }
  });
});
