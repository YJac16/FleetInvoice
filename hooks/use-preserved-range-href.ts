"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { hrefWithDateRange } from "@/lib/date-range/nav";

export function usePreservedRangeHref() {
  const searchParams = useSearchParams();
  return useCallback(
    (href: string) => hrefWithDateRange(href, searchParams),
    [searchParams]
  );
}
