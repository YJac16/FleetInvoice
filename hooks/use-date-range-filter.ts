"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  applyDateRangeToSearchParams,
  dateRangeFromSearchParams,
} from "@/lib/date-range/search-params";
import {
  type DateRangePreset,
  resolveDateRange,
  type ResolvedDateRange,
} from "@/lib/date-range/sast-range";

export function useDateRangeFilter(defaultPreset: DateRangePreset = "today") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = useMemo(
    () => dateRangeFromSearchParams(searchParams, defaultPreset),
    [searchParams, defaultPreset]
  );

  const replaceRange = useCallback(
    (next: ResolvedDateRange) => {
      const params = applyDateRangeToSearchParams(searchParams, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
