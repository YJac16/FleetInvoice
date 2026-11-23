import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoRoleSwitcherPanel } from "@/components/demo/role-switcher-panel";

describe("DemoRoleSwitcherPanel", () => {
  it("shows a visible DEMO badge and the role options", () => {
    render(
      <DemoRoleSwitcherPanel
        currentEmail="demo-admin@example.com"
        options={[
          { role: "organisation_admin", label: "Admin" },
          { role: "driver", label: "Driver" },
        ]}
      />
    );
    expect(screen.getByText("DEMO")).toBeVisible();
    expect(screen.getByRole("option", { name: "Driver" })).toBeInTheDocument();
  });
});
