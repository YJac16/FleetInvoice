import {
  STAFF_TRANSPORT_COMPANIES,
  STAFF_TRANSPORT_COMPANY_LABELS,
  type StaffTransportCompany,
} from "@/lib/constants";
import type { StaffTrip } from "@/types";

export function staffCompanyLabel(
  company: StaffTransportCompany | null | undefined
): string {
  if (!company) return "—";
  return STAFF_TRANSPORT_COMPANY_LABELS[company] ?? company;
}

export function staffCompanyOptions() {
  return STAFF_TRANSPORT_COMPANIES.map((value) => ({
    value,
    label: STAFF_TRANSPORT_COMPANY_LABELS[value],
  }));
}

export function tripDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function tripsForDay(trips: StaffTrip[], dateStr: string): StaffTrip[] {
  return trips.filter((t) => tripDayKey(t.planned_start) === dateStr);
}

export function activeTrip(trips: StaffTrip[]): StaffTrip | undefined {
  return trips.find((t) => t.status === "in_progress");
}

export function upcomingTrips(trips: StaffTrip[]): StaffTrip[] {
  return trips.filter((t) => t.status === "assigned" || t.status === "planned");
}

export function completedTrips(trips: StaffTrip[]): StaffTrip[] {
  return trips.filter((t) => t.status === "completed");
}
