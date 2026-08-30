import type { TripEventType, TripStatus } from "@/lib/constants";

/**
 * Pure trip status machine helpers. Must mirror the `transition_trip` RPC
 * in supabase/migrations/00006_phase4_driver_portal.sql:
 *   - started      : from planned|assigned      -> in_progress
 *   - arrived_stop  : from in_progress            -> in_progress
 *   - completed     : from in_progress|assigned  -> completed
 *   - cancelled     : from anything but completed/cancelled -> cancelled
 *
 * Note: the `assigned` event type is only ever emitted by the `assign_trip`
 * RPC (not `transition_trip`), so it is not a valid client-triggered
 * transition here.
 */
type TransitionRule = {
  event: TripEventType;
  isAllowed: (from: TripStatus) => boolean;
  to: TripStatus;
};

const TRANSITION_RULES: TransitionRule[] = [
  {
    event: "started",
    isAllowed: (from) => from === "planned" || from === "assigned",
    to: "in_progress",
  },
  {
    event: "arrived_stop",
    isAllowed: (from) => from === "in_progress",
    to: "in_progress",
  },
  {
    event: "completed",
    isAllowed: (from) => from === "in_progress" || from === "assigned",
    to: "completed",
  },
  {
    event: "cancelled",
    isAllowed: (from) => from !== "completed" && from !== "cancelled",
    to: "cancelled",
  },
];

function findRule(event: TripEventType): TransitionRule | undefined {
  return TRANSITION_RULES.find((rule) => rule.event === event);
}

export function canTransition(
  fromStatus: TripStatus,
  event: TripEventType
): boolean {
  const rule = findRule(event);
  if (!rule) return false;
  return rule.isAllowed(fromStatus);
}

export function nextStatus(
  fromStatus: TripStatus,
  event: TripEventType
): TripStatus | null {
  const rule = findRule(event);
  if (!rule || !rule.isAllowed(fromStatus)) return null;
  return rule.to;
}
