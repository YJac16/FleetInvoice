import type { StaffTripStatus, TripStatus } from "@/lib/constants";

const STAFF_FLOW: Record<
  StaffTripStatus,
  { label: string; next?: StaffTripStatus; action?: string }
> = {
  assigned: { label: "Assigned", next: "en_route_pickup", action: "Start trip" },
  en_route_pickup: {
    label: "En route to pickup",
    next: "en_route_company",
    action: "En route to company",
  },
  en_route_company: {
    label: "En route to company",
    next: "completed",
    action: "End trip",
  },
  completed: { label: "Completed" },
  cancelled: { label: "Cancelled" },
};

export function isStaffEnRouteStatus(
  status: TripStatus
): status is StaffTripStatus {
  return status in STAFF_FLOW;
}

export function staffTripActionLabel(status: TripStatus): string | null {
  if (!isStaffEnRouteStatus(status)) return null;
  return STAFF_FLOW[status].action ?? null;
}

export function staffTripStatusLabel(status: TripStatus): string {
  if (isStaffEnRouteStatus(status)) return STAFF_FLOW[status].label;
  return status;
}

export function canStartStaffTrip(status: TripStatus): boolean {
  return status === "assigned" || status === "planned";
}

export function canAdvanceStaffTrip(status: TripStatus): boolean {
  return status === "en_route_pickup";
}

export function canEndStaffTrip(status: TripStatus): boolean {
  return status === "en_route_company";
}

export function isActiveStaffTrip(status: TripStatus): boolean {
  return status === "en_route_pickup" || status === "en_route_company";
}
