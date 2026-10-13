"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  buildRangeHref,
  commitRangeUrlUpdate,
} from "@/lib/date-range/replace-range-url";
import { dateRangeFromSearchParams } from "@/lib/date-range/search-params";
import {
  type DateRangePreset,
  resolveDateRange,
  type ResolvedDateRange,
} from "@/lib/date-range/sast-range";
import { nextSupportsHistoryReplaceStateSync } from "@/lib/next/supports-history-url-sync";

export function useDateRangeFilter(defaultPreset: DateRangePreset = "this_week") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = useMemo(
    () => dateRangeFromSearchParams(searchParams, defaultPreset),
    [searchParams, defaultPreset]
  );

  const replaceRange = useCallback(
    (next: ResolvedDateRange) => {
      const href = buildRangeHref(pathname, searchParams, next);

      if (typeof window === "undefined") {
        router.replace(href, { scroll: false });
        return;
      }

      commitRangeUrlUpdate(href, {
        useHistoryReplaceState: nextSupportsHistoryReplaceStateSync(),
        routerReplace: (url) => router.replace(url, { scroll: false }),
        historyReplaceState: (state, unused, url) =>
          window.history.replaceState(state, unused, url),
      });
    },
    [pathname, router, searchParams]
  );

  const setPreset = useCallback(
    (preset: DateRangePreset) => {
      replaceRange(resolveDateRange(preset, range.from, range.to));
    },
    [range.from, range.to, replaceRange]
  );

  const setCustomRange = useCallback(
    (from: string, to: string) => {
      replaceRange(resolveDateRange("custom", from, to));
    },
    [replaceRange]
  );

  return { range, setPreset, setCustomRange };
}
