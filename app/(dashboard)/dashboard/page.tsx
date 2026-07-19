import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ListTodo,
  Plus,
  Truck,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TripStatusBadge } from "@/features/trips/components/trip-status-badge";
import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import { formatTripTime } from "@/lib/trips/filters";
import {
  getDemoSessionContext,
  getSessionContext,
} from "@/services/profile.service";
import { getDriverDashboardStats } from "@/services/trips.service";
import { dayjs } from "@/utils/dates";
import { getGreeting } from "@/utils/greeting";
import { formatFullName } from "@/utils/format";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const session =
    (await getSessionContext()) ??
    (!hasSupabaseConfig() ? getDemoSessionContext() : null);

  const name = formatFullName(session?.fullName);
  const greeting = getGreeting();
  const todayLabel = dayjs().format("dddd, D MMMM YYYY");

  if (session?.role === "driver") {
    const stats = await getDriverDashboardStats();

    const cards = [
      {
        title: "Today's Trips",
        value: stats.todayCount,
        icon: Truck,
        hint: "Logged today",
      },
      {
        title: "This Week's Trips",
        value: stats.weekCount,
        icon: CalendarCheck2,
        hint: "Since Monday",
      },
      {
        title: "Pending Trips",
        value: stats.pendingCount,
        icon: Clock3,
        hint: "Awaiting office review",
      },
      {
        title: "Approved Trips",
        value: stats.approvedCount,
        icon: CheckCircle2,
        hint: "Accepted by the office",
      },
    ] as const;

    return (
      <div className="space-y-8">
        <PageHeader
          title={`${greeting},`}
          description={
            <span className="block space-y-1">
              <span className="block text-2xl font-semibold tracking-tight text-foreground">
                {name}
              </span>
              <span className="block text-sm text-muted-foreground">
                {todayLabel}
              </span>
            </span>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                render={<Link href={ROUTES.tripsNew} />}
                className="min-h-11"
              >
                <Plus />
                New Trip
              </Button>
              <Button
                variant="outline"
                render={<Link href={ROUTES.trips} />}
                className="min-h-11"
              >
                <ListTodo />
                View My Trips
              </Button>
            </div>
          }
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.title}
                className="border-border/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="size-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {card.hint}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-muted-foreground" />
                Recent Trips
              </CardTitle>
              <CardDescription>Your latest submissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.recentTrips.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No trips yet. Log your first trip for today.
                </p>
              ) : (
                stats.recentTrips.map((trip) => (
                  <Link
                    key={trip.id}
                    href={ROUTES.tripDetail(trip.id)}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-3 transition-colors hover:bg-muted/60"
                  >
                    <div>
                      <p className="text-sm font-medium">{trip.company_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {dayjs(trip.trip_date).format("DD MMM")} ·{" "}
                        {formatTripTime(trip.trip_time)} · {trip.pickup_area} →{" "}
                        {trip.destination_area}
                      </p>
                    </div>
                    <TripStatusBadge status={trip.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="size-4 text-muted-foreground" />
                Upcoming Trips
              </CardTitle>
              <CardDescription>
                Pending trips from today onward
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.upcomingTrips.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming pending trips.
                </p>
              ) : (
                stats.upcomingTrips.map((trip) => (
                  <Link
                    key={trip.id}
                    href={ROUTES.tripDetail(trip.id)}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-3 transition-colors hover:bg-muted/60"
                  >
                    <div>
                      <p className="text-sm font-medium">{trip.company_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {dayjs(trip.trip_date).format("DD MMM")} ·{" "}
                        {formatTripTime(trip.trip_time)} · {trip.passengers}{" "}
                        passengers
                      </p>
                    </div>
                    <TripStatusBadge status={trip.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>
              Drivers can create and manage their own pending trips only.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              render={<Link href={ROUTES.tripsNew} />}
              className="min-h-11"
            >
              <Plus />
              New Trip
            </Button>
            <Button
              variant="outline"
              render={<Link href={ROUTES.trips} />}
              className="min-h-11"
            >
              View My Trips
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting}, ${name}`}
        description={todayLabel}
        actions={
          <Badge variant="secondary" className="capitalize">
            {session?.role ?? "admin"}
          </Badge>
        }
      />
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Admin workspace</CardTitle>
          <CardDescription>
            Driver trip capture is live in Phase 2. Pricing, invoice generation,
            and admin review tools arrive in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href={ROUTES.trips} />} className="min-h-11">
            Open Trips
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
