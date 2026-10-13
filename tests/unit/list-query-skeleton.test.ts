import { describe, expect, it } from "vitest";

import {
  isRangeQueryRefreshing,
  useShowListSkeleton,
} from "@/hooks/use-list-query-skeleton";

describe("useShowListSkeleton", () => {
  it("shows skeleton when pending with no data", () => {
    expect(
      useShowListSkeleton({
        isPending: true,
        isFetching: true,
        data: undefined,
        isPlaceholderData: false,
      })
    ).toBe(true);
  });

  it("detects stale placeholder refresh", () => {
    expect(
      isRangeQueryRefreshing({
        isFetching: true,
        isPlaceholderData: true,
      })
    ).toBe(true);
    expect(
      isRangeQueryRefreshing({
        isFetching: false,
        isPlaceholderData: true,
      })
    ).toBe(false);
  });

  it("hides skeleton when placeholder data is shown during fetch", () => {
    expect(
      useShowListSkeleton({
        isPending: false,
        isFetching: true,
        data: [{ id: "1" }],
        isPlaceholderData: true,
      })
    ).toBe(false);
  });
});
