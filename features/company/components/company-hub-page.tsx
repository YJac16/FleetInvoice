"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileText } from "lucide-react";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listCompanies } from "@/services/companies.service";
import { listInvoices } from "@/services/invoices.service";
import { queryKeys } from "@/utils/query";

const LINKS = [
  {
    href: "/company/invoices",
    title: "Invoices",
    description: "Your company's invoices — open Print for a browser PDF.",
    icon: FileText,
    permission: "invoices:view" as const,
  },
  {
    href: "/company/reports",
    title: "Reports",
    description: "Trips and invoices for your company.",
    icon: BarChart3,
    permission: "reports:view" as const,
  },
];

const UNLINKED_MESSAGE =
  "Your company is not linked yet. Ask GoOps to link your login to your company.";

export function CompanyHubPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const visible = LINKS.filter((link) => can(link.permission));

  const companiesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.companies(organisationId)
      : ["companies", "none"],
    queryFn: () => listCompanies(organisationId!),
    enabled: Boolean(organisationId),
  });

  const companies = companiesQuery.data ?? [];
  const unlinked = companiesQuery.isSuccess && companies.length === 0;
  const companyName =
    companies.length > 0 ? companies.map((company) => company.name).join(", ") : null;

  const invoicesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.invoices(organisationId)
      : ["invoices", "none"],
    queryFn: () => listInvoices(organisationId!),
    enabled:
      Boolean(organisationId) && can("invoices:view") && companies.length > 0,
  });

  const openInvoices = (invoicesQuery.data ?? []).filter(
    (inv) =>
      inv.driver_id == null &&
      (inv.status === "issued" || inv.status === "draft")
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Company hub"
        description={
          companyName ?? "Summary and shortcuts for your company."
        }
      />

      {unlinked ? (
        <EmptyState title="Company not linked" description={UNLINKED_MESSAGE} />
      ) : !organisationId ? null : companiesQuery.isLoading ||
        invoicesQuery.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription>Open invoices</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums">
                {can("invoices:view") ? openInvoices : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {unlinked ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
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
      )}
    </div>
  );
}
