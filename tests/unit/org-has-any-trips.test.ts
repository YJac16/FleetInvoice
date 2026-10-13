import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLimit = vi.fn();
const mockIs = vi.fn(() => ({ limit: mockLimit }));
const mockEq = vi.fn(() => ({ is: mockIs }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

import { orgHasAnyTrips } from "@/services/trips.service";

describe("orgHasAnyTrips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({ count: 1, error: null });
  });

  it("scopes to organisation and excludes soft-deleted rows", async () => {
    await orgHasAnyTrips("org-abc");

    expect(mockFrom).toHaveBeenCalledWith("trips");
    expect(mockSelect).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mockEq).toHaveBeenCalledWith("organisation_id", "org-abc");
    expect(mockIs).toHaveBeenCalledWith("deleted_at", null);
    expect(mockLimit).toHaveBeenCalledWith(1);
  });
});
