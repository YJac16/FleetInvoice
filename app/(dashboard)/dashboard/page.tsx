import type { Metadata } from "next";
import {
  Building2,
  Receipt,
  Truck,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionContext } from "@/services/profile.service";
import { formatFullName } from "@/utils/format";

export const metadata: Metadata = {
  title: "Dashboard",
};

const STAT_CARDS = [
  {
    title: "Active trips",
    value: "—",
    description: "Trip logging arrives in Phase 2",
    icon: Truck,
  },
  {
    title: "Drivers",
    value: "—",
    description: "Driver management UI is ready",
    icon: Users,
  },
  {
    title: "Companies",
    value: "—",
    description: "Customer directory placeholder",
    icon: Building2,
  },
  {
    title: "Invoices",
    value: "—",
    description: "Invoice generation is Phase 2+",
    icon: Receipt,
  },
] as const;

const ACTIVITY = [
  {
    title: "Foundation complete",
    detail: "Auth, roles, schema, and navigation are live.",
    badge: "Ready",
  },
  {
    title: "Supabase connected",
    detail: "Apply migrations to enable production data access.",
    badge: "Setup",
  },
  {
    title: "Next up",
    detail: "Trip logging, pricing, and invoice generation.",
    badge: "Phase 2",
  },
] as const;

export default async function DashboardPage() {
  const session = await getSessionContext();
  const name = formatFullName(session?.fullName);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hello, ${name}`}
        description="Your transport operations overview. Core modules are scaffolded and waiting for Phase 2 data flows."
        actions={
          <Badge variant="secondary" className="capitalize">
            {session?.role ?? "admin"}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="border-border/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              Phase 1 delivers the application foundation. Functional modules
              follow in later phases.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ACTIVITY.map((item) => (
              <div
                key={item.title}
                className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <Badge variant="outline">{item.badge}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Use the sidebar to explore placeholder modules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Drivers are limited to trips and settings. Admins can open every
              module.
            </p>
            <p>
              Dark mode, responsive navigation, and toast notifications are
              available across the app shell.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
