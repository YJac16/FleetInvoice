import "server-only";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

/**
 * Simple per-instance in-memory sliding-window limiter. Best-effort only
 * (serverless instances do not share memory) — adequate for a demo site.
 */
export function demoSwitchRateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 1000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

/** Test helper. */
export function resetDemoRateLimit() {
  hits.clear();
}
