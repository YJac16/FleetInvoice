import { dayjs } from "@/utils/dates";
import type { TripFilterPreset } from "@/lib/trips/constants";
import type { TripWithDetails } from "@/types/database";

export function filterTrips(
  trips: TripWithDetails[],
  options: {
    search: string;
    preset: TripFilterPreset;
  }
): TripWithDetails[] {
  const search = options.search.trim().toLowerCase();
  const today = dayjs();

  return trips.filter((trip) => {
    if (options.preset === "today" && trip.trip_date !== today.format("YYYY-MM-DD")) {
      return false;
    }
    if (
      options.preset === "this_week" &&
      (trip.trip_date < today.startOf("isoWeek").format("YYYY-MM-DD") ||
        trip.trip_date > today.endOf("isoWeek").format("YYYY-MM-DD"))
    ) {
      return false;
    }
    if (
      options.preset === "this_month" &&
      (trip.trip_date < today.startOf("month").format("YYYY-MM-DD") ||
        trip.trip_date > today.endOf("month").format("YYYY-MM-DD"))
    ) {
      return false;
    }
    if (options.preset === "pending" && trip.status !== "pending") return false;
    if (options.preset === "approved" && trip.status !== "approved") return false;
    if (options.preset === "rejected" && trip.status !== "rejected") return false;

    if (!search) return true;

    const haystack = [
      trip.trip_date,
      trip.company_name,
      trip.status,
      trip.pickup_area,
      trip.destination_area,
      trip.vehicle_label,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function groupTripsByDate(
  trips: TripWithDetails[]
): { date: string; label: string; trips: TripWithDetails[] }[] {
  const groups = new Map<string, TripWithDetails[]>();

  for (const trip of trips) {
    const list = groups.get(trip.trip_date) ?? [];
    list.push(trip);
    groups.set(trip.trip_date, list);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, grouped]) => ({
      date,
      label: dayjs(date).format("dddd, D MMMM YYYY"),
      trips: grouped.sort((a, b) =>
        (b.trip_time ?? "").localeCompare(a.trip_time ?? "")
      ),
    }));
}

export function formatTripTime(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.slice(0, 5);
  return trimmed;
}
