"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Car, FileText, Fuel } from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listFuelFillups } from "@/services/fuel-fillups.service";
import { listInvoices } from "@/services/invoices.service";
import { listVehicles } from "@/services/vehicles.service";
import { queryKeys } from "@/utils/query";

const LINKS = [
  {
    href: "/company/fuel",
    title: "Fuel history",
    description: "Fill-ups for vehicles attributed to your companies.",
    icon: Fuel,
    permission: "fuel:view" as const,
  },
  {
    href: "/company/fleet",
    title: "Fleet",
    description: "Vehicles scoped to your companies.",
    icon: Car,
    permission: "vehicles:view" as const,
  },
  {
    href: "/company/invoices",
    title: "Invoices",
    description: "Period invoices — open Print for a browser PDF.",
    icon: FileText,
    permission: "invoices:view" as const,
  },
  {
    href: "/company/reports",
    title: "Reports",
    description: "Scoped operational reports and CSV export.",
    icon: BarChart3,
    permission: "reports:view" as const,
  },
];

export function CompanyHubPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const visible = LINKS.filter((link) => can(link.permission));

  const invoicesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.invoices(organisationId)
      : ["invoices", "none"],
    queryFn: () => listInvoices(organisationId!),
    enabled: Boolean(organisationId) && can("invoices:view"),
  });

  const vehiclesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.vehicles(organisationId)
      : ["vehicles", "none"],
    queryFn: () => listVehicles(organisationId!),
    enabled: Boolean(organisationId) && can("vehicles:view"),
  });

  const fuelQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.fuelFillups(organisationId)
      : ["fuel", "none"],
    queryFn: () => listFuelFillups(organisationId!),
    enabled: Boolean(organisationId) && can("fuel:view"),
  });

  const openInvoices = (invoicesQuery.data ?? []).filter(
    (inv) => inv.status === "issued" || inv.status === "draft"
  ).length;
  const fleetCount = vehiclesQuery.data?.length ?? 0;
  const recentFuel = (fuelQuery.data ?? []).slice(0, 5).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Company hub"
        description="Summary and shortcuts for your scoped companies."
      />

      {!organisationId ? null : invoicesQuery.isLoading ||
        vehiclesQuery.isLoading ||
        fuelQuery.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Open invoices</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums">
                {can("invoices:view") ? openInvoices : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Fleet vehicles</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums">
                {can("vehicles:view") ? fleetCount : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Recent fuel rows loaded</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums">
                {can("fuel:view") ? recentFuel : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((link) => (
          <Link key={link.href} href={link.href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/20">
              <CardHeader>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted">
                  <link.icon className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg">{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
