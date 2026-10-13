import packageJson from "../../package.json";

import { semverAtLeast } from "@/lib/next/semver";

/** Next.js 14.1+ syncs `useSearchParams` after `history.replaceState`. */
export function nextSupportsHistoryReplaceStateSync(): boolean {
  const nextVersion = packageJson.dependencies?.next ?? "0.0.0";
  return semverAtLeast(nextVersion, 14, 1);
}
