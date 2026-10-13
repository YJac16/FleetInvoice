import { PINNED_NEXT_VERSION } from "@/lib/next/next-version";
import { semverAtLeast } from "@/lib/next/semver";

/** Next.js 14.1+ syncs `useSearchParams` after `history.replaceState`. */
export function nextSupportsHistoryReplaceStateSync(): boolean {
  return semverAtLeast(PINNED_NEXT_VERSION, 14, 1);
}
