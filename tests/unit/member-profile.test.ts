import { describe, expect, it } from "vitest";

import {
  attachMemberProfiles,
  memberDisplayEmail,
  memberDisplayName,
  normalizeProfileEmbed,
} from "@/features/users/lib/member-profile";
import type { OrganisationMember } from "@/types";

const member = {
  id: "m1",
  organisation_id: "org1",
  user_id: "u2",
  role: "driver",
  status: "active",
  created_by: null,
  created_at: "2026-07-20T08:00:00.000Z",
  updated_at: "2026-07-20T08:00:00.000Z",
  deleted_at: null,
} satisfies OrganisationMember;

describe("normalizeProfileEmbed", () => {
  it("returns a single object embed", () => {
    expect(
      normalizeProfileEmbed({
        id: "u1",
        email: "admin@example.com",
        full_name: "Cape Shuttle Admin",
        avatar_url: null,
        phone: null,
      })
    ).toMatchObject({
      id: "u1",
      full_name: "Cape Shuttle Admin",
      email: "admin@example.com",
    });
  });

  it("unwraps a one-element array embed", () => {
    expect(
      normalizeProfileEmbed([
        {
          id: "u2",
          email: "thabo@example.com",
          full_name: "Thabo Nkosi",
        },
      ])
    ).toMatchObject({ id: "u2", full_name: "Thabo Nkosi" });
  });

  it("treats null and empty arrays as missing", () => {
    expect(normalizeProfileEmbed(null)).toBeNull();
    expect(normalizeProfileEmbed([])).toBeNull();
  });
});

describe("attachMemberProfiles", () => {
  it("fills blank name and email from hydrated profiles", () => {
    const rows = attachMemberProfiles(
      [{ ...member, profiles: null }],
      [
        {
          id: "u2",
          email: "thabo@cape-shuttle.example",
          full_name: "Thabo Nkosi",
          avatar_url: null,
          phone: null,
        },
      ]
    );
    expect(memberDisplayName(rows[0])).toBe("Thabo Nkosi");
    expect(memberDisplayEmail(rows[0])).toBe("thabo@cape-shuttle.example");
  });

  it("keeps dashes when no profile is available", () => {
    const rows = attachMemberProfiles([{ ...member, profiles: null }], []);
    expect(memberDisplayName(rows[0])).toBe("—");
    expect(memberDisplayEmail(rows[0])).toBe("—");
  });
});
