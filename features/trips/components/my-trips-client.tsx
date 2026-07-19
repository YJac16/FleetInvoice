"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBar } from "@/components/shared/search-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TripStatusBadge } from "@/features/trips/components/trip-status-badge";
import { ROUTES } from "@/lib/constants";
import {
  TRIP_FILTER_PRESETS,
  canDriverDeleteTrip,
  canDriverEditTrip,
  type TripFilterPreset,
} from "@/lib/trips/constants";
import {
  filterTrips,
  formatTripTime,
  groupTripsByDate,
} from "@/lib/trips/filters";
import { cn } from "@/lib/utils";
import { deleteTrip } from "@/services/trips.service";
import type { TripWithDetails } from "@/types/database";
import { dayjs } from "@/utils/dates";

interface MyTripsClientProps {
  trips: TripWithDetails[];
}

type ViewMode = "table" | "timeline";

export function MyTripsClient({ trips }: MyTripsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<TripFilterPreset>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => filterTrips(trips, { search, preset }),
    [trips, search, preset]
  );

  const timeline = useMemo(() => groupTripsByDate(filtered), [filtered]);

  function onDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteTrip(deleteId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Trip deleted");
      setDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Trips"
        description="Your personal trip history. Pricing is never shown."
        actions={
          <Button render={<Link href={ROUTES.tripsNew} />} className="min-h-11">
            <Plus />
            New Trip
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by date, company, or status…"
          className="max-w-none"
        />

        <div className="flex flex-wrap gap-2">
          {TRIP_FILTER_PRESETS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPreset(item.value)}
              className={cn(
                "min-h-10 rounded-full border px-3.5 text-sm font-medium transition-colors",
                preset === item.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={view === "table" ? "default" : "outline"}
            size="sm"
            className="min-h-10"
            onClick={() => setView("table")}
          >
            <LayoutList />
            Table
          </Button>
          <Button
            type="button"
            variant={view === "timeline" ? "default" : "outline"}
            size="sm"
            className="min-h-10"
            onClick={() => setView("timeline")}
          >
            <CalendarDays />
            Timeline
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No trips match"
          description="Try another filter, or log a new trip from the field."
          action={
            <Button render={<Link href={ROUTES.tripsNew} />}>
              <Plus />
              New Trip
            </Button>
          }
        />
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Passengers</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {dayjs(trip.trip_date).format("DD MMM YYYY")}
                    </TableCell>
                    <TableCell>{formatTripTime(trip.trip_time)}</TableCell>
                    <TableCell>{trip.company_name}</TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {trip.vehicle_label}
                    </TableCell>
                    <TableCell>{trip.passengers}</TableCell>
                    <TableCell>{trip.pickup_area}</TableCell>
                    <TableCell>{trip.destination_area}</TableCell>
                    <TableCell>
                      <TripStatusBadge status={trip.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <TripActions
                        trip={trip}
                        onDelete={() => setDeleteId(trip.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {timeline.map((group) => (
            <section key={group.date} className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {group.label}
              </h2>
              <div className="space-y-3">
                {group.trips.map((trip) => (
                  <article
                    key={trip.id}
                    className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatTripTime(trip.trip_time)}
                        </p>
                        <p className="mt-1 font-medium">{trip.company_name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {trip.pickup_area} → {trip.destination_area}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {trip.passengers}{" "}
                          {trip.passengers === 1 ? "Passenger" : "Passengers"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <TripStatusBadge status={trip.status} />
                        <TripActions
                          trip={trip}
                          onDelete={() => setDeleteId(trip.id)}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete this trip?"
        description="Pending trips can be deleted. This cannot be undone."
        confirmLabel="Delete trip"
        variant="destructive"
        loading={isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}

function TripActions({
  trip,
  onDelete,
}: {
  trip: TripWithDetails;
  onDelete: () => void;
}) {
  const editable = canDriverEditTrip(trip.status);
  const deletable = canDriverDeleteTrip(trip.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="min-h-10 min-w-10"
            aria-label="Trip actions"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={ROUTES.tripDetail(trip.id)} />}>
          <Pencil />
          {editable ? "Edit" : "View"}
        </DropdownMenuItem>
        {deletable ? (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
