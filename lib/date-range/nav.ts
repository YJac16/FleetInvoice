import {
  FROM_PARAM,
  RANGE_PARAM,
  TO_PARAM,
} from "@/lib/date-range/search-params";

/** Dashboard / ops list routes that share the date-range query string. */
export const DATE_RANGE_NAV_PATHS = new Set([
  "/dashboard",
  "/trips",
  "/invoices",
  "/dispatch",
  "/staff-transport",
]);

export function dateRangeQueryString(
  searchParams: URLSearchParams
): string | null {
  const preset = searchParams.get(RANGE_PARAM);
  if (!preset) return null;
  const parts = new URLSearchParams();
  parts.set(RANGE_PARAM, preset);
  if (preset === "custom") {
    const from = searchParams.get(FROM_PARAM);
    const to = searchParams.get(TO_PARAM);
    if (from) parts.set(FROM_PARAM, from);
    if (to) parts.set(TO_PARAM, to);
  }
  return parts.toString();
}

export function hrefWithDateRange(
  href: string,
  searchParams: URLSearchParams
): string {
  const [path, existingQs] = href.split("?");
  if (!DATE_RANGE_NAV_PATHS.has(path)) {
    return href;
  }
  const rangeQs = dateRangeQueryString(searchParams);
  if (!rangeQs) return path;
  if (existingQs) {
    const merged = new URLSearchParams(existingQs);
    const rangeParams = new URLSearchParams(rangeQs);
    rangeParams.forEach((value, key) => merged.set(key, value));
    return `${path}?${merged.toString()}`;
  }
  return `${path}?${rangeQs}`;
}
