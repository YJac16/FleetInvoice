import { applyDateRangeToSearchParams } from "@/lib/date-range/search-params";
import type { ResolvedDateRange } from "@/lib/date-range/sast-range";

export function buildRangeHref(
  pathname: string,
  base: URLSearchParams,
  range: ResolvedDateRange
): string {
  const params = applyDateRangeToSearchParams(base, range);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export type CommitRangeUrlUpdateOptions = {
  useHistoryReplaceState: boolean;
  routerReplace: (href: string) => void;
  historyReplaceState?: (
    state: unknown,
    unused: string,
    url: string | URL | null
  ) => void;
  getScrollY?: () => number;
  restoreScroll?: (y: number) => void;
  requestAnimationFrame?: (callback: () => void) => number;
};

export function commitRangeUrlUpdate(
  href: string,
  options: CommitRangeUrlUpdateOptions
): void {
  const {
    useHistoryReplaceState,
    routerReplace,
    historyReplaceState,
    getScrollY = () => (typeof window !== "undefined" ? window.scrollY : 0),
    restoreScroll = (y) => {
      if (typeof window !== "undefined") window.scrollTo(0, y);
    },
    requestAnimationFrame = (cb) => {
      if (typeof window !== "undefined") return window.requestAnimationFrame(cb);
      cb();
      return 0;
    },
  } = options;

  if (useHistoryReplaceState && historyReplaceState) {
    historyReplaceState(null, "", href);
    return;
  }

  const scrollY = getScrollY();
  routerReplace(href);
  requestAnimationFrame(() => restoreScroll(scrollY));
}
